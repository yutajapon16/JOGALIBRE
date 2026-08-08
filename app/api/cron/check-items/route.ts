import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parseAnyDateTime, calculateDefaultFobCost, calculateDefaultShippingCost } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * パターンA（FOB・国内送料・利益率込み）の概算USD価格を計算するヘルパー
 */
function computePatternAUsd(
    jpyPrice: number,
    title?: string | null,
    url?: string | null,
    profitDivisor: number = 0.6,
    jpyRate: number = 150
): number {
    const fob = calculateDefaultFobCost(title, url);
    const shipping = calculateDefaultShippingCost(title, url);
    const totalJpy = jpyPrice + fob + shipping;
    const priceWithProfit = totalJpy / profitDivisor;
    const usdPrice = priceWithProfit / jpyRate;
    return Math.ceil(usdPrice / 10) * 10;
}

export async function GET(request: Request) {
    try {
        // Vercel Cron Secretの検証（オプション）
        const authHeader = request.headers.get('authorization');
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return new Response('Unauthorized', { status: 401 });
        }

        const now = new Date();
        const origin = new URL(request.url).origin;

        // 最新の為替レート（USD/JPY）を取得（なければデフォルト 150）
        let jpyRate = 150;
        try {
            const { data: exData } = await supabaseAdmin
                .from('exchange_rates')
                .select('rate')
                .eq('target_currency', 'JPY')
                .single();
            if (exData && exData.rate) {
                jpyRate = Number(exData.rate);
            }
        } catch {
            // パース失敗時はデフォルトを使用
        }

        // 顧客ID・言語・ロール等のユーザー情報を一括取得
        const { data: roles } = await supabaseAdmin
            .from('user_roles')
            .select('email, customer_id, language, role, country, agent_customer_id');

        const userRoleMap = new Map<string, any>();
        if (roles) {
            for (const r of roles) {
                if (r.email) {
                    userRoleMap.set(r.email.toLowerCase(), r);
                }
            }
        }

        // -------------------------------------------------------------
        // 1. 12時間前通知チェック（未完了の全申請対象）
        // -------------------------------------------------------------
        const { data: allActiveItems, error: activeError } = await supabaseAdmin
            .from('bid_requests')
            .select('id, product_id, product_title, product_url, product_end_time, status, customer_email, customer_message')
            .is('final_status', null);

        if (activeError) {
            console.error('Error fetching active items for 12h check:', activeError);
        }

        if (allActiveItems && allActiveItems.length > 0) {
            for (const item of allActiveItems) {
                if (item.customer_message && item.customer_message.includes('[12h_notified]')) continue;
                if (!item.product_end_time) continue;

                const endDate = parseAnyDateTime(item.product_end_time);
                if (!endDate) continue;

                const diffMs = endDate.getTime() - now.getTime();
                const diffHours = diffMs / (1000 * 60 * 60);

                if (diffHours > 0 && diffHours <= 12) {
                    const userMeta = item.customer_email ? userRoleMap.get(item.customer_email.toLowerCase()) : null;
                    const customerId = userMeta?.customer_id || '不明';
                    const productTitle = item.product_title || item.product_id || '商品情報なし';

                    const title = item.status === 'pending'
                        ? '⏰ 【残り12時間】未確認の申請あり'
                        : '🔔 【残り12時間】オークション終了間近';

                    const body = `商品: ${productTitle} (顧客: ${customerId})`;

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

        // -------------------------------------------------------------
        // 2. 残り時間に応じた動的スケジュールチェック & 価格更新・通知
        // -------------------------------------------------------------
        const { data: items, error: fetchError } = await supabaseAdmin
            .from('bid_requests')
            .select('id, product_id, product_title, product_url, product_end_time, status, customer_email, product_price, max_bid, customer_message')
            .in('status', ['pending', 'approved'])
            .is('final_status', null);

        if (fetchError) throw fetchError;
        if (!items || items.length === 0) {
            return NextResponse.json({ message: 'Checks completed. No active items to process.' });
        }

        const results = [];

        for (const item of items) {
            try {
                const msgStr = item.customer_message || '';
                const userMeta = item.customer_email ? userRoleMap.get(item.customer_email.toLowerCase()) : null;
                const lang = userMeta?.language || 'pt'; // デフォルトはポルトガル語

                // 残り時間の算出
                let diffHours = 999;
                if (item.product_end_time) {
                    const endDate = parseAnyDateTime(item.product_end_time);
                    if (endDate) {
                        diffHours = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60);
                    }
                }

                // 前回のチェックタイムスタンプ（[last_check:TIMESTAMP]）の抽出
                let lastCheckTs = 0;
                const matchCheck = msgStr.match(/\[last_check:(\d+)\]/);
                if (matchCheck) {
                    lastCheckTs = parseInt(matchCheck[1], 10);
                }

                const elapsedMs = now.getTime() - lastCheckTs;

                // 残り時間に応じた動的スキップ判定
                // - 24時間以上: 12時間（12 * 60 * 60 * 1000 ms）経過していなければスキップ
                // - 2時間〜24時間: 1時間（60 * 60 * 1000 ms）経過していなければスキップ
                // - 2時間以内: 毎実行（スキップなし）
                if (diffHours > 24 && elapsedMs < 12 * 60 * 60 * 1000) {
                    continue; // 12時間未経過のためスキップ
                } else if (diffHours > 2 && diffHours <= 24 && elapsedMs < 60 * 60 * 1000) {
                    continue; // 1時間未経過のためスキップ
                }

                // -------------------------------------------------------------
                // ヤフオクページのスクレイピング
                // -------------------------------------------------------------
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);

                const res = await fetch(item.product_url, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });

                clearTimeout(timeoutId);
                const html = await res.text();

                // 最新価格の抽出
                let currentPrice = 0;
                const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
                if (nextDataMatch) {
                    try {
                        const jsonData = JSON.parse(nextDataMatch[1]);
                        const itemData = jsonData.props?.pageProps?.initialState?.item?.detail?.item || {};
                        currentPrice = itemData.taxinPrice || itemData.taxinStartPrice || itemData.price || itemData.currentPrice || 0;
                    } catch (e) {
                        console.error(`JSON parse error for item ${item.id}:`, e);
                    }
                }

                // 終了判定キーワード
                const isEnded = html.includes('終了しました') ||
                    html.includes('オークションは終了しました') ||
                    html.includes('再出品');

                // タグの管理
                let updatedMsg = msgStr;

                // [last_check:...] タグを現在のタイムスタンプに更新
                if (updatedMsg.includes('[last_check:')) {
                    updatedMsg = updatedMsg.replace(/\[last_check:\d+\]/, `[last_check:${now.getTime()}]`);
                } else {
                    updatedMsg = `${updatedMsg} [last_check:${now.getTime()}]`.trim();
                }

                const updateData: Record<string, any> = {
                    customer_message: updatedMsg
                };

                if (currentPrice > 0 && currentPrice !== item.product_price) {
                    updateData.product_price = currentPrice;
                }

                if (isEnded) {
                    updateData.final_status = 'ended_check_needed';
                    updateData.customer_message = updatedMsg.includes('Auction ended.')
                        ? updatedMsg
                        : `${updatedMsg} Auction ended. Waiting for admin to confirm result.`.trim();
                }

                // -------------------------------------------------------------
                // A. 終了まで2時間以内の通知（顧客 & 管理者）
                // -------------------------------------------------------------
                if (diffHours > 0 && diffHours <= 2 && !msgStr.includes('[2h_notified]') && !isEnded) {
                    const customerId = userMeta?.customer_id || '不明';
                    const productTitle = item.product_title || item.product_id || '商品';

                    // 1. 管理者向け通知
                    fetch(`${origin}/api/push-send`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sendToAdmins: true,
                            title: '🚨 【残り2時間】オークション終了間近',
                            body: `商品: ${productTitle} (顧客: ${customerId})`,
                            url: '/admin'
                        })
                    }).catch(e => console.error('Admin 2h push error:', e));

                    // 2. 顧客向け通知（言語別）
                    if (item.customer_email) {
                        const custTitle = lang === 'es'
                            ? '⏰ ¡Quedan menos de 2 horas!'
                            : '⏰ Faltam menos de 2 horas!';
                        const custBody = lang === 'es'
                            ? `Producto: ${productTitle}`
                            : `Produto: ${productTitle}`;

                        fetch(`${origin}/api/push-send`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                sendToCustomer: true,
                                customerEmail: item.customer_email,
                                title: custTitle,
                                body: custBody,
                                url: '/'
                            })
                        }).catch(e => console.error('Customer 2h push error:', e));
                    }

                    // 2時間前通知済みフラグの記録
                    updatedMsg = `${updatedMsg} [2h_notified]`.trim();
                    updateData.customer_message = updatedMsg;
                }

                // -------------------------------------------------------------
                // B. オファー金額超過時の顧客向け即時プッシュ通知
                // -------------------------------------------------------------
                if (currentPrice > 0 && item.max_bid && !isEnded) {
                    // 利益率（除数）の計算
                    let profitDivisor = 0.6;
                    if (userMeta?.customer_id === 'B001') profitDivisor = 0.9;
                    else if (userMeta?.agent_customer_id === 'B001') profitDivisor = 0.5;
                    else if (userMeta?.customer_id?.startsWith('A')) {
                        const countryLower = (userMeta.country || '').trim().toLowerCase();
                        profitDivisor = (countryLower === 'brasil' || countryLower === 'brazil') ? 0.7 : 0.8;
                    }

                    // 顧客向けドル換算概算価格（パターンA）
                    const currentCustomerUsd = computePatternAUsd(
                        currentPrice,
                        item.product_title,
                        item.product_url,
                        profitDivisor,
                        jpyRate
                    );

                    // オファー額（max_bid）を超過しているか判定
                    if (currentCustomerUsd > item.max_bid && !msgStr.includes('[price_exceeded_notified]')) {
                        const productTitle = item.product_title || item.product_id || '商品';
                        const custName = userMeta?.full_name || item.customer_email || '顧客';
                        const custId = userMeta?.customer_id || '不明';

                        // 1. 管理者向け通知
                        fetch(`${origin}/api/push-send`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                sendToAdmins: true,
                                title: `🚨 高値更新 ${custName} (${custId})`,
                                body: `商品: ${productTitle}`,
                                url: '/admin'
                            })
                        }).catch(e => console.error('Admin price exceeded push error:', e));

                        // 2. 顧客向け通知
                        if (item.customer_email) {
                            const title = lang === 'es'
                                ? '⚠️ ¡Tu oferta ha sido superada!'
                                : '⚠️ Sua oferta foi ultrapassada!';
                            const body = lang === 'es'
                                ? `"${productTitle}" (Precio actual: $${currentCustomerUsd} / Tu oferta: $${item.max_bid})`
                                : `"${productTitle}" (Preço atual: $${currentCustomerUsd} / Sua oferta: $${item.max_bid})`;

                            fetch(`${origin}/api/push-send`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    sendToCustomer: true,
                                    customerEmail: item.customer_email,
                                    title,
                                    body,
                                    url: '/'
                                })
                            }).catch(e => console.error('Customer price exceeded push error:', e));
                        }

                        // オファー超過通知済みフラグの記録
                        updatedMsg = `${updatedMsg} [price_exceeded_notified]`.trim();
                        updateData.customer_message = updatedMsg;
                    }
                }

                // DBデータの保存・更新
                const { error: updateError } = await supabaseAdmin
                    .from('bid_requests')
                    .update(updateData)
                    .eq('id', item.id);

                if (!updateError) {
                    if (isEnded) {
                        await fetch(`${origin}/api/push-send`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                sendToAdmins: true,
                                title: '🔚 オークション終了',
                                body: `商品の結果を確認してください`,
                                url: '/admin'
                            })
                        }).catch(e => console.error('Cron notify error:', e));

                        results.push({ id: item.id, status: 'updated_to_ended', updatedPrice: currentPrice });
                    } else {
                        results.push({ id: item.id, status: 'checked_and_updated', updatedPrice: currentPrice });
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
