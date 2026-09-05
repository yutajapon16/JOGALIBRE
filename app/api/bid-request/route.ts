import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest, getUserInfoByEmail } from '@/lib/auth-helpers';
import { translateTitle } from '@/lib/translate';
import { parseAnyDateTime, parseDbDateTime, parseJstDateTime } from '@/lib/utils';
import { sendWonEmail, sendShippingInfoEmail } from '@/lib/resend';
import { ErrorUserInfo } from '@/lib/error-notifier';

export async function POST(request: Request) {
  try {
    const userFromToken = await getUserFromRequest(request);
    if (!userFromToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const effectiveUser = userFromToken;

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('id', effectiveUser.id)
      .single();

    if (roleError) {
      console.warn('Role fetch error (could be missing entry):', roleError);
    }

    const isAdmin = roleData?.role === 'admin';
    const body = await request.json();
    const { productId, productTitle, productUrl, productImage, productPrice, productEndTime, maxBid, customerName, customerEmail, language, deliveryLocation, deliveryCountry, deliveryCity, shippingMethod } = body;

    // 顧客の場合は自身のメールアドレスを強制使用
    const finalEmail = isAdmin ? customerEmail : effectiveUser.email;

    // 操作ユーザー情報を取得
    let userInfo: ErrorUserInfo | undefined = undefined;
    try {
      const userDetails = await getUserInfoByEmail(finalEmail);
      userInfo = {
        id: effectiveUser.id,
        email: finalEmail,
        customerId: userDetails?.customer_id || undefined,
        name: userDetails?.full_name || customerName || undefined,
        role: userDetails?.role || undefined
      };
    } catch {}

    // 非同期でタイトルを翻訳 (並列で実行、ユーザー情報を連携)
    let productTitleEs = null;
    let productTitlePt = null;
    if (productTitle) {
      [productTitleEs, productTitlePt] = await Promise.all([
        translateTitle(productTitle, 'es', userInfo),
        translateTitle(productTitle, 'pt', userInfo)
      ]);
    }


    const bidRequest = {
      id: Date.now().toString() + Math.floor(1000 + Math.random() * 9000).toString(),
      product_id: productId,
      product_title: productTitle,
      product_title_es: productTitleEs,
      product_title_pt: productTitlePt,
      product_url: productUrl,
      product_image: productImage,
      product_price: productPrice,
      product_end_time: productEndTime,
      max_bid: maxBid,
      customer_name: customerName,
      customer_email: finalEmail,
      language: language,
      status: 'pending',
      approved_at: null,
      reject_reason: null,
      counter_offer: null,
      shipping_cost_jpy: null,
      customer_counter_offer: null,
      customer_counter_offer_used: false,
      final_status: null,
      final_price: null,
      customer_confirmed: false,
      customer_message: null,
      admin_needs_confirm: false,
      delivery_location: deliveryLocation || 'JP',
      delivery_country: deliveryCountry || null,
      delivery_city: deliveryCity || null,
      shipping_method: shippingMethod || 'sea',
      cancelled_at: null
    };

    const { data, error } = await supabaseAdmin
      .from('bid_requests')
      .insert([bidRequest])
      .select()
      .single();

    if (error) {
      console.error('Supabase insertion error:', error);
      return NextResponse.json(
        { error: 'Failed' + error.message, details: error },
        { status: 500 }
      );
    }

    // 申請作成時に即座に管理者へ通知を送信（サーバー側で一括処理して重複防止）
    try {
      const { data: userRole } = await supabaseAdmin
        .from('user_roles')
        .select('full_name, customer_id')
        .eq('email', finalEmail)
        .single();

      const customerId = userRole?.customer_id ? `(${userRole.customer_id})` : '';
      const custName = userRole?.full_name || customerName || finalEmail;
      
      let isUrgent = false;
      if (productEndTime) {
        const endDate = parseAnyDateTime(productEndTime);
        if (endDate) {
          const diffMs = endDate.getTime() - Date.now();
          const diffHours = diffMs / (1000 * 60 * 60);
          if (diffHours > 0 && diffHours <= 12) {
            isUrgent = true;
          }
        }
      }

      const title = isUrgent ? `⏰ 【残り12時間】${custName} ${customerId}`.trim() : `📩 【新規申請】${custName} ${customerId}`.trim();
      const bodyText = `商品: ${productTitle || productId}`;

      await fetch(`${new URL(request.url).origin}/api/push-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sendToAdmins: true,
          bidRequestId: data.id,
          title,
          body: bodyText,
          url: '/admin'
        })
      });

      if (isUrgent) {
        const updatedMsg = ((data.customer_message || '') + ' [12h_notified]').trim();
        await supabaseAdmin
          .from('bid_requests')
          .update({ customer_message: updatedMsg })
          .eq('id', data.id);
      }
    } catch (pushErr) {
      console.error('Admin notification push error:', pushErr);
    }

    return NextResponse.json({
      success: true,
      bidRequest: data
    });
  } catch (error) {
    console.error('Critical Error in POST /api/bid-request:', error);
    return NextResponse.json(
      { error: 'Critical Error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const userFromToken = await getUserFromRequest(request);
    if (!userFromToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const effectiveUser = userFromToken;

    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role, customer_id')
      .eq('id', effectiveUser.id)
      .single();

    const isAdmin = roleData?.role === 'admin';
    const isAgent = roleData?.role === 'agent';
    const agentCustomerId = roleData?.customer_id;
    const userEmail = effectiveUser.email;

    const { searchParams } = new URL(request.url);
    const emailParam = searchParams.get('email');
    const purchased = searchParams.get('purchased');

    // 顧客の場合は自身のメールアドレスのみを対象にする
    const targetEmail = isAdmin ? emailParam : userEmail;

    // エージェントの場合は配下顧客のメールアドレスも取得してクエリ対象にする
    let allowedEmails = [userEmail];
    if (isAgent && agentCustomerId) {
      const { data: subCustomers } = await supabaseAdmin
        .from('user_roles')
        .select('email')
        .eq('agent_customer_id', agentCustomerId);
      
      if (subCustomers && subCustomers.length > 0) {
        allowedEmails = [userEmail, ...subCustomers.map(c => c.email).filter(Boolean)];
      }
    }

    if (purchased === 'true') {
      // 購入済み商品を取得（final_status='won'のみ）
      let query;
      if (isAdmin && !emailParam) {
        // 管理者が全顧客の購入済み商品を見る場合
        query = supabaseAdmin
          .from('bid_requests')
          .select('*')
          .eq('final_status', 'won')
          .eq('customer_confirmed', true)
          .order('created_at', { ascending: false });
      } else if (isAgent && !emailParam) {
        // エージェントが自分と配下顧客の購入済み商品を見る場合
        query = supabaseAdmin
          .from('bid_requests')
          .select('*')
          .in('customer_email', allowedEmails)
          .eq('final_status', 'won')
          .eq('customer_confirmed', true)
          .order('created_at', { ascending: false });
      } else {
        // 特定の顧客（または自分自身）の購入済み商品を見る場合
        query = supabaseAdmin
          .from('bid_requests')
          .select('*')
          .eq('customer_email', targetEmail)
          .eq('final_status', 'won')
          .eq('customer_confirmed', true)
          .order('created_at', { ascending: false });
      }

      const { data, error } = await query;

      if (error) throw error;

      // ユーザー情報を一括取得してマージ（N+1問題の解消）
      const uniqueEmails = Array.from(new Set((data || []).map(item => item.customer_email).filter(Boolean)));
      
      let userRolesMap: Record<string, Record<string, unknown>> = {};
      if (uniqueEmails.length > 0) {
        const { data: usersData, error: usersError } = await supabaseAdmin
          .from('user_roles')
          .select('email, full_name, whatsapp, customer_id, role, agent_customer_id, country')
          .in('email', uniqueEmails);
          
        if (!usersError && usersData) {
          userRolesMap = usersData.reduce((acc: Record<string, Record<string, unknown>>, user: Record<string, unknown>) => {
            acc[user.email as string] = user;
            return acc;
          }, {});
        }
      }

      const itemsWithUserInfo = (data || []).map(item => {
        const userInfo = userRolesMap[item.customer_email];
        return {
          ...item,
          cancelledAt: item.cancelled_at,
          customer_full_name: userInfo?.full_name,
          customer_whatsapp: userInfo?.whatsapp,
          customer_id: userInfo?.customer_id,
          customer_role: userInfo?.role,
          agent_customer_id: userInfo?.agent_customer_id,
          customer_country: userInfo?.country,
        };
      });


      const total = itemsWithUserInfo.reduce((sum, item) => sum + (item.final_price || 0), 0);

      return NextResponse.json({
        purchasedItems: itemsWithUserInfo,
        total
      });
    }

    // 通常の入札リクエストを取得
    let requestsQuery;
    if (isAdmin && !emailParam) {
      // 管理者が全リクエストを見る場合
      requestsQuery = supabaseAdmin
        .from('bid_requests')
        .select('*')
        .neq('customer_confirmed', true)
        .order('created_at', { ascending: true });
    } else if (isAgent && !emailParam) {
      // エージェントが自分と配下顧客のリクエストを見る場合
      requestsQuery = supabaseAdmin
        .from('bid_requests')
        .select('*')
        .in('customer_email', allowedEmails)
        .neq('customer_confirmed', true)
        .order('created_at', { ascending: true });
    } else {
      // 特定の顧客（または自分自身）のリクエストを見る場合
      requestsQuery = supabaseAdmin
        .from('bid_requests')
        .select('*')
        .eq('customer_email', targetEmail)
        .neq('customer_confirmed', true)
        .order('created_at', { ascending: true });
    }

    const { data, error } = await requestsQuery;

    if (error) throw error;

    // ユーザー情報を一括取得してマージ（N+1問題の解消）
    const uniqueEmails = Array.from(new Set((data || []).map(item => item.customer_email).filter(Boolean)));
    
    let userRolesMap: Record<string, Record<string, unknown>> = {};
    if (uniqueEmails.length > 0) {
      const { data: usersData, error: usersError } = await supabaseAdmin
        .from('user_roles')
        .select('email, full_name, whatsapp, customer_id, role, agent_customer_id, country')
        .in('email', uniqueEmails);
        
      if (!usersError && usersData) {
        userRolesMap = usersData.reduce((acc: Record<string, Record<string, unknown>>, user: Record<string, unknown>) => {
          acc[user.email as string] = user;
          return acc;
        }, {});
      }
    }

    const requestsWithUserInfo = (data || []).map(item => {
      const userInfo = userRolesMap[item.customer_email];
      return {
        ...item,
        cancelledAt: item.cancelled_at,
        customer_full_name: userInfo?.full_name,
        customer_whatsapp: userInfo?.whatsapp,
        customer_id: userInfo?.customer_id,
        customer_role: userInfo?.role,
        agent_customer_id: userInfo?.agent_customer_id,
        customer_country: userInfo?.country,
      };
    });

    return NextResponse.json({
      bidRequests: requestsWithUserInfo
    });
  } catch (error) {
    console.error('Error fetching bid requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bid requests' },
      { status: 500 }
    );
  }
}

// getUserInfo は lib/auth-helpers.ts の getUserInfoByEmail に統合済み

export async function DELETE(request: Request) {
  try {
    const userFromToken = await getUserFromRequest(request);
    if (!userFromToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const effectiveUser = userFromToken;

    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('id', effectiveUser.id)
      .single();

    const isAdmin = roleData?.role === 'admin';
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }

    // 認可チェック
    if (!isAdmin) {
      const { data: bidRequest } = await supabaseAdmin
        .from('bid_requests')
        .select('customer_email, status, admin_needs_confirm, final_status, product_end_time')
        .eq('id', id)
        .single();

      if (!bidRequest || bidRequest.customer_email !== effectiveUser.email) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      // 顧客は保留中・却下済み・確認済みのリクエストを削除可能
      const canDelete = bidRequest.status === 'pending' || 
                        bidRequest.status === 'rejected' || 
                        bidRequest.admin_needs_confirm || 
                        bidRequest.final_status !== null;
      if (!canDelete) {
        return NextResponse.json({ error: 'Only pending or rejected requests can be deleted' }, { status: 403 });
      }
    }

    const { error } = await supabaseAdmin
      .from('bid_requests')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/bid-request:', error);
    return NextResponse.json(
      { error: 'Failed to delete bid request' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const userFromToken = await getUserFromRequest(request);
    if (!userFromToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const effectiveUser = userFromToken;

    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('id', effectiveUser.id)
      .single();

    const isAdmin = roleData?.role === 'admin';
    const body = await request.json();    
    const { id, status, rejectReason, counterOffer, shippingCostJpy, finalStatus, finalPrice, customerConfirmed, customerMessage, customerAction, customerCounterOffer, maxBid, paid, paid_brazil, paid_paraguay, paid_japan, paid_local, local_cost, localCost, stockNumber, invoiceNumber, totalJpy, japanSendUsd, cancelledAt,
      // 発送追跡
      shipping_status, shipped_at, carrier, tracking_number, tracking_url, estimated_arrival_date
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }

    // 認可チェックとデータ取得
    const { data: currentRequest } = await supabaseAdmin
      .from('bid_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (!currentRequest) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    if (!isAdmin && currentRequest.customer_email !== effectiveUser.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};

    if (cancelledAt !== undefined) {
      updateData.cancelled_at = cancelledAt ? new Date().toISOString() : null;
    }

    // 管理者のみが更新可能なフィールド
    if (isAdmin) {
      if (status) updateData.status = status;
      if (rejectReason !== undefined) updateData.reject_reason = rejectReason;
      if (counterOffer !== undefined) updateData.counter_offer = counterOffer;
      if (shippingCostJpy !== undefined) updateData.shipping_cost_jpy = shippingCostJpy;
      if (local_cost !== undefined || localCost !== undefined) {
        const val = local_cost !== undefined ? local_cost : localCost;
        updateData.local_cost = val !== null && val !== '' && !isNaN(Number(val)) ? Number(val) : null;
      }
      if (finalStatus !== undefined) {
        updateData.final_status = finalStatus;
        if (finalStatus === 'won' && currentRequest.final_status !== 'won') {
          updateData.won_at = new Date().toISOString();
        }
      }
      if (totalJpy !== undefined) updateData.total_jpy = totalJpy ? Number(totalJpy) : null;
    if (japanSendUsd !== undefined) updateData.japan_send_usd = japanSendUsd ? Number(japanSendUsd) : null;
      if (stockNumber !== undefined) updateData.stock_number = stockNumber ? stockNumber.trim() : null;
      if (invoiceNumber !== undefined) updateData.invoice_number = invoiceNumber ? invoiceNumber.trim() : null;

      // 発送追跡
      if (shipping_status !== undefined) updateData.shipping_status = shipping_status;
      if (shipped_at !== undefined) updateData.shipped_at = shipped_at;
      if (carrier !== undefined) updateData.carrier = carrier;
      if (tracking_number !== undefined) updateData.tracking_number = tracking_number;
      if (tracking_url !== undefined) updateData.tracking_url = tracking_url;
      if (estimated_arrival_date !== undefined) updateData.estimated_arrival_date = estimated_arrival_date;
      
      // ユーザーのロール情報を取得し、B001本人またはB001がエージェントとして紐づいている顧客か判定する
      const { data: userRole } = await supabaseAdmin
        .from('user_roles')
        .select('customer_id, agent_customer_id, country')
        .eq('email', currentRequest.customer_email)
        .single();
      const isB001Linked = userRole?.agent_customer_id === 'B001' || userRole?.customer_id === 'B001';
      const isBrasilAgent = userRole?.customer_id?.startsWith('A') && 
        ((userRole?.country || '').toLowerCase().trim() === 'brasil' || (userRole?.country || '').toLowerCase().trim() === 'brazil');

      // 分割支払いの処理と全体の paid 連動ロジック
      let newPaidBrazil = paid_brazil !== undefined ? paid_brazil : currentRequest.paid_brazil;
      let newPaidParaguay = paid_paraguay !== undefined ? paid_paraguay : currentRequest.paid_paraguay;
      let newPaidJapan = paid_japan !== undefined ? paid_japan : currentRequest.paid_japan;
      let newPaid = paid !== undefined ? paid : currentRequest.paid;

      if (paid !== undefined) {
        // 全体支払いが明示的に変更された場合、分割支払いも同期する
        newPaidBrazil = paid;
        newPaidParaguay = paid;
        // B001紐づき顧客またはブラジルエージェントの場合は連動させない
        if (!(isB001Linked || isBrasilAgent)) {
          newPaidJapan = paid;
        }
      } else if (isB001Linked && (paid_brazil !== undefined || paid_paraguay !== undefined || paid_japan !== undefined)) {
        // B001関連アイテムの場合、ブラジル、パラグアイ、日本のすべてが支払済なら全体も支払済とする
        newPaid = (newPaidBrazil === true && newPaidParaguay === true && newPaidJapan === true);
      } else if (!isB001Linked && (paid_brazil !== undefined || paid_paraguay !== undefined)) {
        // 通常顧客の場合も、もしブラジルとパラグアイの分割支払いが変更された場合はそれに従う
        newPaid = (newPaidBrazil === true && newPaidParaguay === true);
      }

      if (paid_brazil !== undefined || paid !== undefined) {
        updateData.paid_brazil = newPaidBrazil;
        updateData.paid_brazil_at = newPaidBrazil ? (currentRequest.paid_brazil_at || new Date().toISOString()) : null;
      }
      if (paid_paraguay !== undefined || paid !== undefined) {
        updateData.paid_paraguay = newPaidParaguay;
        updateData.paid_paraguay_at = newPaidParaguay ? (currentRequest.paid_paraguay_at || new Date().toISOString()) : null;
      }
      if (paid_japan !== undefined || paid !== undefined) {
        updateData.paid_japan = newPaidJapan;
        updateData.paid_japan_at = newPaidJapan ? (currentRequest.paid_japan_at || new Date().toISOString()) : null;
      }
      if (paid_local !== undefined) {
        updateData.paid_local = paid_local;
        updateData.paid_local_at = paid_local ? (currentRequest.paid_local_at || new Date().toISOString()) : null;
      }

      if (newPaid !== currentRequest.paid || paid !== undefined) {
        updateData.paid = newPaid;
        if (newPaid === true && !currentRequest.paid_at) {
          updateData.paid_at = new Date().toISOString();
        } else if (newPaid === false) {
          updateData.paid_at = null;
        }
      }
    }

    // 両方または顧客が更新可能なフィールド
    let isAdminPushForIncrease = false;
    let increasedNewAmount = 0;

    if (!isAdmin) {
      if (maxBid !== undefined) {
        const newMaxBid = Number(maxBid);
        if (currentRequest.status === 'pending') {
          updateData.max_bid = newMaxBid;
          // オファー金額変更時に高値更新通知フラグをリセット
          if (currentRequest.customer_message && currentRequest.customer_message.includes('[price_exceeded_notified]')) {
            updateData.customer_message = currentRequest.customer_message.replace('[price_exceeded_notified]', '').trim();
          }
        } else if (currentRequest.status === 'approved') {
          // 承認済みの場合の制限チェック
          // カウンターオファー合意がある場合は合意金額を基準とする
          const agreedCounter = 
            (currentRequest.customer_counter_offer_used || (!currentRequest.customer_counter_offer && currentRequest.counter_offer))
              ? currentRequest.counter_offer
              : (currentRequest.customer_counter_offer && !currentRequest.customer_counter_offer_used ? currentRequest.customer_counter_offer : null);

          const currentEffectiveBid = agreedCounter
            ? Number(agreedCounter)
            : Number(currentRequest.max_bid || 0);

          // 1. 増額チェック
          if (newMaxBid <= currentEffectiveBid) {
            return NextResponse.json(
              { error: 'Approved bid can only be increased above current agreed amount' },
              { status: 400 }
            );
          }

          // 2. オークション終了まで15分前チェック (ヤフオク終了時刻はJST基準)
          if (currentRequest.product_end_time) {
            const endDate = parseDbDateTime(currentRequest.product_end_time) || parseJstDateTime(currentRequest.product_end_time);
            if (endDate) {
              const diffMs = endDate.getTime() - Date.now();
              const fifteenMinsInMs = 15 * 60 * 1000;
              if (diffMs < fifteenMinsInMs) {
                return NextResponse.json(
                  { error: 'Cannot change bid amount within 15 minutes of auction end' },
                  { status: 400 }
                );
              }
            }
          }

          updateData.max_bid = newMaxBid;
          isAdminPushForIncrease = true;
          increasedNewAmount = newMaxBid;

          // 増額時に高値更新通知フラグをリセット（次回超過時に再度通知されるようにする）
          if (currentRequest.customer_message && currentRequest.customer_message.includes('[price_exceeded_notified]')) {
            updateData.customer_message = currentRequest.customer_message.replace('[price_exceeded_notified]', '').trim();
          }
        }
      }
    }

    if (customerConfirmed !== undefined) {
      updateData.customer_confirmed = customerConfirmed;
      // 顧客が確認ボタンを押した日時を記録
      if (customerConfirmed === true && !currentRequest.customer_confirmed_at) {
        updateData.customer_confirmed_at = new Date().toISOString();

        // 在庫番号の自動採番 (落札商品 won の場合のみ)
        if (!currentRequest.stock_number && currentRequest.final_status === 'won') {
          // 1. ユーザーロールから顧客ID (customer_id) を取得
          const { data: userRole } = await supabaseAdmin
            .from('user_roles')
            .select('customer_id')
            .eq('email', currentRequest.customer_email)
            .single();

          const customerId = userRole?.customer_id || 'C000';

          // 2. すでに採番済みのレコード数をカウント
          const { count } = await supabaseAdmin
            .from('bid_requests')
            .select('id', { count: 'exact', head: true })
            .eq('customer_email', currentRequest.customer_email)
            .not('stock_number', 'is', null);

          // 3. 通し番号を生成（3桁ゼロ埋め）
          const seq = String((count || 0) + 1).padStart(3, '0');
          updateData.stock_number = `${customerId}S${seq}`;
        }
      }
    }
    if (customerMessage !== undefined) updateData.customer_message = customerMessage;
    if (customerCounterOffer !== undefined) updateData.customer_counter_offer = customerCounterOffer;

    // 落札の場合の金額設定（管理者がfinalStatusを設定した時のみ）
    if (isAdmin && finalStatus === 'won') {
      if (finalPrice !== undefined && finalPrice !== null) {
        // 手動入力された価格があればそれを使用
        updateData.final_price = finalPrice;
      } else if (currentRequest.customer_counter_offer_used) {
        // 修正: 顧客が管理者の提案を承諾した（customer_counter_offer_used === true）場合は、管理者のカウンターオファーを優先
        updateData.final_price = currentRequest.counter_offer || currentRequest.max_bid;
      } else {
        // それ以外（管理者が顧客のカウンターオファーを承認した等）は、顧客の提案を優先
        updateData.final_price = currentRequest.customer_counter_offer || currentRequest.counter_offer || currentRequest.max_bid;
      }
    }

    if (isAdmin && status === 'approved') {
      updateData.approved_at = new Date().toISOString();
      if (currentRequest.customer_counter_offer) {
        updateData.max_bid = currentRequest.customer_counter_offer;
      }
    }

    // 管理者が顧客カウンターオファーを却下した場合
    if (isAdmin && status === 'rejected') {
      if (currentRequest.customer_counter_offer) {
        updateData.admin_needs_confirm = true;
      }
    }

    // 顧客がカウンターオファーを承認した場合
    if (customerAction === 'accept_counter') {
      updateData.status = 'approved';
      updateData.approved_at = new Date().toISOString();
      updateData.customer_counter_offer_used = true;
      if (currentRequest.counter_offer) {
        updateData.max_bid = currentRequest.counter_offer;
      }
    }

    // 顧客がカウンターオファーを却下した場合
    if (customerAction === 'reject_counter') {
      updateData.status = 'rejected';
      updateData.admin_needs_confirm = true;
      updateData.customer_counter_offer_used = true;
    }

    if (
      shipping_status !== undefined ||
      shipped_at !== undefined ||
      carrier !== undefined ||
      tracking_number !== undefined ||
      tracking_url !== undefined ||
      estimated_arrival_date !== undefined
    ) {
      updateData.shipping_updated_at = new Date().toISOString();
    }

    if (Object.keys(updateData).length > 0) {
      updateData.updated_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin
      .from('bid_requests')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;

    // 顧客が承認済みオファーの金額を引き上げた場合、管理者宛てに即時通知を送信
    if (isAdminPushForIncrease) {
      try {
        const baseUrl = new URL(request.url).origin;
        const { data: userRole } = await supabaseAdmin
          .from('user_roles')
          .select('full_name, customer_id')
          .eq('email', currentRequest.customer_email)
          .single();

        const custName = userRole?.full_name || currentRequest.customer_name || currentRequest.customer_email;
        const custIdStr = userRole?.customer_id ? `(${userRole.customer_id})` : '';

        const adminTitle = `⤴️ 【上限額変更】${custName} ${custIdStr}`.trim();
        const adminBody = `商品: ${currentRequest.product_title || 'Item'} (新上限: $${increasedNewAmount})`;

        await fetch(`${baseUrl}/api/push-send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sendToAdmins: true,
            bidRequestId: id,
            title: adminTitle,
            body: adminBody,
            url: '/admin',
          }),
        }).catch(err => console.error('Admin maxBid increase push error:', err));
      } catch (pushErr) {
        console.error('Admin maxBid increase notification error:', pushErr);
      }
    }

    // 管理者による手動での支払済更新時、顧客へ通知を送信
    if (isAdmin && updateData.paid === true && !currentRequest.paid && currentRequest.customer_email) {
      try {
        const baseUrl = new URL(request.url).origin;
        const { data: userRole } = await supabaseAdmin
          .from('user_roles')
          .select('language')
          .eq('email', currentRequest.customer_email)
          .single();

        const lang = (userRole?.language || 'es').toLowerCase();
        const isPt = lang === 'pt';
        const itemTitle = isPt
          ? currentRequest.product_title_pt || currentRequest.product_title || 'Item'
          : currentRequest.product_title_es || currentRequest.product_title || 'Item';

        const custTitle = isPt ? '💳 Pagamento Confirmado' : '💳 Pago Confirmado';
        const custBody = isPt ? `Produto: ${itemTitle}` : `Producto: ${itemTitle}`;

        await fetch(`${baseUrl}/api/push-send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: currentRequest.customer_email,
            title: custTitle,
            body: custBody,
            url: '/',
          }),
        }).catch(err => console.error('Manual payment customer push error:', err));
      } catch (pushErr) {
        console.error('Manual payment notification error:', pushErr);
      }
    }

    // 管理者により落札成功（Won）へステータス変更された場合、顧客へ落札完了メールを送信
    if (isAdmin && finalStatus === 'won' && currentRequest.final_status !== 'won' && currentRequest.customer_email) {
      try {
        const { data: userRole } = await supabaseAdmin
          .from('user_roles')
          .select('language')
          .eq('email', currentRequest.customer_email)
          .single();

        const lang = (userRole?.language || 'es').toLowerCase();
        const isPt = lang === 'pt';
        const itemTitle = isPt
          ? currentRequest.product_title_pt || currentRequest.product_title || 'Item'
          : currentRequest.product_title_es || currentRequest.product_title || 'Item';

        sendWonEmail(currentRequest.customer_email, itemTitle, lang).catch(err =>
          console.error('Won email send error:', err)
        );
      } catch (emailErr) {
        console.error('Won email trigger error:', emailErr);
      }
    }

    // 管理者により発送情報（輸送中 status='in_transit' または 追跡番号）が更新された場合、顧客へ発送案内メールを送信
    if (isAdmin && (shipping_status === 'in_transit' || tracking_number) && currentRequest.customer_email) {
      try {
        const { data: userRole } = await supabaseAdmin
          .from('user_roles')
          .select('language')
          .eq('email', currentRequest.customer_email)
          .single();

        const lang = (userRole?.language || 'es').toLowerCase();
        const isPt = lang === 'pt';
        const itemTitle = isPt
          ? currentRequest.product_title_pt || currentRequest.product_title || 'Item'
          : currentRequest.product_title_es || currentRequest.product_title || 'Item';

        sendShippingInfoEmail(
          currentRequest.customer_email,
          itemTitle,
          tracking_number || currentRequest.tracking_number,
          carrier || currentRequest.carrier,
          tracking_url || currentRequest.tracking_url,
          lang
        ).catch(err => console.error('Shipping email send error:', err));
      } catch (shippingErr) {
        console.error('Shipping email trigger error:', shippingErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in PATCH /api/bid-request:', error);
    return NextResponse.json(
      { error: 'Failed to update bid request' },
      { status: 500 }
    );
  }
}