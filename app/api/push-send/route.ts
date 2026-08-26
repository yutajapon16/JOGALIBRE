import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { VAPID_PUBLIC_KEY } from '@/lib/constants';
import { sendEvolutionWhatsAppMessage } from '@/lib/whatsapp-evolution';

// Web Push設定
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!;

webpush.setVapidDetails(
    'mailto:admin@jogalibre.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

export async function POST(request: NextRequest) {
    try {
        const { userId, email, customerEmail, title, body, url, sendToAdmins, bidRequestId } = await request.json();
        const targetEmail = email || customerEmail;

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

            // emailが指定された場合、user_rolesからuser_idを検索（大文字小文字の差異を許容）
            if (!targetUserId && targetEmail) {
                const cleanEmail = targetEmail.trim().toLowerCase();
                const { data: userData } = await supabaseAdmin
                    .from('user_roles')
                    .select('id')
                    .ilike('email', cleanEmail)
                    .maybeSingle();
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

        // オプション: bidRequestIdが指定されている場合、DBから正確な商品名と翻訳を取得
        let bidReq: any = null;
        if (bidRequestId) {
            const { data: reqData } = await supabaseAdmin
                .from('bid_requests')
                .select('product_title, product_title_es, product_title_pt')
                .eq('id', bidRequestId)
                .single();
            if (reqData) bidReq = reqData;
        }

        // ユーザー権限・言語・WhatsApp番号・国情報を取得
        const { data: targetRoles } = await supabaseAdmin
            .from('user_roles')
            .select('id, role, language, whatsapp, country, full_name')
            .in('id', targetUserIds);
        
        const roleMap = new Map<string, any>();
        if (targetRoles) {
            targetRoles.forEach(r => roleMap.set(r.id, r));
        }

        // DBに通知履歴を各受信者の言語に合わせて記録
        try {
            const logs = targetUserIds.map(uid => {
                const uInfo = roleMap.get(uid);
                const isAdmin = uInfo?.role === 'admin';
                const uLang = uInfo?.language || 'es';

                let formattedBody = body || '';
                if (bidReq) {
                    if (isAdmin) {
                        formattedBody = `商品: ${bidReq.product_title || 'リクエスト商品'}`;
                    } else if (uLang === 'pt') {
                        formattedBody = `Produto: ${bidReq.product_title_pt || bidReq.product_title_es || bidReq.product_title}`;
                    } else {
                        formattedBody = `Producto: ${bidReq.product_title_es || bidReq.product_title_pt || bidReq.product_title}`;
                    }
                } else {
                    // bidReqがない場合もプレフィックスを受信者言語に強制補正
                    if (isAdmin) {
                        formattedBody = formattedBody.replace(/^(Producto|Produto):\s*/i, '商品: ');
                    } else if (uLang === 'pt') {
                        formattedBody = formattedBody.replace(/^(商品|Producto):\s*/i, 'Produto: ');
                    } else {
                        formattedBody = formattedBody.replace(/^(商品|Produto):\s*/i, 'Producto: ');
                    }
                }

                // 不要な「JOGALIBRE」「From 管理画面」「Administrador」タイトルを除正
                let cleanTitle = title || '';
                if (!cleanTitle || cleanTitle === 'JOGALIBRE' || cleanTitle === 'Administrador' || cleanTitle === '管理画面') {
                    cleanTitle = isAdmin ? '🔔 通知' : (uLang === 'pt' ? '🔔 Notificação' : '🔔 Notificación');
                }

                return {
                    user_id: uid,
                    title: cleanTitle,
                    body: formattedBody,
                    url: url || '/',
                    is_read: false
                };
            });

            if (logs.length > 0) {
                const { error: logError } = await supabaseAdmin
                    .from('app_notifications')
                    .insert(logs);

                if (logError) console.error('通知履歴保存エラー:', logError);
            }
        } catch (dbErr) {
            console.error('DB保存クリティカルエラー:', dbErr);
        }

        // --- 1. WhatsApp 同時通知処理（Evolution API） ---
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jogalibre.com';
        const targetUrl = url ? `${baseUrl.replace(/\/+$/, '')}${url.startsWith('/') ? url : `/${url}`}` : baseUrl;

        const whatsappPromises = targetUserIds.map(async (uid) => {
            const uInfo = roleMap.get(uid);
            const isAdmin = uInfo?.role === 'admin';
            const targetWhatsApp = uInfo?.whatsapp || (isAdmin ? process.env.ADMIN_WHATSAPP_NUMBER : null);
            if (!targetWhatsApp) return { success: false, skipped: true };

            const uLang = uInfo?.language || (isAdmin ? 'ja' : 'es');

            let formattedBody = body || '';
            if (bidReq) {
                if (isAdmin) {
                    formattedBody = `商品: ${bidReq.product_title || 'リクエスト商品'}`;
                } else if (uLang === 'pt') {
                    formattedBody = `Produto: ${bidReq.product_title_pt || bidReq.product_title_es || bidReq.product_title}`;
                } else {
                    formattedBody = `Producto: ${bidReq.product_title_es || bidReq.product_title_pt || bidReq.product_title}`;
                }
            } else {
                if (isAdmin) {
                    formattedBody = formattedBody.replace(/^(Producto|Produto):\s*/i, '商品: ');
                } else if (uLang === 'pt') {
                    formattedBody = formattedBody.replace(/^(商品|Producto):\s*/i, 'Produto: ');
                } else {
                    formattedBody = formattedBody.replace(/^(商品|Produto):\s*/i, 'Producto: ');
                }
            }

            let cleanTitle = title || '';
            if (!cleanTitle || cleanTitle === 'JOGALIBRE' || cleanTitle === 'Administrador' || cleanTitle === '管理画面') {
                cleanTitle = isAdmin ? '🔔 通知' : (uLang === 'pt' ? '🔔 Notificação' : '🔔 Notificación');
            }

            // WhatsApp用の見やすいフォーマット
            const messageLines = [
                `*JOGALIBRE*`,
                cleanTitle,
                formattedBody,
                '',
                targetUrl
            ].filter(line => line !== null && line !== undefined);

            const messageText = messageLines.join('\n');

            return await sendEvolutionWhatsAppMessage({
                to: targetWhatsApp,
                message: messageText,
                country: uInfo?.country || (isAdmin ? 'BR' : undefined)
            });
        });

        // --- 2. Web Push 通知処理 ---
        const { data: subscriptions, error: fetchError } = await supabaseAdmin
            .from('push_subscriptions')
            .select('user_id, subscription')
            .in('user_id', targetUserIds);

        if (fetchError) {
            console.error('サブスクリプション取得エラー:', fetchError);
        }

        const pushPromises = (subscriptions || []).map(async (sub) => {
            try {
                const uInfo = roleMap.get(sub.user_id);
                const isAdmin = uInfo?.role === 'admin';
                const uLang = uInfo?.language || 'es';

                let formattedBody = body || '新しい通知があります';
                if (bidReq) {
                    if (isAdmin) {
                        formattedBody = `商品: ${bidReq.product_title || 'リクエスト商品'}`;
                    } else if (uLang === 'pt') {
                        formattedBody = `Produto: ${bidReq.product_title_pt || bidReq.product_title_es || bidReq.product_title}`;
                    } else {
                        formattedBody = `Producto: ${bidReq.product_title_es || bidReq.product_title_pt || bidReq.product_title}`;
                    }
                } else {
                    if (isAdmin) {
                        formattedBody = formattedBody.replace(/^(Producto|Produto):\s*/i, '商品: ');
                    } else if (uLang === 'pt') {
                        formattedBody = formattedBody.replace(/^(商品|Producto):\s*/i, 'Produto: ');
                    } else {
                        formattedBody = formattedBody.replace(/^(商品|Produto):\s*/i, 'Producto: ');
                    }
                }

                let cleanTitle = title || '';
                if (!cleanTitle || cleanTitle === 'JOGALIBRE' || cleanTitle === 'Administrador' || cleanTitle === '管理画面') {
                    cleanTitle = isAdmin ? '🔔 通知' : (uLang === 'pt' ? '🔔 Notificação' : '🔔 Notificación');
                }

                const payload = JSON.stringify({
                    title: cleanTitle,
                    body: formattedBody,
                    icon: '/icons/customer-icon.png',
                    url: url || '/',
                });

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
        });

        // WhatsAppとWeb Pushを並列実行
        const [pushResults, whatsappResults] = await Promise.all([
            Promise.allSettled(pushPromises),
            Promise.allSettled(whatsappPromises)
        ]);

        const pushSentCount = pushResults.filter(
            (r) => r.status === 'fulfilled' && (r.value as any)?.success
        ).length;

        const whatsappSentCount = whatsappResults.filter(
            (r) => r.status === 'fulfilled' && (r.value as any)?.success
        ).length;

        const sent = pushSentCount > 0 || whatsappSentCount > 0;

        return NextResponse.json({
            success: true,
            sent,
            pushSentCount,
            whatsappSentCount,
            totalTargets: targetUserIds.length
        });
    } catch (error) {
        console.error('通知送信エラー:', error);
        return NextResponse.json(
            { error: '通知の送信に失敗しました' },
            { status: 500 }
        );
    }
}
