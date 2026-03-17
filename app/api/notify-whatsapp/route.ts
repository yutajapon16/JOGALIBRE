import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { getUserFromRequest, getUserInfoByEmail } from '@/lib/auth-helpers';

export async function POST(request: Request) {
  try {
    // 認証チェック
    const authUser = await getUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userType, email } = body;

    if (userType === 'admin') {
      // 管理者が送信：未確認の顧客に通知
      const { data: pendingRequests } = await supabaseAdmin
        .from('bid_requests')
        .select('customer_email, customer_name, product_title, language, status, final_status')
        .eq('customer_confirmed', false)
        .order('created_at', { ascending: false });

      if (!pendingRequests || pendingRequests.length === 0) {
        return NextResponse.json({
          success: false,
          message: '通知する更新がありません（未確認リクエスト: 0件）'
        });
      }

      // 顧客ごとにグループ化
      const customerGroups = new Map<string, Record<string, unknown>[]>();
      for (const req of pendingRequests) {
        if (!customerGroups.has(req.customer_email)) {
          customerGroups.set(req.customer_email, []);
        }
        customerGroups.get(req.customer_email)!.push(req);
      }

      // 各顧客にWhatsApp送信（並列処理によりVercelタイムアウトを回避）
      // ※TwilioのAPI制限に配慮し、10件ずつのチャンク（束）で並列実行する
      const results: {
        email: string;
        whatsapp: string | null;
        success: boolean;
        error?: string;
        outsideWindow?: boolean;
        reason?: string;
      }[] = [];
      const entries = Array.from(customerGroups.entries());
      const CHUNK_SIZE = 10;

      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        const chunk = entries.slice(i, i + CHUNK_SIZE);
        
        const chunkPromises = chunk.map(async ([customerEmail, requests]) => {
          const userInfo = await getUserInfoByEmail(customerEmail);

          if (!userInfo?.whatsapp) {
            return {
              email: customerEmail,
              whatsapp: null,
              success: false,
              reason: 'WhatsApp番号未登録'
            };
          }

          const count = requests.length;
          const message = `🔔 JOGALIBRE: Tienes ${count} solicitud(es) con actualizaciones. / Você tem ${count} solicitação(ões) com atualizações.\nRevisa tu panel / Confira seu painel: https://jogalibre.vercel.app/`;

          try {
            const result = await sendWhatsAppMessage(userInfo.whatsapp, message);
            return {
              email: customerEmail,
              whatsapp: userInfo.whatsapp,
              success: result.success,
              error: result.error,
              outsideWindow: result.outsideWindow || false
            };
          } catch (e: unknown) {
            console.error(`Error sending to ${customerEmail}:`, e);
            const error = e as Error;
            return {
              email: customerEmail,
              whatsapp: userInfo.whatsapp,
              success: false,
              error: error.message || 'Unknown error',
              outsideWindow: false
            };
          }
        });

        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);
      }

      const outsideWindowCount = results.filter(r => r.outsideWindow).length;

      return NextResponse.json({
        success: true,
        notificationsSent: results.filter(r => r.success).length,
        total: results.length,
        outsideWindow: outsideWindowCount > 0,
        outsideWindowCount,
        details: results
      });

    } else if (userType === 'customer') {
      // 顧客が送信：未完了（customer_confirmed=false）の自分のリクエストを管理者に通知
      const { data: myRequests } = await supabaseAdmin
        .from('bid_requests')
        .select('customer_name, product_title, status, final_status')
        .eq('customer_email', email)
        .eq('customer_confirmed', false)
        .order('created_at', { ascending: false });

      if (!myRequests || myRequests.length === 0) {
        return NextResponse.json({
          success: false,
          message: 'No hay solicitudes pendientes que requieran atención del administrador'
        });
      }

      const adminWhatsApp = process.env.ADMIN_WHATSAPP_NUMBER;

      if (!adminWhatsApp) {
        console.error('ADMIN_WHATSAPP_NUMBER is not set in environment variables');
        return NextResponse.json({
          success: false,
          message: 'Admin WhatsApp no configurado'
        });
      }

      const customerName = myRequests[0].customer_name;
      const count = myRequests.length;

      // 共通ヘルパーで氏名を取得
      const userInfo = await getUserInfoByEmail(email);
      const displayName = userInfo?.full_name || customerName;

      const message = `🔔 JOGALIBRE: ${displayName} 様から ${count} 件の確認待ちリクエストがあります。\n管理画面: https://jogalibre.vercel.app/admin`;

      const result = await sendWhatsAppMessage(adminWhatsApp, message);

      return NextResponse.json({
        success: result.success,
        notificationsSent: result.success ? 1 : 0,
        error: result.error,
        outsideWindow: result.outsideWindow || false
      });
    }

    return NextResponse.json({
      success: false,
      message: 'Tipo de usuario inválido'
    });

  } catch (error) {
    console.error('WhatsApp notification error:', error);
    return NextResponse.json(
      { error: 'Failed to send notifications' },
      { status: 500 }
    );
  }
}