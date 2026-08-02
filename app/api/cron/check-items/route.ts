import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parseAnyDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        // Vercel Cron Secretの検証（オプション）
        const authHeader = request.headers.get('authorization');
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return new Response('Unauthorized', { status: 401 });
        }

        const now = new Date();

        // 1. 12時間前通知チェック（未完了の全申請対象）
        const { data: allActiveItems, error: activeError } = await supabaseAdmin
            .from('bid_requests')
            .select('id, product_id, product_title, product_url, product_end_time, status, customer_email, customer_message')
            .is('final_status', null);

        if (activeError) {
            console.error('Error fetching active items for 12h check:', activeError);
        }

        if (allActiveItems && allActiveItems.length > 0) {
            // 顧客IDマッピング用の user_roles を一括取得
            const { data: roles } = await supabaseAdmin
                .from('user_roles')
                .select('email, customer_id');

            const customerIdMap = new Map<string, string>();
            if (roles) {
                for (const r of roles) {
                    if (r.email && r.customer_id) {
                        customerIdMap.set(r.email.toLowerCase(), r.customer_id);
                    }
                }
            }

            const origin = new URL(request.url).origin;

            for (const item of allActiveItems) {
                // すでに12時間前通知済みの場合はスキップ
                if (item.customer_message && item.customer_message.includes('[12h_notified]')) continue;

                if (!item.product_end_time) continue;

                const endDate = parseAnyDateTime(item.product_end_time);
                if (!endDate) continue;

                // 残り時間（時間単位）を算出
                const diffMs = endDate.getTime() - now.getTime();
                const diffHours = diffMs / (1000 * 60 * 60);

                // 残り時間が 0超かつ12時間以下 の場合に管理者へプッシュ通知
                if (diffHours > 0 && diffHours <= 12) {
                    const customerId = (item.customer_email && customerIdMap.get(item.customer_email.toLowerCase())) || '不明';
                    const productTitle = item.product_title || item.product_id || '商品情報なし';

                    let title = '';
                    if (item.status === 'pending') {
                        title = '⏰ 【残り12時間】未確認の申請あり';
                    } else {
                        title = '🔔 【残り12時間】オークション終了間近';
                    }

                    const body = `商品: ${productTitle} (ID: ${customerId})`;

                    try {
                        await fetch(`${origin}/api/push-send`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                sendToAdmins: true,
                                title,
                                body,
                                url: '/admin'
                            })
                        });

                        // 重複送信を防止するため customer_message に追記
                        const updatedMsg = ((item.customer_message || '') + ' [12h_notified]').trim();
                        await supabaseAdmin
                            .from('bid_requests')
                            .update({ customer_message: updatedMsg })
                            .eq('id', item.id);
                    } catch (e) {
                        console.error(`Failed to send 12h notification for item ${item.id}:`, e);
                    }
                }
            }
        }

        // 2. オークション終了チェック（pending または approved のアイテムに対象を限定）
        const { data: items, error: fetchError } = await supabaseAdmin
            .from('bid_requests')
            .select('id, product_id, product_url, status, customer_email')
            .in('status', ['pending', 'approved'])
            .is('final_status', null);

        if (fetchError) throw fetchError;
        if (!items || items.length === 0) {
            return NextResponse.json({ message: '12h checks done. No items to check for end status.' });
        }

        const results = [];

        for (const item of items) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);

                // ヤフオクのページをチェック
                const res = await fetch(item.product_url, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
                
                clearTimeout(timeoutId);
                const html = await res.text();

                // 終了判定キーワード
                const isEnded = html.includes('終了しました') ||
                    html.includes('オークションは終了しました') ||
                    html.includes('再出品');

                if (isEnded) {
                    const { error: updateError } = await supabaseAdmin
                        .from('bid_requests')
                        .update({
                            final_status: 'ended_check_needed',
                            customer_message: 'Auction ended. Waiting for admin to confirm result.'
                        })
                        .eq('id', item.id);

                    if (!updateError) {
                        await fetch(`${new URL(request.url).origin}/api/push-send`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                sendToAdmins: true,
                                title: '🔚 オークション終了',
                                body: `商品の結果を確認してください`,
                                url: '/admin'
                            })
                        }).catch(e => console.error('Cron notify error:', e));

                        results.push({ id: item.id, status: 'updated_to_ended' });
                    }
                }
            } catch (e) {
                console.error(`Error checking item ${item.id}:`, e);
            }
        }

        return NextResponse.json({
            processed: items.length,
            updates: results.length,
            results
        });

    } catch (error) {
        console.error('Cron error:', error);
        return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
    }
}
