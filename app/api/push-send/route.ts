import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase-admin';

import { VAPID_PUBLIC_KEY } from '@/lib/constants';

// Web Push設定
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!;

webpush.setVapidDetails(
    'mailto:admin@jogalibre.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

export async function POST(request: NextRequest) {
    try {
        const { userId, email, title, body, url, sendToAdmins } = await request.json();

        let targetUserIds: string[] = [];

        if (sendToAdmins) {
            // 管理者全員のIDを取得
            const { data: adminUsers, error: adminError } = await supabaseAdmin
                .from('user_roles')
                .select('id')
                .eq('role', 'admin');

            if (adminError) {
                console.error('管理者取得エラー:', adminError);
                return NextResponse.json({ error: adminError.message }, { status: 500 });
            }
            if (adminUsers) {
                targetUserIds = adminUsers.map(u => u.id);
            }
        } else {
            // 個別ユーザー指定
            let targetUserId = userId;

            // emailが指定された場合、user_rolesからuser_idを検索
            if (!targetUserId && email) {
                const { data: userData } = await supabaseAdmin
                    .from('user_roles')
                    .select('id')
                    .eq('email', email)
                    .single();
                if (userData) {
                    targetUserId = userData.id;
                }
            }

            if (targetUserId) {
                targetUserIds = [targetUserId];
            }
        }

        if (targetUserIds.length === 0) {
            return NextResponse.json(
                { error: '送信対象のユーザーが見つかりません', sent: false },
                { status: 200 }
            );
        }

        // DBに通知履歴を常に記録（端末へPushが届くか否かにかかわらず、Webアプリ上の「Avisos/通知内容確認」モーダルで確実に履歴を閲覧可能にする）
        try {
            const logs = targetUserIds.map(uid => ({
                user_id: uid,
                title: title || 'JOGALIBRE',
                body: body || '',
                url: url || '/',
                is_read: false
            }));

            if (logs.length > 0) {
                const { error: logError } = await supabaseAdmin
                    .from('app_notifications')
                    .insert(logs);

                if (logError) console.error('通知履歴保存エラー:', logError);
            }
        } catch (dbErr) {
            console.error('DB保存クリティカルエラー:', dbErr);
        }

        // 対象ユーザーのプッシュサブスクリプションを一括取得
        const { data: subscriptions, error: fetchError } = await supabaseAdmin
            .from('push_subscriptions')
            .select('user_id, subscription')
            .in('user_id', targetUserIds);

        if (fetchError) {
            console.error('サブスクリプション取得エラー:', fetchError);
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!subscriptions || subscriptions.length === 0) {
            return NextResponse.json(
                { error: 'プッシュ通知が登録されていません（アプリ内通知履歴は保存されました）', sent: false },
                { status: 200 }
            );
        }

        // 通知ペイロード
        const payload = JSON.stringify({
            title: title !== undefined ? title : 'JOGALIBRE',
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
                } catch (err: unknown) {
                    if (err && typeof err === 'object' && 'statusCode' in err) {
                        const statusCode = (err as { statusCode: number }).statusCode;
                        if (statusCode === 410 || statusCode === 404) {
                            await supabaseAdmin
                                .from('push_subscriptions')
                                .delete()
                                .eq('user_id', sub.user_id);
                        }
                    }
                    console.error('プッシュ送信エラー:', err);
                    return { success: false, error: (err as Error).message };
                }
            })
        );

        const sentCount = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
        const sent = sentCount > 0;

        return NextResponse.json({ success: true, sent, sentCount });
    } catch (error) {
        console.error('通知送信エラー:', error);
        return NextResponse.json(
            { error: '通知の送信に失敗しました' },
            { status: 500 }
        );
    }
}
