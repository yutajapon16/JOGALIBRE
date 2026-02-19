import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// Web Push設定
const VAPID_PUBLIC_KEY = 'BMgO11arVCaq8epmUOq7YtLPY8F2x2dyPl4bUvkx0c-T-6su72j0FR4Nd2CV8qgeEpDlCTCyvi9pfuFnguHkHUs';
const VAPID_PRIVATE_KEY = '4cb0XpnJ0b4H1-ZXVocTAqgavZR7s4_w1Vidgy-rN5g';

webpush.setVapidDetails(
    'mailto:export@joga.ltd',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
    try {
        const { userId, email, title, body, url } = await request.json();

        let targetUserId = userId;

        // emailが指定された場合、user_idを検索
        if (!targetUserId && email) {
            const { data: users } = await supabase.auth.admin.listUsers();
            const user = users?.users?.find(u => u.email === email);
            if (user) {
                targetUserId = user.id;
            }
        }

        if (!targetUserId) {
            return NextResponse.json(
                { error: 'ユーザーが見つかりません', sent: false },
                { status: 200 }
            );
        }

        // ユーザーのプッシュサブスクリプションを取得
        const { data: subscriptions, error: fetchError } = await supabase
            .from('push_subscriptions')
            .select('subscription')
            .eq('user_id', targetUserId);

        if (fetchError) {
            console.error('サブスクリプション取得エラー:', fetchError);
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!subscriptions || subscriptions.length === 0) {
            return NextResponse.json(
                { error: 'プッシュ通知が登録されていません', sent: false },
                { status: 200 }
            );
        }

        // 通知ペイロード
        const payload = JSON.stringify({
            title: title || 'JOGALIBRE',
            body: body || '新しい通知があります',
            icon: '/icons/customer-icon.png',
            url: url || '/',
        });

        // 各サブスクリプションに通知を送信
        const results = await Promise.allSettled(
            subscriptions.map(async (sub) => {
                try {
                    const pushSubscription = JSON.parse(sub.subscription);
                    await webpush.sendNotification(pushSubscription, payload);
                    return { success: true };
                } catch (err: any) {
                    // 無効なサブスクリプションを削除
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        await supabase
                            .from('push_subscriptions')
                            .delete()
                            .eq('user_id', targetUserId);
                    }
                    console.error('プッシュ送信エラー:', err);
                    return { success: false, error: err.message };
                }
            })
        );

        const sent = results.some(
            (r) => r.status === 'fulfilled' && r.value.success
        );

        return NextResponse.json({ success: true, sent });
    } catch (error) {
        console.error('通知送信エラー:', error);
        return NextResponse.json(
            { error: '通知の送信に失敗しました' },
            { status: 500 }
        );
    }
}
