import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth-helpers';

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
    const { productId, productTitle, productUrl, productImage, productPrice, productEndTime, maxBid, customerName, customerEmail, language, deliveryLocation } = body;

    // 顧客の場合は自身のメールアドレスを強制使用
    const finalEmail = isAdmin ? customerEmail : effectiveUser.email;

    const bidRequest = {
      id: Date.now().toString() + Math.floor(1000 + Math.random() * 9000).toString(),
      product_id: productId,
      product_title: productTitle,
      product_url: productUrl,
      product_image: productImage,
      product_price: productPrice,
      product_end_time: productEndTime,
      max_bid: maxBid,
      customer_name: customerName,
      customer_email: finalEmail,
      language: language,
      status: 'pending',
      created_at: new Date().toISOString(),
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
        .select('customer_email, status')
        .eq('id', id)
        .single();

      if (!bidRequest || bidRequest.customer_email !== effectiveUser.email) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      // 顧客は保留中のリクエストのみ削除可能
      if (bidRequest.status !== 'pending') {
        return NextResponse.json({ error: 'Only pending requests can be deleted' }, { status: 403 });
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
    const { id, status, rejectReason, counterOffer, shippingCostJpy, finalStatus, finalPrice, customerConfirmed, customerMessage, customerAction, customerCounterOffer, maxBid, paid, paid_brazil, paid_paraguay, paid_japan, paid_local, stockNumber, invoiceNumber, totalJpy, cancelledAt } = body;

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
      updateData.cancelled_at = cancelledAt;
    }

    // 管理者のみが更新可能なフィールド
    if (isAdmin) {
      if (status) updateData.status = status;
      if (rejectReason !== undefined) updateData.reject_reason = rejectReason;
      if (counterOffer !== undefined) updateData.counter_offer = counterOffer;
      if (shippingCostJpy !== undefined) updateData.shipping_cost_jpy = shippingCostJpy;
      if (finalStatus !== undefined) updateData.final_status = finalStatus;
      if (totalJpy !== undefined) updateData.total_jpy = totalJpy ? Number(totalJpy) : null;
      if (stockNumber !== undefined) updateData.stock_number = stockNumber ? stockNumber.trim() : null;
      if (invoiceNumber !== undefined) updateData.invoice_number = invoiceNumber ? invoiceNumber.trim() : null;
      
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
    if (!isAdmin) {
      // 顧客による金額変更は保留中(pending)の時のみ可能
      if (maxBid !== undefined && currentRequest.status === 'pending') {
        updateData.max_bid = Number(maxBid);
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
    }

    // 顧客がカウンターオファーを却下した場合
    if (customerAction === 'reject_counter') {
      updateData.admin_needs_confirm = true;
    }

    const { error } = await supabaseAdmin
      .from('bid_requests')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in PATCH /api/bid-request:', error);
    return NextResponse.json(
      { error: 'Failed to update bid request' },
      { status: 500 }
    );
  }
}