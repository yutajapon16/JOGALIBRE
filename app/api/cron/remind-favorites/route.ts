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
    } else {
      console.warn('Warning: CRON_SECRET env variable is not set.');
    }

    // 2. 現在時刻から1時間後の時刻を計算
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

    // 3. 終了時刻が現在〜1時間後で、未通知のお気に入りを取得
    const { data: favorites, error } = await supabaseAdmin
      .from('favorites')
      .select('id, user_id, product_title, end_time')
      .eq('notified', false)
      .not('end_time', 'is', null)
      .lte('end_time', oneHourLater.toISOString())
      .gt('end_time', now.toISOString());

    if (error) {
      console.error('Error fetching favorites for reminder:', error);
      return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 });
    }

    if (!favorites || favorites.length === 0) {
      return NextResponse.json({ message: 'No favorites to remind', count: 0 });
    }

    // 通知対象のユーザーIDリストからユーザー情報を取得
    const userIds = [...new Set(favorites.map(f => f.user_id))];
    const { data: users } = await supabaseAdmin
      .from('user_roles')
      .select('id, email, language')
      .in('id', userIds);

    const userMap = new Map(users?.map(u => [u.id, u]) || []);

    const notificationsPromises = [];
    const notifiedIds = [];

    // 4. プッシュ通知の送信処理
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://jogalibre.com';
    
    for (const fav of favorites) {
      const user = userMap.get(fav.user_id);
      if (!user || !user.email) continue;

      const lang = user.language || 'es';
      
      const notifyTitle = lang === 'pt' ? '⏳ Leilão terminando em breve!' : '⏳ ¡Subasta terminando pronto!';
      const notifyBody = lang === 'pt' 
        ? `Produto: ${fav.product_title || 'Item'}`
        : `Producto: ${fav.product_title || 'Item'}`;

      // 通知送信リクエストを配列に追加
      notificationsPromises.push(
        fetch(`${baseUrl}/api/push-send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            title: notifyTitle,
            body: notifyBody,
            url: '/',
          }),
        }).catch(err => console.error('Favorite reminder push error:', err))
      );

      notifiedIds.push(fav.id);
    }

    // 全ての通知を送信
    await Promise.allSettled(notificationsPromises);

    // 5. 通知済みフラグを更新
    if (notifiedIds.length > 0) {
      await supabaseAdmin
        .from('favorites')
        .update({ notified: true })
        .in('id', notifiedIds);
    }

    return NextResponse.json({
      message: 'Reminders sent successfully',
      count: notifiedIds.length
    });
  } catch (error) {
    console.error('Remind favorites cron error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
