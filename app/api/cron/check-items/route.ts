import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        // Vercel Cron Secretの検証（オプション）
        const authHeader = request.headers.get('authorization');
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            // return new Response('Unauthorized', { status: 401 });
        }

        // チェック対象：保留中または承認済みの依頼
        const { data: items, error: fetchError } = await supabaseAdmin
            .from('bid_requests')
            .select('id, product_id, product_url, status, customer_email')
            .in('status', ['pending', 'approved'])
            .is('final_status', null);

        if (fetchError) throw fetchError;
        if (!items || items.length === 0) {
            return NextResponse.json({ message: 'No items to check' });
        }

        const results = [];

        for (const item of items) {
            try {
                // ヤフオクのページをチェック
                const res = await fetch(item.product_url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
                const html = await res.text();

                // 終了判定キーワード
                const isEnded = html.includes('終了しました') ||
                    html.includes('オークションは終了しました') ||
                    html.includes('再出品');

                if (isEnded) {
                    // ステータスを「finished」（または適切な中間ステータス）に更新
                    // ここでは管理者に「結果確認」を促すためのフラグを立てるか、final_statusを仮置きする
                    const { error: updateError } = await supabaseAdmin
                        .from('bid_requests')
                        .update({
                            final_status: 'ended_check_needed',
                            customer_message: 'Auction ended. Waiting for admin to confirm result.'
                        })
                        .eq('id', item.id);

                    if (!updateError) {
                        // 管理者に通知
                        await fetch(`${new URL(request.url).origin}/api/push-send`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                sendToAdmins: true,
                                title: 'Auction Ended',
                                body: `Check result for: ${item.product_id}`,
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
