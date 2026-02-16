import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cookies } from 'next/headers';


    
    export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { productId, productTitle, productUrl, productImage, productPrice, productEndTime, maxBid, customerName, customerEmail, language } = body;
    
    const bidRequest = {
      id: Date.now().toString(),
      product_id: productId,
      product_title: productTitle,
      product_url: productUrl,
      product_image: productImage,
      product_price: productPrice,
      product_end_time: productEndTime,
      max_bid: maxBid,
      customer_name: customerName,
      customer_email: customerEmail,
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
    
    const { data, error } = await supabase
      .from('bid_requests')
      .insert([bidRequest])
      .select()
      .single();
    
    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to create bid request' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      bidRequest: data
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed to create bid request' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const purchased = searchParams.get('purchased');

    if (purchased === 'true') {
      // 購入済み商品を取得（final_status='won'のみ）
      const query = email 
        ? supabase
            .from('bid_requests')
            .select('*')
            .eq('customer_email', email)
            .eq('final_status', 'won')
            .eq('customer_confirmed', true)
            .order('created_at', { ascending: false })
        : supabase
            .from('bid_requests')
            .select('*')
            .eq('final_status', 'won')
            .eq('customer_confirmed', true)
            .order('created_at', { ascending: false });

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
    const query = email
      ? supabase
          .from('bid_requests')
          .select('*')
          .eq('customer_email', email)
          .neq('customer_confirmed', true)
          .order('created_at', { ascending: true })
      : supabase
          .from('bid_requests')
          .select('*')
          .neq('customer_confirmed', true)
          .order('created_at', { ascending: true });

    const { data, error } = await query;

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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID required' },
        { status: 400 }
      );
    }
    
    const { error } = await supabase
      .from('bid_requests')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to delete bid request' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete bid request' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status, rejectReason, counterOffer, shippingCostJpy, finalStatus, customerConfirmed, customerMessage, customerAction, customerCounterOffer } = body;

    const updateData: any = {};
    
    if (status) updateData.status = status;
    if (rejectReason !== undefined) updateData.reject_reason = rejectReason;
    if (counterOffer !== undefined) updateData.counter_offer = counterOffer;
    if (shippingCostJpy !== undefined) updateData.shipping_cost_jpy = shippingCostJpy;
    if (finalStatus !== undefined) updateData.final_status = finalStatus;
    if (customerConfirmed !== undefined) updateData.customer_confirmed = customerConfirmed;
    if (customerMessage !== undefined) updateData.customer_message = customerMessage;
    if (customerCounterOffer !== undefined) updateData.customer_counter_offer = customerCounterOffer;
    
    if (status === 'approved') {
      updateData.approved_at = new Date().toISOString();
    }
    
    if (customerAction === 'accept_counter') {
      updateData.status = 'approved';
      updateData.approved_at = new Date().toISOString();
      updateData.customer_counter_offer_used = true;
    }
    
    if (customerAction === 'reject_counter') {
      updateData.admin_needs_confirm = true;
    }

    const { error } = await supabase
      .from('bid_requests')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating bid request:', error);
    return NextResponse.json(
      { error: 'Failed to update bid request' },
      { status: 500 }
    );
  }
}