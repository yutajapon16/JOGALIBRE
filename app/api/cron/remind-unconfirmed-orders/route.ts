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

    // 2. 12時間前の時刻を計算
    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    // 3. 落札から12時間経過し、まだ確認されていない注文を取得
    const { data: requests, error } = await supabaseAdmin
      .from('bid_requests')
      .select('id, customer_email, product_title')
      .eq('final_status', 'won')
      .eq('customer_confirmed', false)
      .is('unconfirmed_notified_at', null)
      .not('won_at', 'is', null)
      .lte('won_at', twelveHoursAgo.toISOString());

    if (error) {
      console.error('Error fetching unconfirmed orders:', error);
      return NextResponse.json({ error: 'Failed to fetch unconfirmed orders' }, { status: 500 });
    }

    if (!requests || requests.length === 0) {
      return NextResponse.json({ message: 'No unconfirmed orders to remind', count: 0 });
    }

    const notificationsPromises = [];
    const notifiedIds = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://jogalibre.com';
    
    // 4. プッシュ通知の送信処理
    for (const reqData of requests) {
      if (!reqData.customer_email) continue;
      
      const notifyTitle = '🔔 落札確定の確認待ち';
      const notifyBody = `商品 [${reqData.product_title || 'Item'}] の落札が確定しました。内容を確認してください。`;

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

    // 5. 通知済みフラグを更新
    if (notifiedIds.length > 0) {
      await supabaseAdmin
        .from('bid_requests')
        .update({ unconfirmed_notified_at: new Date().toISOString() })
        .in('id', notifiedIds);
    }

    return NextResponse.json({
      message: 'Unconfirmed order reminders sent successfully',
      count: notifiedIds.length
    });
  } catch (error) {
    console.error('Remind unconfirmed orders cron error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
