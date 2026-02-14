import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 簡易ユーザー認証（デモ用）
const DEMO_USER = {
  email: process.env.ADMIN_EMAIL || 'demo@example.com',
  password: process.env.ADMIN_PASSWORD || 'demo123',
  name: process.env.ADMIN_NAME || 'Demo User'
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, email, password } = body;
    
    // ログイン処理
    if (action === 'login') {
      console.log('=== LOGIN DEBUG ===');
      console.log('Received email:', email);
      console.log('Received password:', password);
      console.log('Expected email:', DEMO_USER.email);
      console.log('Expected password:', DEMO_USER.password);
      console.log('Match?', email === DEMO_USER.email && password === DEMO_USER.password);
      
      if (email === DEMO_USER.email && password === DEMO_USER.password) {
        return NextResponse.json({
          success: true,
          user: { email: DEMO_USER.email, name: DEMO_USER.name }
        });
      } else {
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }
    }
    
    // 入札リクエスト作成
    const { productId, productTitle, productUrl, productImage, productPrice, productEndTime, maxBid, customerName, currentEmail, language } = body;
    
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
      customer_email: currentEmail,
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
  const { searchParams } = new URL(request.url);
  const customerEmail = searchParams.get('email');
  const getPurchased = searchParams.get('purchased');
  
  try {
    if (getPurchased === 'true') {
      // 購入商品一覧取得
      let query = supabase
        .from('purchased_items')
        .select('*')
        .order('confirmed_at', { ascending: false });
      
      if (customerEmail) {
        query = query.eq('customer_email', customerEmail);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Supabase error:', error);
        return NextResponse.json({ purchasedItems: [], total: 0 });
      }
      
      const total = data.reduce((sum, item) => sum + (item.final_price || 0), 0);
      
      return NextResponse.json({
        purchasedItems: data,
        total
      });
    }
    
    // 入札リクエスト一覧取得
    let query = supabase
      .from('bid_requests')
      .select('*')
      .eq('customer_confirmed', false)
      .order('created_at', { ascending: false });
    
    if (customerEmail) {
      query = query.eq('customer_email', customerEmail);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ bidRequests: [] });
    }
    
    return NextResponse.json({
      bidRequests: data || []
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ bidRequests: [] });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { 
      id, status, rejectReason, counterOffer, shippingCostJpy,
      finalStatus, finalPrice, customerConfirmed, 
      customerMessage, customerCounterOffer,
      adminNeedsConfirm, customerAction
    } = body;
    
    // 現在のデータを取得
    const { data: currentData, error: fetchError } = await supabase
      .from('bid_requests')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !currentData) {
      return NextResponse.json(
        { error: 'Bid request not found' },
        { status: 404 }
      );
    }
    
    // 更新データを準備
    const updateData: any = {};
    
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'approved') {
        updateData.approved_at = new Date().toISOString();
      }
    }
    
    if (status === 'rejected' && rejectReason) {
      updateData.reject_reason = rejectReason;
    }
    
    if (status === 'counter_offer' && counterOffer) {
      updateData.counter_offer = counterOffer;
      if (shippingCostJpy !== undefined) {
        updateData.shipping_cost_jpy = shippingCostJpy;
      }
    }
    
    if (customerCounterOffer !== undefined) {
      updateData.customer_counter_offer = customerCounterOffer;
      updateData.customer_counter_offer_used = true;
    }
    
    if (customerAction === 'accept_counter') {
      updateData.status = 'approved';
      updateData.approved_at = new Date().toISOString();
      updateData.final_price = currentData.counter_offer;
    }
    
    if (customerAction === 'reject_counter') {
      updateData.admin_needs_confirm = true;
    }
    
    if (finalStatus) {
      updateData.final_status = finalStatus;
      if (finalStatus === 'won') {
        updateData.final_price = currentData.counter_offer || currentData.max_bid;
      }
    }
    
    if (finalPrice !== undefined) {
      updateData.final_price = finalPrice;
    }
    
    if (customerMessage !== undefined) {
      updateData.customer_message = customerMessage;
    }
    
    if (adminNeedsConfirm !== undefined) {
      updateData.admin_needs_confirm = adminNeedsConfirm;
    }
    
    // 顧客確認時の処理
    if (customerConfirmed !== undefined) {
      updateData.customer_confirmed = customerConfirmed;
      
      if (customerConfirmed && currentData.final_status === 'won') {
        // 購入済みテーブルに追加
        const purchasedItem = {
          id: currentData.id,
          product_title: currentData.product_title,
          product_image: currentData.product_image,
          product_url: currentData.product_url,
          final_price: currentData.final_price,
          customer_email: currentData.customer_email,
          customer_name: currentData.customer_name,
          confirmed_at: new Date().toISOString()
        };
        
        await supabase
          .from('purchased_items')
          .insert([purchasedItem]);
      }
    }
    
    // データを更新
    const { data, error } = await supabase
      .from('bid_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to update bid request' },
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
      { error: 'Failed to update bid request' },
      { status: 500 }
    );
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