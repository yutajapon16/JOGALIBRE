export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// ASAAS Webhook認証トークン（環境変数から取得）
const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN;

/**
 * ASAASから送信されるWebhookイベントのペイロード型定義
 */
interface AsaasWebhookPayload {
  event: string;
  payment: {
    id: string;
    customer: string;
    value: number;
    netValue: number;
    billingType: string;
    status: string;
    dueDate: string;
    paymentDate?: string;
    confirmedDate?: string;
    externalReference?: string;
    description?: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
    pixTransaction?: {
      endToEndIdentifier?: string;
    };
  };
}

/**
 * ASAASからのWebhook通知を受信するエンドポイント
 *
 * ASAASは支払いステータスが変わるたびにこのエンドポイントにPOSTリクエストを送信します。
 * リクエストヘッダーの `asaas-access-token` でリクエストの正当性を検証します。
 *
 * 主な処理:
 * - PAYMENT_CONFIRMED / PAYMENT_RECEIVED: bid_requestsの支払いステータスを更新
 * - PAYMENT_OVERDUE: 期限切れの支払いをログに記録
 * - PAYMENT_REFUNDED: 返金処理のログ記録
 */
export async function POST(request: Request) {
  try {
    // 1. 認証トークンの検証
    const accessToken = request.headers.get('asaas-access-token');

    if (ASAAS_WEBHOOK_TOKEN && accessToken !== ASAAS_WEBHOOK_TOKEN) {
      console.error('[ASAAS Webhook] 認証トークンが一致しません');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. リクエストボディのパース
    const payload: AsaasWebhookPayload = await request.json();
    const { event, payment } = payload;

    if (!event || !payment) {
      console.error('[ASAAS Webhook] 不正なペイロード:', JSON.stringify(payload).slice(0, 500));
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      );
    }

    console.log(`[ASAAS Webhook] イベント受信: ${event}, 支払いID: ${payment.id}, 金額: ${payment.value}`);

    // 3. Webhookイベントログをデータベースに保存（冪等性確保のため）
    const { data: existingLog } = await supabaseAdmin
      .from('asaas_webhook_logs')
      .select('id')
      .eq('payment_id', payment.id)
      .eq('event', event)
      .maybeSingle();

    if (existingLog) {
      // 同じイベントが重複送信された場合はスキップ（冪等性）
      console.log(`[ASAAS Webhook] 重複イベントをスキップ: ${event}, 支払いID: ${payment.id}`);
      return NextResponse.json({ received: true, duplicate: true });
    }

    // ログを保存
    await supabaseAdmin
      .from('asaas_webhook_logs')
      .insert({
        payment_id: payment.id,
        event,
        status: payment.status,
        value: payment.value,
        billing_type: payment.billingType,
        external_reference: payment.externalReference || null,
        raw_payload: payload,
        processed: false
      });

    // 4. イベントごとの処理分岐
    switch (event) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED':
        await handlePaymentConfirmed(payment);
        break;

      case 'PAYMENT_OVERDUE':
        console.log(`[ASAAS Webhook] 支払い期限切れ: ${payment.id}, 顧客: ${payment.customer}`);
        break;

      case 'PAYMENT_REFUNDED':
      case 'PAYMENT_PARTIALLY_REFUNDED':
        console.log(`[ASAAS Webhook] 返金処理: ${payment.id}, 金額: ${payment.value}`);
        break;

      case 'PAYMENT_DELETED':
        console.log(`[ASAAS Webhook] 支払い削除: ${payment.id}`);
        break;

      case 'PAYMENT_CREATED':
        console.log(`[ASAAS Webhook] 新規支払い作成: ${payment.id}, 金額: ${payment.value}`);
        break;

      default:
        console.log(`[ASAAS Webhook] 未処理イベント: ${event}`);
    }

    // 5. 処理済みフラグを更新
    await supabaseAdmin
      .from('asaas_webhook_logs')
      .update({ processed: true })
      .eq('payment_id', payment.id)
      .eq('event', event);

    // ASAASにはHTTP 200を迅速に返す必要がある
    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    console.error('[ASAAS Webhook] エラー:', error);
    // エラーが発生しても200を返す（ASAASのリトライを防ぐため）
    // 内部的なエラーログは上記のconsole.errorで記録される
    return NextResponse.json({ received: true, error: 'Internal processing error' });
  }
}

import { generateAndUploadReceipt } from '@/lib/receipt-generator';
import { sendReceiptEmail } from '@/lib/resend';

/**
 * 支払い確認時の処理
 * externalReferenceにbid_requestのIDが設定されている場合、
 * 該当するbid_requestを更新し、入金データを作成、領収書を発行する
 */
