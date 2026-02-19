import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/auth-helpers-nextjs';



export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabaseRoute = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Server Component からの呼び出し時は無視される
            }
          },
        },
      }
    );
    const { data: { session }, error: sessionError } = await supabaseRoute.auth.getSession();

    console.log('=== Bid Request POST Debug ===');
    if (sessionError) console.error('Session Error:', sessionError);
    console.log('Session User:', session?.user?.email, 'ID:', session?.user?.id);

    if (!session) {
      console.error('No session found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (roleError) {
      console.warn('Role fetch error (could be missing entry):', roleError);
    }
    console.log('User Role:', roleData?.role);

    const isAdmin = roleData?.role === 'admin';
    const body = await request.json();
    const { productId, productTitle, productUrl, productImage, productPrice, productEndTime, maxBid, customerName, customerEmail, language } = body;

    // 顧客の場合は自身のメールアドレスを強制使用
    const finalEmail = isAdmin ? customerEmail : session.user.email;
    console.log('Final Email for record:', finalEmail);

    const bidRequest = {
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
      admin_needs_confirm: false
    };

    console.log('Inserting bid request...');
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

    console.log('Bid request created successfully:', data.id);
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
    const cookieStore = await cookies();
    const supabaseRoute = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Server Component からの呼び出し時は無視される
            }
          },
        },
      }
    );
    const { data: { session } } = await supabaseRoute.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    const isAdmin = roleData?.role === 'admin';
    const userEmail = session.user.email;

    const { searchParams } = new URL(request.url);
    const emailParam = searchParams.get('email');
    const purchased = searchParams.get('purchased');

    // 顧客の場合は自身のメールアドレスのみを対象にする
    const targetEmail = isAdmin ? emailParam : userEmail;

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

      // ユーザー情報を取得してマージ
      const itemsWithUserInfo = await Promise.all(
        (data || []).map(async (item) => {
          const userInfo = await getUserInfo(item.customer_email);
          return {
            ...item,
            customer_full_name: userInfo?.full_name,
            customer_whatsapp: userInfo?.whatsapp
          };
        })
      );


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

    // ユーザー情報を取得してマージ
    const requestsWithUserInfo = await Promise.all(
      (data || []).map(async (item) => {
        const userInfo = await getUserInfo(item.customer_email);
        return {
          ...item,
          customer_full_name: userInfo?.full_name,
          customer_whatsapp: userInfo?.whatsapp
        };
      })
    );

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

// ヘルパー関数：メールアドレスからユーザー情報を取得
async function getUserInfo(email: string) {
  try {
    // auth.usersからユーザーIDを取得
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();

    if (authError) {
      console.error('Error fetching auth users:', authError);
      return null;
    }

    const user = authData.users.find(u => u.email === email);
    if (!user) return null;

    // user_rolesから氏名とWhatsAppを取得
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('full_name, whatsapp')
      .eq('id', user.id)
      .single();

    if (roleError) {
      console.error('Error fetching user roles:', roleError);
      return null;
    }

    return roleData;
  } catch (error) {
    console.error('Error in getUserInfo:', error);
    return null;
  }
}

export async function DELETE(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabaseRoute = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Server Component からの呼び出し時は無視される
            }
          },
        },
      }
    );
    const { data: { session } } = await supabaseRoute.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('id', session.user.id)
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
        .select('customer_email')
        .eq('id', id)
        .single();

      if (!bidRequest || bidRequest.customer_email !== session.user.email) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    const cookieStore = await cookies();
    const supabaseRoute = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Server Component からの呼び出し時は無視される
            }
          },
        },
      }
    );
    const { data: { session } } = await supabaseRoute.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    const isAdmin = roleData?.role === 'admin';
    const body = await request.json();
    const { id, status, rejectReason, counterOffer, shippingCostJpy, finalStatus, customerConfirmed, customerMessage, customerAction, customerCounterOffer, paid } = body;

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

    if (!isAdmin && currentRequest.customer_email !== session.user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateData: any = {};

    // 管理者のみが更新可能なフィールド
    if (isAdmin) {
      if (status) updateData.status = status;
      if (rejectReason !== undefined) updateData.reject_reason = rejectReason;
      if (counterOffer !== undefined) updateData.counter_offer = counterOffer;
      if (shippingCostJpy !== undefined) updateData.shipping_cost_jpy = shippingCostJpy;
      if (finalStatus !== undefined) updateData.final_status = finalStatus;
      if (paid !== undefined) updateData.paid = paid;
    }

    // 両方または顧客が更新可能なフィールド
    if (customerConfirmed !== undefined) updateData.customer_confirmed = customerConfirmed;
    if (customerMessage !== undefined) updateData.customer_message = customerMessage;
    if (customerCounterOffer !== undefined) updateData.customer_counter_offer = customerCounterOffer;

    // 落札の場合の金額設定（管理者がfinalStatusを設定した時のみ）
    if (isAdmin && finalStatus === 'won') {
      // 修正: 顧客が管理者の提案を承諾した（customer_counter_offer_used === true）場合は、管理者のカウンターオファーを優先
      if (currentRequest.customer_counter_offer_used) {
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