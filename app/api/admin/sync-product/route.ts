import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth-helpers';

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

    // NEXT_DATA から商品詳細データをパース
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
    if (nextDataMatch) {
      try {
        const jsonData = JSON.parse(nextDataMatch[1]);
        const itemData = jsonData.props?.pageProps?.initialState?.item?.detail?.item || {};

        currentPrice = itemData.taxinPrice || itemData.taxinStartPrice || itemData.price || itemData.currentPrice || 0;
        bids = itemData.bids || itemData.bidCount || 0;

        if (itemData.endTime) {
          if (typeof itemData.endTime === 'number') {
            const parsedDate = new Date(itemData.endTime * 1000);
            if (!isNaN(parsedDate.getTime())) {
              endTime = parsedDate.toISOString();
            }
          } else if (typeof itemData.endTime === 'string') {
            const parsedDate = new Date(itemData.endTime);
            if (!isNaN(parsedDate.getTime())) {
              endTime = parsedDate.toISOString();
            }
          }
        }
      } catch (e) {
        console.error('JSON parse error:', e);
      }
    }

    // 4. 同期と復旧の処理
    if (!endTime) {
      return NextResponse.json({
        success: false,
        message: 'ヤフオクから終了時刻を取得できませんでした。商品が削除されているか、URLが無効です。'
      });
    }

    const isNewEndTimeFuture = new Date(endTime).getTime() > Date.now();

    if (!isNewEndTimeFuture) {
      // 取得した終了時刻が過去（再出品されていない状態）
      return NextResponse.json({
        success: false,
        message: '商品はまだ再出品されていません。ヤフオク上では既に終了しています。',
        endTime
      });
    }

    // データベースの更新
    // 終了時間を更新し、終了ステータスをクリアしてアクティブ状態に復旧する
    const updateData: Record<string, any> = {
      product_end_time: endTime,
      final_status: null, // 終了状態をクリア
      customer_message: null, // メッセージをクリア
      admin_needs_confirm: false // 管理者確認フラグを解除
    };

    if (currentPrice > 0) {
      updateData.product_price = currentPrice;
    }

    const { error: updateError } = await supabaseAdmin
      .from('bid_requests')
      .update(updateData)
      .eq('id', requestId);

    if (updateError) {
      console.error('Error updating bid request:', updateError);
      return NextResponse.json({ error: 'Failed to update database' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'ヤフオク情報と同期しました。新しい終了時間に更新され、オファーがアクティブに戻りました。',
      endTime,
      currentPrice,
      bids
    });

  } catch (error) {
    console.error('Error in POST /api/admin/sync-product:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
