export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth-helpers';

const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_BASE_URL = 'https://api.asaas.com/v3';

/**
 * ASAAS APIへのリクエストを送信するヘルパー関数
 * タイムアウト（10秒）付き
 */
async function asaasRequest(endpoint: string, method: string, body?: any) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`${ASAAS_BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'access_token': ASAAS_API_KEY || '',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(`[ASAAS API] エラー ${endpoint}:`, data);
      return { error: true, status: res.status, data };
    }

    return { error: false, data };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error(`[ASAAS API] タイムアウト: ${endpoint}`);
      return { error: true, status: 408, data: { message: 'ASAAS API timeout' } };
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * ASAAS上で顧客を検索し、存在しなければ新規作成する
 * CPF/CNPJで検索し、一致する顧客がいればそのIDを返す
 */
async function findOrCreateAsaasCustomer(
  name: string,
  email: string,
  cpfCnpj: string,
  phone?: string
): Promise<{ customerId: string | null; error?: string }> {
  // 1. CPF/CNPJで既存顧客を検索
  const searchResult = await asaasRequest(
    `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}`,
    'GET'
  );

  if (!searchResult.error && searchResult.data?.data?.length > 0) {
    // 既存顧客が見つかった
    return { customerId: searchResult.data.data[0].id };
  }

  // 電話番号の整形（ブラジルの国番号 55 を除去する）
  let formattedPhone = phone?.replace(/[^0-9]/g, '') || undefined;
  if (formattedPhone && formattedPhone.startsWith('55') && (formattedPhone.length === 12 || formattedPhone.length === 13)) {
    formattedPhone = formattedPhone.substring(2);
  }

  // 2. 新規顧客を作成
  const createResult = await asaasRequest('/customers', 'POST', {
    name,
    email,
    cpfCnpj: cpfCnpj.replace(/[.\-\/]/g, ''), // フォーマット文字を除去
    mobilePhone: formattedPhone,
    externalReference: email, // 自システムのメールアドレスで紐づけ
    notificationDisabled: true // ASAASからの自動通知（SMS/Email等）を無効化
  });

  if (createResult.error) {
    return { customerId: null, error: createResult.data?.errors?.[0]?.description || 'ASAAS顧客作成に失敗' };
  }

  return { customerId: createResult.data.id };
}

/**
 * ASAAS決済を作成するPOSTエンドポイント
 *
 * リクエストボディ:
 * {
 *   billingType: 'PIX' | 'CREDIT_CARD',
 *   items: [{ id: string, amount: number }],  // bid_request IDと金額（BRL）
 *   totalAmount: number,                       // 合計金額（BRL）
 *   cpfCnpj?: string,                          // CPF/CNPJ（未登録時にフロントから送信）
 *   description?: string
 * }
 */
export async function POST(request: Request) {
  try {
    // 1. 認証チェック
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ASAAS_API_KEY) {
      console.error('[ASAAS Payment] APIキーが設定されていません');
      return NextResponse.json({ error: 'Payment service not configured' }, { status: 500 });
    }

    // 2. リクエストボディのパース
    const body = await request.json();
    const { billingType, items, totalAmount, cpfCnpj, description } = body;

    if (!billingType || !items || !totalAmount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['PIX', 'CREDIT_CARD'].includes(billingType)) {
      return NextResponse.json({ error: 'Invalid billingType. Must be PIX or CREDIT_CARD' }, { status: 400 });
    }

    // 3. ユーザー情報を取得
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('full_name, email, whatsapp, cpf')
      .eq('id', user.id)
      .single();

    if (!userRole) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // CPF/CNPJの決定（リクエストから送信された値を優先、なければDBの値を使用）
    const finalCpfCnpj = cpfCnpj || userRole.cpf;

    if (!finalCpfCnpj) {
      return NextResponse.json({
        error: 'CPF/CNPJ is required for payment',
        requiresCpf: true
      }, { status: 400 });
    }

    // 4. CPF/CNPJが新しく送信された場合、DBに保存
    if (cpfCnpj && cpfCnpj !== userRole.cpf) {
      await supabaseAdmin
        .from('user_roles')
        .update({ cpf: cpfCnpj })
        .eq('id', user.id);
    }

    // 5. ASAAS顧客の検索/作成
    const { customerId, error: customerError } = await findOrCreateAsaasCustomer(
      userRole.full_name || user.email || 'Cliente',
      userRole.email || user.email || '',
      finalCpfCnpj,
      userRole.whatsapp
    );

    if (!customerId) {
      return NextResponse.json({
        error: customerError || 'Failed to create ASAAS customer'
      }, { status: 500 });
    }

    // 6. 請求の説明文を生成
    const itemIds = items.map((item: any) => item.id);
    const paymentDescription = description ||
      `JOGALIBRE - ${items.length} ${items.length === 1 ? 'item' : 'itens'}`;

    // 7. ASAAS請求を作成
    // externalReferenceにbid_request IDをカンマ区切りで設定（Webhook連携用）
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3); // 3日後が期限

    const paymentPayload: any = {
      customer: customerId,
      billingType,
      value: totalAmount,
      dueDate: dueDate.toISOString().split('T')[0],
      description: paymentDescription,
      externalReference: itemIds.join(','),
    };

    const paymentResult = await asaasRequest('/payments', 'POST', paymentPayload);

    if (paymentResult.error) {
      const errorMsg = paymentResult.data?.errors?.[0]?.description || 'Payment creation failed';
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    const payment = paymentResult.data;

    // 8. PIXの場合はQRコードを取得
    let pixData = null;
    if (billingType === 'PIX') {
      // 少し待ってからQRコードを取得（ASAASがPIX情報を生成するまでの待機）
      await new Promise(resolve => setTimeout(resolve, 1000));

      const pixResult = await asaasRequest(`/payments/${payment.id}/pixQrCode`, 'GET');

      if (!pixResult.error) {
        pixData = {
          qrCodeImage: pixResult.data.encodedImage,  // base64エンコードされたQRコード画像
          qrCodeText: pixResult.data.payload,          // コピー用PIXコード
          expirationDate: pixResult.data.expirationDate,
        };
      }
    }

    // 9. レスポンスを返す
    return NextResponse.json({
      success: true,
      paymentId: payment.id,
      billingType,
      value: payment.value,
      status: payment.status,
      invoiceUrl: payment.invoiceUrl,    // カード決済ページURL
      bankSlipUrl: payment.bankSlipUrl,  // ボレトURL（将来用）
      dueDate: payment.dueDate,
      pix: pixData,
      itemIds,
    });

  } catch (error: any) {
    console.error('[ASAAS Payment] エラー:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
