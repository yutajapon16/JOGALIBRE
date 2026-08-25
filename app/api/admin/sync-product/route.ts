import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth-helpers';
import { parseJstDateTime, parseDbDateTime } from '@/lib/utils';

async function getSupabaseServer() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          const cookieStore = await cookies();
          return cookieStore.getAll();
        },
        async setAll(cookiesToSet) {
          try {
            const cookieStore = await cookies();
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component から呼ばれた場合は無視
          }
        },
      },
    }
  );
}

// ヤフオク情報の手動同期用API
export async function POST(request: Request) {
  try {
    // 1. 管理者認証チェック
    let user = await getUserFromRequest(request);
    if (!user) {
      const supabase = await getSupabaseServer();
      const { data: { user: cookieUser } } = await supabase.auth.getUser();
      user = cookieUser;
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ロールが admin かどうか確認
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userRole?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. リクエストボディのパース
    const body = await request.json();
    const { requestId } = body;

    if (!requestId) {
      return NextResponse.json({ error: 'Missing requestId' }, { status: 400 });
    }

    // データベースから対象のリクエスト情報を取得
    const { data: bidRequest, error: fetchError } = await supabaseAdmin
      .from('bid_requests')
      .select('id, product_url, status, final_status')
      .eq('id', requestId)
      .single();

    if (fetchError || !bidRequest) {
      return NextResponse.json({ error: 'Bid request not found' }, { status: 404 });
    }

    const url = bidRequest.product_url;

    if (!url || !url.includes('auctions.yahoo.co.jp')) {
      return NextResponse.json({ error: 'Invalid product URL' }, { status: 400 });
    }

    // 3. ヤフオクページから最新情報をスクレイピング
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    clearTimeout(timeoutId);
    const html = await response.text();

    let endTime: string | null = null;
    let currentPrice = 0;
    let bids = 0;
    let isClosedJson: boolean | null = null;

    // NEXT_DATA から商品詳細データをパース
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
    if (nextDataMatch) {
      try {
        const jsonData = JSON.parse(nextDataMatch[1]);
        const itemData = jsonData.props?.pageProps?.initialState?.item?.detail?.item || {};

        currentPrice = itemData.taxinPrice ||
          itemData.taxinStartPrice ||
          itemData.price ||
          itemData.currentPrice ||
          itemData.bidOrBuy ||
          itemData.buyPrice ||
          itemData.startPrice ||
          0;

        bids = itemData.bids || itemData.bidCount || itemData.numberOfBids || 0;
        
        if (itemData.status === 'closed' || itemData.status === 'ended' || itemData.isClosed === true) {
          isClosedJson = true;
        } else if (itemData.status === 'open' || itemData.status === 'active' || itemData.isClosed === false) {
          isClosedJson = false;
        }

        if (itemData.endTime) {
          if (typeof itemData.endTime === 'number') {
            const parsedDate = new Date(itemData.endTime * 1000);
            if (!isNaN(parsedDate.getTime())) {
              endTime = parsedDate.toISOString();
            }
          } else if (typeof itemData.endTime === 'string') {
            const parsedDate = parseJstDateTime(itemData.endTime) || parseDbDateTime(itemData.endTime);
            if (parsedDate) {
              endTime = parsedDate.toISOString();
            }
          }
        }
      } catch (e) {
        console.error('JSON parse error:', e);
      }
    }

    // 価格のフォールバック
    if (!currentPrice || currentPrice === 0) {
      const priceMatch = html.match(/class=["'][^"']*Price__value[^"']*["'][^>]*>([\d,]+)\s*円/i) ||
        html.match(/落札価格[：:\s]*<[^>]*>([\d,]+)\s*円/i) ||
        html.match(/即決価格[：:\s]*<[^>]*>([\d,]+)\s*円/i);
      if (priceMatch && priceMatch[1]) {
        currentPrice = parseInt(priceMatch[1].replace(/,/g, ''), 10);
      }
    }

    // 入札件数のフォールバック
    if (!bids || bids === 0) {
      const bidsMatch = html.match(/入札[件数]*[：:\s]*<[^>]*>([\d,]+)/i) ||
        html.match(/class=["'][^"']*Count__number[^"']*["'][^>]*>([\d,]+)/i) ||
        html.match(/入札件数[：:\s]*([\d,]+)/i) ||
        html.match(/入札[：:\s]*([\d,]+)\s*件/i);
      if (bidsMatch && bidsMatch[1]) {
        bids = parseInt(bidsMatch[1].replace(/,/g, ''), 10) || 0;
      }
    }

    // 終了日時のHTMLフォールバック
    if (!endTime) {
      const endTimeMatch = html.match(/終了日時[：:\s]*([0-9]{4}年[0-9]{1,2}月[0-9]{1,2}日\s*[0-9]{1,2}時[0-9]{1,2}分)/i);
      if (endTimeMatch && endTimeMatch[1]) {
        const parsed = parseJstDateTime(endTimeMatch[1]);
        if (parsed) {
          endTime = parsed.toISOString();
        }
      }
    }

    const now = Date.now();
    const parsedEndTime = endTime ? (parseDbDateTime(endTime) || parseJstDateTime(endTime)) : null;
    const isEndTimePast = parsedEndTime ? parsedEndTime.getTime() <= now : false;

    // 正確な終了判定（JSONのstatusを最優先、HTMLは確定的な見出しのみ）
    let isEnded = false;
    if (isClosedJson === true) {
      isEnded = true;
    } else if (isClosedJson === false) {
      // ヤフオク上で出品中（open/active）の場合、終了日時が過去になっていなければ開催中！
      isEnded = isEndTimePast;
    } else {
      // JSONが取得できなかった場合の確定的なHTML終了文言チェック
      const isEndedSpecificHtml = html.includes('このオークションは終了しています') ||
        html.includes('オークションは終了しました') ||
        html.includes('ClosedHeader') ||
        html.includes('落札者：') ||
        html.includes('即決価格で落札されました');
      isEnded = isEndedSpecificHtml || isEndTimePast;
    }

    // 即決落札や出品者早期終了等で実際に終了しているが、終了時刻が未来のままの場合は現在時刻を終了日時とする
    if (isEnded && (!endTime || (parsedEndTime && parsedEndTime.getTime() > now))) {
      endTime = new Date().toISOString();
    }

    // 4. 同期と復旧の処理
    if (!endTime) {
      return NextResponse.json({
        success: false,
        message: 'ヤフオクから終了時刻を取得できませんでした。商品が削除されているか、URLが無効です。'
      });
    }

    // 終了日時が未来かつ終了していない場合は進行中（または再出品）
    const isNewEndTimeFuture = parsedEndTime ? (parsedEndTime.getTime() > now && !isEnded) : false;

    // データベースの更新
    const updateData: Record<string, any> = {
      product_end_time: endTime
    };

    if (currentPrice > 0) {
      updateData.product_price = currentPrice;
    }

    // 再出品されて未来のオークションとして再開された場合、終了ステータスをクリアしてアクティブ状態に復旧する
    if (isNewEndTimeFuture) {
      updateData.final_status = null;
      updateData.customer_message = null;
      updateData.admin_needs_confirm = false;
    }

    const { error: updateError } = await supabaseAdmin
      .from('bid_requests')
      .update(updateData)
      .eq('id', requestId);

    if (updateError) {
      console.error('Error updating bid request:', updateError);
      return NextResponse.json({ error: 'Failed to update database' }, { status: 500 });
    }

    let resultMessage = 'ヤフオクの最新情報を同期しました。';
    if (isNewEndTimeFuture) {
      if (bidRequest.final_status) {
        resultMessage = 'ヤフオク情報と同期しました。再出品された新しい終了時間に更新され、オファーがアクティブに戻りました。';
      } else {
        resultMessage = `ヤフオクの最新情報を同期しました。（現在価格: ${currentPrice ? currentPrice.toLocaleString() + '円' : '-'} / 入札: ${bids}件）`;
      }
    } else if (isEnded) {
      if (bids === 0) {
        resultMessage = '再出品されていません。（入札数0でオークション終了）';
      } else {
        resultMessage = `ヤフオクでのオークション終了（落札・即決終了等）を確認しました。終了日時と最新価格（${currentPrice ? currentPrice.toLocaleString() + '円' : ''} / 入札${bids}件）を同期しました。`;
      }
    } else {
      resultMessage = `ヤフオクの最新情報を同期しました。（現在価格: ${currentPrice ? currentPrice.toLocaleString() + '円' : '-'} / 入札: ${bids}件）`;
    }

    return NextResponse.json({
      success: true,
      message: resultMessage,
      endTime,
      currentPrice,
      bids,
      isEnded
    });

  } catch (error) {
    console.error('Error in POST /api/admin/sync-product:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
