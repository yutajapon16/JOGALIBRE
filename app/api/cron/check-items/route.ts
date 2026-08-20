import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parseAnyDateTime, calculateDefaultFobCost, calculateDefaultShippingCost } from '@/lib/utils';
import { getResilientExchangeRate } from '@/lib/exchange';

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

        // 最新の為替レート（USD/JPY）をリアルタイム取得
        let jpyRate = 155.73;
        try {
            const rateData = await getResilientExchangeRate();
            if (rateData?.rates?.JPY && rateData.rates.JPY > 50) {
                jpyRate = rateData.rates.JPY;
            }
        } catch (e) {
            console.error('Failed to get exchange rate in check-items:', e);
        }

        // 顧客ID・言語・ロール等のユーザー情報を一括取得
        const { data: roles } = await supabaseAdmin
            .from('user_roles')
            .select('email, customer_id, language, role, country, agent_customer_id, full_name');

        const userRoleMap = new Map<string, any>();
        if (roles) {
            for (const r of roles) {
                if (r.email) {
                    userRoleMap.set(r.email.toLowerCase(), r);
                }
            }
        }

        // -------------------------------------------------------------
        // 未完了の全申請（pending, approved）を一括取得して一元処理
        // -------------------------------------------------------------
        const { data: items, error: fetchError } = await supabaseAdmin
            .from('bid_requests')
            .select('id, product_id, product_title, product_title_es, product_title_pt, product_url, product_end_time, status, customer_email, product_price, max_bid, customer_message')
            .is('final_status', null);

        if (fetchError) throw fetchError;
        if (!items || items.length === 0) {
            return NextResponse.json({ message: 'Checks completed. No active items to process.' });
        }

        const results = [];
        const pushPromises: Promise<any>[] = [];

        for (const item of items) {
            try {
                let currentMsg = item.customer_message || '';
                const userMeta = item.customer_email ? userRoleMap.get(item.customer_email.toLowerCase()) : null;
                const lang = userMeta?.language || 'pt';
                const customerId = userMeta?.customer_id || '不明';
                const productTitle = item.product_title || item.product_id || '商品';

                // 1. 残り時間の算出（JST基準で正確にミリ秒計算）
                let diffHours = 999;
                if (item.product_end_time) {
                    const endDate = parseAnyDateTime(item.product_end_time);
                    if (endDate) {
                        diffHours = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60);
                    }
                }

                // 2. 12時間前通知チェック（未完了の全ステータス対象）
                // 残り時間が12時間以内、かつ2時間超で、未通知の場合
                if (diffHours > 2 && diffHours <= 12 && !currentMsg.includes('[12h_notified]')) {
                    const title = item.status === 'pending'
                        ? '⏰ 【残り12時間】未確認の申請あり'
                        : '🔔 【残り12時間】オークション終了間近';
                    const body = `商品: ${productTitle} (顧客: ${customerId})`;

                    pushPromises.push(
                        fetch(`${origin}/api/push-send`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                sendToAdmins: true,
                                title,
                                body,
                                url: '/admin'
                            })
                        }).catch(e => console.error(`12h push error for item ${item.id}:`, e))
                    );

                    currentMsg = `${currentMsg} [12h_notified]`.trim();
                }

                // pending（未承認）かつURLなし、または巡回不要な場合の簡易更新
                if (!item.product_url || (item.status !== 'pending' && item.status !== 'approved')) {
                    if (currentMsg !== item.customer_message) {
                        await supabaseAdmin
                            .from('bid_requests')
                            .update({ customer_message: currentMsg })
                            .eq('id', item.id);
                    }
                    continue;
                }

                // 3. 残り時間に応じた動的スクレイピング頻度制御
                let lastCheckTs = 0;
                const matchCheck = currentMsg.match(/\[last_check:(\d+)\]/);
                if (matchCheck) {
                    lastCheckTs = parseInt(matchCheck[1], 10);
                }
                const elapsedMs = now.getTime() - lastCheckTs;

                // 終了通知済みのアイテムは頻繁な巡回をスキップ（1時間ごと）
                if (currentMsg.includes('[auction_ended_notified]') && elapsedMs < 60 * 60 * 1000) {
                    continue;
                }

                // - 24時間以上: 3時間経過していなければスキップ
                // - 2時間〜24時間: 15分経過していなければスキップ
                // - 2時間以内: 毎実行（スキップなし）
                if (diffHours > 24 && elapsedMs < 3 * 60 * 60 * 1000) {
                    if (currentMsg !== item.customer_message) {
                        await supabaseAdmin
                            .from('bid_requests')
                            .update({ customer_message: currentMsg })
                            .eq('id', item.id);
                    }
                    continue;
                } else if (diffHours > 2 && diffHours <= 24 && elapsedMs < 15 * 60 * 1000) {
                    if (currentMsg !== item.customer_message) {
                        await supabaseAdmin
                            .from('bid_requests')
                            .update({ customer_message: currentMsg })
                            .eq('id', item.id);
                    }
                    continue;
                }

                // 4. ヤフオクページのスクレイピング
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);

                let html = '';
                try {
                    const res = await fetch(item.product_url, {
                        signal: controller.signal,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    });
                    clearTimeout(timeoutId);
                    html = await res.text();
                } catch (fetchErr) {
                    clearTimeout(timeoutId);
                    console.error(`Fetch error for ${item.product_url}:`, fetchErr);
                    // 通信エラー時もメッセージ更新があれば保存
                    if (currentMsg !== item.customer_message) {
                        await supabaseAdmin
                            .from('bid_requests')
                            .update({ customer_message: currentMsg })
                            .eq('id', item.id);
                    }
                    continue;
                }

                // 最新価格および終了時間の抽出
                let currentPrice = 0;
                let initPrice = 0;
                let latestEndTime: string | null = null;

                const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
                if (nextDataMatch) {
                    try {
                        const jsonData = JSON.parse(nextDataMatch[1]);
                        const itemData = jsonData.props?.pageProps?.initialState?.item?.detail?.item || {};
                        currentPrice = itemData.taxinPrice ||
                            itemData.taxinStartPrice ||
                            itemData.price ||
                            itemData.currentPrice ||
                            itemData.currentBidPrice ||
                            itemData.startPrice ||
                            0;
                        initPrice = itemData.initPrice ||
                            itemData.lastInitPrice ||
                            itemData.startPrice ||
                            itemData.taxinStartPrice ||
                            0;
                        if (itemData.endTime) {
                            if (typeof itemData.endTime === 'number') {
                                const parsedDate = new Date(itemData.endTime * 1000);
                                if (!isNaN(parsedDate.getTime())) {
                                    latestEndTime = parsedDate.toISOString();
                                }
                            } else if (typeof itemData.endTime === 'string') {
                                const parsedDate = parseAnyDateTime(itemData.endTime);
                                if (parsedDate) {
                                    latestEndTime = parsedDate.toISOString();
                                } else {
                                    latestEndTime = itemData.endTime;
                                }
                            }
                        }
                    } catch (e) {
                        console.error(`JSON parse error for item ${item.id}:`, e);
                    }
                }

                // フォールバック1: メタタグ
                if (!currentPrice || currentPrice === 0) {
                    const ogPriceMatch = html.match(/<meta[^>]*property=["'](?:og:price:amount|product:price:amount)["'][^>]*content=["'](\d+)["']/i);
                    if (ogPriceMatch && ogPriceMatch[1]) {
                        currentPrice = parseInt(ogPriceMatch[1], 10);
                    }
                }

                // フォールバック2: HTML価格テキスト
                if (!currentPrice || currentPrice === 0) {
                    const priceRegexMatch = html.match(/class=["'][^"']*Price__value[^"']*["'][^>]*>([\d,]+)\s*円/i);
                    if (priceRegexMatch && priceRegexMatch[1]) {
                        currentPrice = parseInt(priceRegexMatch[1].replace(/,/g, ''), 10);
                    }
                }

                if (!initPrice || initPrice === 0) {
                    initPrice = item.product_price || currentPrice;
                }

                // 終了判定
                const isEnded = html.includes('終了しました') ||
                    html.includes('オークションは終了しました') ||
                    html.includes('このオークションは終了しています') ||
                    html.includes('再出品') ||
                    (diffHours < -0.25); // 終了予定時刻から15分以上経過

                // [last_check:TIMESTAMP] の更新
                if (currentMsg.includes('[last_check:')) {
                    currentMsg = currentMsg.replace(/\[last_check:\d+\]/, `[last_check:${now.getTime()}]`);
                } else {
                    currentMsg = `${currentMsg} [last_check:${now.getTime()}]`.trim();
                }

                const updateData: Record<string, any> = {
                    customer_message: currentMsg
                };

                if (currentPrice > 0 && currentPrice !== item.product_price) {
                    updateData.product_price = currentPrice;
                }

                // ヤフオク終了日時の自動同期
                if (latestEndTime && latestEndTime !== item.product_end_time) {
                    updateData.product_end_time = latestEndTime;
                    const latestEndDate = parseAnyDateTime(latestEndTime);
                    if (latestEndDate) {
                        diffHours = (latestEndDate.getTime() - now.getTime()) / (1000 * 60 * 60);
                    }
                }

                if (isEnded) {
                    currentMsg = currentMsg.includes('Auction ended.')
                        ? currentMsg
                        : `${currentMsg} Auction ended. Waiting for admin to confirm result.`.trim();

                    // 承認済みの申請商品（落札結果待ち）のオークション終了時、管理者宛てプッシュ通知を送信
                    if (item.status === 'approved' && !currentMsg.includes('[auction_ended_notified]')) {
                        pushPromises.push(
                            fetch(`${origin}/api/push-send`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    sendToAdmins: true,
                                    bidRequestId: item.id,
                                    title: '🔚 オークション終了',
                                    body: `商品: ${productTitle}`,
                                    url: '/admin'
                                })
                            }).catch(e => console.error(`Auction ended admin push error for item ${item.id}:`, e))
                        );
                        currentMsg = `${currentMsg} [auction_ended_notified]`.trim();
                    }
                    updateData.customer_message = currentMsg;
                }

                // 5. 終了まで2時間以内の通知（顧客 & 管理者）
                if (diffHours > 0 && diffHours <= 2 && !currentMsg.includes('[2h_notified]') && !isEnded) {
                    // 管理者通知
                    pushPromises.push(
                        fetch(`${origin}/api/push-send`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                sendToAdmins: true,
                                title: '🚨 【残り2時間】オークション終了間近',
                                body: `商品: ${productTitle} (顧客: ${customerId})`,
                                url: '/admin'
                            })
                        }).catch(e => console.error('Admin 2h push error:', e))
                    );

                    // 顧客通知
                    if (item.customer_email) {
                        const custTitle = lang === 'es'
                            ? '⏰ ¡Quedan menos de 2 horas!'
                            : '⏰ Faltam menos de 2 horas!';
                        const itemTitle = lang === 'es'
                            ? item.product_title_es || productTitle
                            : item.product_title_pt || productTitle;
                        const custBody = lang === 'es'
                            ? `Producto: ${itemTitle}`
                            : `Produto: ${itemTitle}`;

                        pushPromises.push(
                            fetch(`${origin}/api/push-send`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    email: item.customer_email,
                                    bidRequestId: item.id,
                                    title: custTitle,
                                    body: custBody,
                                    url: '/'
                                })
                            }).catch(e => console.error('Customer 2h push error:', e))
                        );
                    }

                    currentMsg = `${currentMsg} [2h_notified]`.trim();
                    updateData.customer_message = currentMsg;
                }

                // 6. オファー金額超過時の顧客・管理者向け即時通知
                const basePrice = item.product_price || initPrice || 0;
                const isPriceActuallyIncreased = currentPrice > basePrice;

                if (currentPrice > 0 && item.max_bid && !isEnded && isPriceActuallyIncreased) {
                    let profitDivisor = 0.6;
                    if (userMeta?.customer_id === 'B001') profitDivisor = 0.9;
                    else if (userMeta?.agent_customer_id === 'B001') profitDivisor = 0.5;
                    else if (userMeta?.customer_id?.startsWith('A')) {
                        const countryLower = (userMeta.country || '').trim().toLowerCase();
                        profitDivisor = (countryLower === 'brasil' || countryLower === 'brazil') ? 0.7 : 0.8;
                    }

                    const currentCustomerUsd = computePatternAUsd(
                        currentPrice,
                        item.product_title,
                        item.product_url,
                        profitDivisor,
                        jpyRate
                    );

                    if (currentCustomerUsd > item.max_bid && !currentMsg.includes('[price_exceeded_notified]')) {
                        const custName = userMeta?.full_name || item.customer_email || '顧客';

                        // 管理者通知
                        pushPromises.push(
                            fetch(`${origin}/api/push-send`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    sendToAdmins: true,
                                    title: `⚠️ 【高値更新】 ${custName} (${customerId})`,
                                    body: `商品: ${productTitle}`,
                                    url: '/admin'
                                })
                            }).catch(e => console.error('Admin price exceeded push error:', e))
                        );

                        // 顧客通知
                        if (item.customer_email) {
                            const title = lang === 'es'
                                ? '⚠️ ¡Tu oferta ha sido superada!'
                                : '⚠️ Sua oferta foi ultrapassada!';
                            const itemTitle = lang === 'es'
                                ? item.product_title_es || productTitle
                                : item.product_title_pt || productTitle;
                            const body = lang === 'es'
                                ? `"${itemTitle}" (Precio actual: $${currentCustomerUsd} / Tu oferta: $${item.max_bid})`
                                : `"${itemTitle}" (Preço atual: $${currentCustomerUsd} / Sua oferta: $${item.max_bid})`;

                            pushPromises.push(
                                fetch(`${origin}/api/push-send`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        email: item.customer_email,
                                        title,
                                        body,
                                        url: '/'
                                    })
                                }).catch(e => console.error('Customer price exceeded push error:', e))
                            );
                        }

                        currentMsg = `${currentMsg} [price_exceeded_notified]`.trim();
                        updateData.customer_message = currentMsg;
                    }
                }

                // DB更新を実行
                const { error: updateError } = await supabaseAdmin
                    .from('bid_requests')
                    .update(updateData)
                    .eq('id', item.id);

                if (updateError) {
                    console.error(`Error updating item ${item.id}:`, updateError);
                } else {
                    results.push({
                        id: item.id,
                        price: currentPrice,
                        isEnded,
                        updatedMsg: currentMsg
                    });
                }
            } catch (itemError) {
                console.error(`Error processing item ${item.id}:`, itemError);
            }
        }

        // 送信キューの完了待ち
        if (pushPromises.length > 0) {
            await Promise.allSettled(pushPromises);
        }

        return NextResponse.json({
            message: 'All item checks and notification tasks completed successfully.',
            processed: results.length,
            results
        });
    } catch (error: any) {
        console.error('Fatal error in /api/cron/check-items:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
