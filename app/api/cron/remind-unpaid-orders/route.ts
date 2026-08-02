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

    // 2. 48時間前の時刻を計算
    const now = new Date();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // 3. 落札から48時間経過し、まだ未払いの注文を取得
    const { data: requests, error } = await supabaseAdmin
      .from('bid_requests')
      .select('id, customer_email, product_title')
      .eq('final_status', 'won')
      .is('unpaid_notified_at', null)
      .not('won_at', 'is', null)
      .lte('won_at', fortyEightHoursAgo.toISOString())
      .not('paid', 'is', true)
      .not('paid_brazil', 'is', true)
      .not('paid_paraguay', 'is', true)
      .not('paid_japan', 'is', true)
      .not('paid_local', 'is', true);

    if (error) {
      console.error('Error fetching unpaid orders:', error);
      return NextResponse.json({ error: 'Failed to fetch unpaid orders' }, { status: 500 });
    }

    if (!requests || requests.length === 0) {
      return NextResponse.json({ message: 'No unpaid orders to remind', count: 0 });
    }

    const notificationsPromises = [];
    const notifiedIds = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://jogalibre.com';
    
    // 4. プッシュ通知の送信処理
    for (const reqData of requests) {
      if (!reqData.customer_email) continue;
      
      const notifyTitle = '🔔 未払いのお知らせ';
      const notifyBody = `落札確定から48時間が経過しました。商品 [${reqData.product_title || 'Item'}] のお支払いをお願いします。`;

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
        }).catch(err => console.error('Unpaid order push error:', err))
      );

      notifiedIds.push(reqData.id);
    }

    await Promise.allSettled(notificationsPromises);

    // 5. 通知済みフラグを更新
    if (notifiedIds.length > 0) {
      await supabaseAdmin
        .from('bid_requests')
        .update({ unpaid_notified_at: new Date().toISOString() })
        .in('id', notifiedIds);
    }

    return NextResponse.json({
      message: 'Unpaid order reminders sent successfully',
      count: notifiedIds.length
    });
  } catch (error) {
    console.error('Remind unpaid orders cron error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
