import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: Request) {
  try {
    // 1. Vercel Cron からの認証チェック
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET) {
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        console.warn('Unauthorized cron execution attempt');
        return new NextResponse('Unauthorized', { status: 401 });
      }
    }

    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://jogalibre.com';

    // ユーザー言語マッピング・顧客情報用マップの準備
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('email, language, full_name, customer_id');

    const userRoleMap = new Map<string, { language: string; fullName: string; customerId: string }>();
    if (roles) {
      for (const r of roles) {
        if (r.email) {
          userRoleMap.set(r.email.toLowerCase(), {
            language: (r.language || 'es').toLowerCase(),
            fullName: r.full_name || '',
            customerId: r.customer_id || '',
          });
        }
      }
    }

    // ==========================================
    // A. 24時間経過時の自動確認処理
    // ==========================================
    const { data: autoConfirmRequests, error: autoConfirmError } = await supabaseAdmin
      .from('bid_requests')
      .select('id, customer_email, product_title, product_title_es, product_title_pt, customer_message')
      .eq('final_status', 'won')
      .eq('customer_confirmed', false)
      .not('won_at', 'is', null)
      .lte('won_at', twentyFourHoursAgo.toISOString());

    let autoConfirmedCount = 0;
    if (!autoConfirmError && autoConfirmRequests && autoConfirmRequests.length > 0) {
      const autoConfirmNotificationsPromises = [];
      const autoConfirmIds: string[] = [];

      for (const reqData of autoConfirmRequests) {
        const emailKey = (reqData.customer_email || '').toLowerCase();
        const userInfo = userRoleMap.get(emailKey) || { language: 'es', fullName: '', customerId: '' };
        const isPt = userInfo.language === 'pt';

        const itemTitle = isPt
          ? reqData.product_title_pt || reqData.product_title || 'Item'
          : reqData.product_title_es || reqData.product_title || 'Item';

        // 1. 顧客向け通知 (言語別)
        if (reqData.customer_email) {
          const custTitle = isPt ? '✅ Confirmação Automática' : '✅ Confirmación Automática';
          const custBody = isPt
            ? `Confirmado automaticamente: ${itemTitle}`
            : `Confirmado automáticamente: ${itemTitle}`;

          autoConfirmNotificationsPromises.push(
            fetch(`${baseUrl}/api/push-send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: reqData.customer_email,
                title: custTitle,
                body: custBody,
                url: '/',
              }),
            }).catch(err => console.error('Auto-confirm customer push error:', err))
          );
        }

        // 2. 管理者向け通知
        const custId = userInfo.customerId ? `(${userInfo.customerId})` : '';
        const custName = userInfo.fullName || reqData.customer_email || '顧客';
        const adminTitle = `✅ 【自動結果確認完了】${custName} ${custId}`.trim();
        const adminBody = `商品: ${reqData.product_title || 'Item'} (24h自動確認)`;

        autoConfirmNotificationsPromises.push(
          fetch(`${baseUrl}/api/push-send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sendToAdmins: true,
              bidRequestId: reqData.id,
              title: adminTitle,
              body: adminBody,
              url: '/admin',
            }),
          }).catch(err => console.error('Auto-confirm admin push error:', err))
        );

        autoConfirmIds.push(reqData.id);
      }

      await Promise.allSettled(autoConfirmNotificationsPromises);

      // DB更新: customer_confirmed を true に更新
      for (const reqData of autoConfirmRequests) {
        const updatedMsg = ((reqData.customer_message || '') + ' [Auto_Confirmed_24h]').trim();
        await supabaseAdmin
          .from('bid_requests')
          .update({
            customer_confirmed: true,
            customer_message: updatedMsg,
          })
          .eq('id', reqData.id);
      }

      autoConfirmedCount = autoConfirmIds.length;
    }

    // ==========================================
    // B. 12時間経過時のリマインド通知処理
    // ==========================================
    const { data: remindRequests, error: remindError } = await supabaseAdmin
      .from('bid_requests')
      .select('id, customer_email, product_title, product_title_es, product_title_pt')
      .eq('final_status', 'won')
      .eq('customer_confirmed', false)
      .is('unconfirmed_notified_at', null)
      .not('won_at', 'is', null)
      .lte('won_at', twelveHoursAgo.toISOString());

    if (remindError) {
      console.error('Error fetching unconfirmed orders:', remindError);
      return NextResponse.json({ error: 'Failed to fetch unconfirmed orders' }, { status: 500 });
    }

    let remindedCount = 0;
    if (remindRequests && remindRequests.length > 0) {
      const notificationsPromises = [];
      const notifiedIds: string[] = [];

      for (const reqData of remindRequests) {
        if (!reqData.customer_email) continue;

        const emailKey = reqData.customer_email.toLowerCase();
        const userInfo = userRoleMap.get(emailKey) || { language: 'es', fullName: '', customerId: '' };
        const isPt = userInfo.language === 'pt';

        const itemTitle = isPt
          ? reqData.product_title_pt || reqData.product_title || 'Item'
          : reqData.product_title_es || reqData.product_title || 'Item';

        const notifyTitle = isPt ? '🔔 Confirmação Pendente' : '🔔 Confirmación Pendiente';
        const notifyBody = isPt
          ? `Por favor, confirme o produto: ${itemTitle}`
          : `Por favor, confirme el producto: ${itemTitle}`;

        notificationsPromises.push(
          fetch(`${baseUrl}/api/push-send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: reqData.customer_email,
              title: notifyTitle,
              body: notifyBody,
              url: '/',
            }),
          }).catch(err => console.error('Unconfirmed order push error:', err))
        );

        notifiedIds.push(reqData.id);
      }

      await Promise.allSettled(notificationsPromises);

      // 通知済みフラグを更新
      if (notifiedIds.length > 0) {
        await supabaseAdmin
          .from('bid_requests')
          .update({ unconfirmed_notified_at: new Date().toISOString() })
          .in('id', notifiedIds);
      }

      remindedCount = notifiedIds.length;
    }

    return NextResponse.json({
      message: 'Processed unconfirmed orders successfully',
      remindedCount,
      autoConfirmedCount,
    });
  } catch (error) {
    console.error('Remind unconfirmed orders cron error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
