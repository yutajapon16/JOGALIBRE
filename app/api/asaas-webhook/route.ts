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

/**
 * 支払い確認時の処理
 * externalReferenceにbid_requestのIDが設定されている場合、
 * 該当するbid_requestのpaid_brazilフラグをtrueに更新する
 */
async function handlePaymentConfirmed(payment: AsaasWebhookPayload['payment']) {
  const bidRequestId = payment.externalReference;

  if (!bidRequestId) {
    console.log(`[ASAAS Webhook] externalReferenceが設定されていないため、bid_requestの更新をスキップ: ${payment.id}`);
    return;
  }

  try {
    // bid_requestsテーブルの支払いステータスを更新
    const { data, error } = await supabaseAdmin
      .from('bid_requests')
      .update({
        paid_brazil: true,
        paid_brazil_at: new Date().toISOString(),
        payment_method: `asaas_${payment.billingType.toLowerCase()}`
      })
      .eq('id', bidRequestId)
      .select('id, product_title, customer_email')
      .single();

    if (error) {
      console.error(`[ASAAS Webhook] bid_request更新エラー (ID: ${bidRequestId}):`, error);
      return;
    }

    if (data) {
      console.log(`[ASAAS Webhook] 支払い確認完了: bid_request=${data.id}, 商品=${data.product_title}, 金額=${payment.value} BRL`);
    }
  } catch (err) {
    console.error(`[ASAAS Webhook] handlePaymentConfirmed エラー:`, err);
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