async function handlePaymentConfirmed(payment: AsaasWebhookPayload['payment']) {
  const bidRequestIds = payment.externalReference?.split(',').map(id => id.trim()).filter(id => id);

  if (!bidRequestIds || bidRequestIds.length === 0) {
    console.log(`[ASAAS Webhook] externalReferenceが設定されていないため、更新をスキップ: ${payment.id}`);
    return;
  }

  try {
    // 1. 対象の bid_requests を取得
    const { data: items, error: itemsError } = await supabaseAdmin
      .from('bid_requests')
      .select('id, total_jpy, customer_email, customer_name, final_price, customer_counter_offer, customer_counter_offer_used, counter_offer, max_bid, customer_id')
      .in('id', bidRequestIds);

    if (itemsError || !items || items.length === 0) {
      console.error(`[ASAAS Webhook] bid_requests 取得エラー:`, itemsError);
      return;
    }

    // 2. payment_settings を取得して為替レートを確認
    const { data: settings } = await supabaseAdmin
      .from('payment_settings')
      .select('rates')
      .single();

    const brlRate = settings?.rates?.BRL || 5.65;
    const jpyRate = settings?.rates?.JPY || 150;

    // 3. 内訳（Line A / Line B）の計算
    // JOGA立替金（日本支払額）の合計を計算
    const totalJpySum = items.reduce((sum, item) => sum + (Number(item.total_jpy) || 0), 0);
    
    // BRLでの立替金額 = (JPY / JPYレート) * BRLレート
    let thirdPartyRepasseBrl = (totalJpySum / jpyRate) * brlRate;
    
    // もし総支払額より立替金が上回ってしまうなどの異常があれば調整
    if (thirdPartyRepasseBrl > payment.value) {
      thirdPartyRepasseBrl = payment.value * 0.9; // セーフティ（本来は起こらない）
    }

    const systemFeeBrl = payment.value - thirdPartyRepasseBrl;

    // 4. deposits テーブルに入金レコードを作成
    const usdEquivalent = items.reduce((sum, item) => {
      const price = item.final_price || (item.customer_counter_offer && !item.customer_counter_offer_used ? item.customer_counter_offer : (item.counter_offer || item.max_bid || 0));
      return sum + price;
    }, 0) || (payment.value / brlRate);
    
    // customer_id が bid_requests にない場合は user_roles から取得
    let customerId = items[0].customer_id;
    if (!customerId && items[0].customer_email) {
      const { data: userRole } = await supabaseAdmin
        .from('user_roles')
        .select('customer_id')
        .eq('email', items[0].customer_email)
        .single();
      if (userRole?.customer_id) {
        customerId = userRole.customer_id;
      }
    }

    const { data: newDeposit, error: depositError } = await supabaseAdmin
      .from('deposits')
      .insert({
        customer_id: customerId || 'UNKNOWN',
        amount: payment.value,
        usd_amount: usdEquivalent,
        deposit_date: new Date().toISOString().split('T')[0],
        payment_method: payment.billingType === 'PIX' ? 'pix_brl' : 'card_brl',
        deposit_type: '商品代金',
      })
      .select('id')
      .single();

    if (depositError || !newDeposit) {
      console.error('[ASAAS Webhook] deposits 作成エラー:', depositError);
      return;
    }

    // 5. bid_requests のステータスを更新
    const { error: updateError } = await supabaseAdmin
      .from('bid_requests')
      .update({
        status: 'won', // 支払済（落札済）ステータスへ
        final_status: 'won', // DBのカラム名はスネークケース
        paid_brazil: true,
        paid_brazil_at: new Date().toISOString(),
        paid: true,
        is_paid: true,
        paid_at: new Date().toISOString(),
      })
      .in('id', bidRequestIds);

    if (updateError) {
      console.error('[ASAAS Webhook] bid_requests 更新エラー:', updateError);
    }

    // 6. 領収書 (PDF) の生成と保存
    const customerName = items[0].customer_name || 'Cliente';
    const customerEmail = items[0].customer_email;
    
    const receiptUrl = await generateAndUploadReceipt({
      receiptNumber: payment.id.replace('pay_', '').substring(0, 8).toUpperCase(),
      customerName: customerName,
      customerCpfCnpj: '', // ASAAS payloadに無いため省略、またはAPIで顧客情報を引くことも可能
      paymentDate: new Date().toLocaleDateString('pt-BR'),
      totalAmountBrl: payment.value,
      systemFeeBrl: systemFeeBrl,
      thirdPartyRepasseBrl: thirdPartyRepasseBrl,
      paymentMethod: payment.billingType === 'PIX' ? 'PIX' : 'Cartão de Crédito',
    });

    if (receiptUrl) {
      // 7. deposits に receipt_url を保存
      await supabaseAdmin
        .from('deposits')
        .update({ receipt_url: receiptUrl })
        .eq('id', newDeposit.id);

      // 8. 顧客へメール送信
      if (customerEmail) {
        try {
          await sendReceiptEmail(customerEmail, receiptUrl, payment.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
        } catch (emailErr) {
          console.error('[ASAAS Webhook] メール送信エラー:', emailErr);
        }
      }
    }

    // 9. NFS-e (Nota Fiscal) 自動発行APIの呼び出し（現在はコメントアウト）
    /*
    try {
      // ASAAS APIで NFS-e を発行する処理
      // SystemFeeBrl (Line A) に対してのみ発行する
      const invoicePayload = {
        payment: payment.id,
        installment: null,
        customer: payment.customer,
        serviceDescription: 'Taxa de Serviço do Sistema (Intermediação)',
        observations: 'Emissão automática via JOGALIBRE',
        value: systemFeeBrl,
        deductions: 0,
        effectiveDate: new Date().toISOString().split('T')[0],
        municipalServiceId: '10.02', // ※実際の市役所のサービスコード（仲介業など）に変更が必要
        municipalServiceCode: '10.02',
        municipalServiceName: 'Agenciamento, corretagem ou intermediação',
        updatePayment: false, // 支払金額自体は変更しない
      };
      
      // await asaasRequest('/invoices', 'POST', invoicePayload);
      console.log(`[ASAAS Webhook] NFS-e emissão (desativada). Valor: R$ ${systemFeeBrl}`);
    } catch (nfsErr) {
      console.error('[ASAAS Webhook] NFS-e erro:', nfsErr);
    }
    */

    console.log(`[ASAAS Webhook] 支払い確認・全処理完了: payment=${payment.id}, items=${bidRequestIds.length}件`);
  } catch (err) {
    console.error(`[ASAAS Webhook] handlePaymentConfirmed 致命的エラー:`, err);
  }
}

/**
 * GETリクエスト: Webhookエンドポイントの動作確認用
 * ASAASがURLの到達確認を行う際に使用される
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'ASAAS Webhook endpoint is active'
  });
}
