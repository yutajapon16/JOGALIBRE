export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { calculateJapanSendAmount } from '@/lib/utils';
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const targetMonth = searchParams.get('month'); // e.g. "2026-07"

    if (!targetMonth) {
      return NextResponse.json({ error: 'Month parameter is required' }, { status: 400 });
    }

    // 1. 認証チェック
    let user = await getUserFromRequest(req);
    if (!user) {
      const supabase = await getSupabaseServer();
      const { data: { user: cookieUser } } = await supabase.auth.getUser();
      user = cookieUser;
    }

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (adminRole?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. 全ユーザー情報を取得して、B001とブラジルエージェントを特定
    const { data: allUsers } = await supabaseAdmin
      .from('user_roles')
      .select('*');
      
    if (!allUsers) return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });

    const targetUserEmails = allUsers.filter(u => {
      const isB001Linked = u.agent_customer_id === 'B001' || u.customer_id === 'B001';
      const country = (u.country || '').trim().toLowerCase();
      const isBrasilAgent = u.role === 'agent' && (country === 'brasil' || country === 'brazil');
      return isB001Linked || isBrasilAgent;
    }).map(u => (u.email || '').trim().toLowerCase()).filter(Boolean);

    if (targetUserEmails.length === 0) {
      return NextResponse.json({
        totalCustomerPayment: 0,
        unpaidCustomerPayment: 0,
        systemFee: 0,
        japanPayout: 0
      });
    }

    // 3. 指定された月の落札済み（final_status: 'won'）な bid_requests を取得
    const startDate = `${targetMonth}-01T00:00:00.000Z`;
    const dateObj = new Date(startDate);
    dateObj.setMonth(dateObj.getMonth() + 1);
    const endDate = dateObj.toISOString();

    const { data: requests, error: reqError } = await supabaseAdmin
      .from('bid_requests')
      .select('*')
      .eq('final_status', 'won')
      .gte('created_at', startDate)
      .lt('created_at', endDate);

    if (reqError) {
      console.error('Error fetching bid_requests for financials:', reqError);
      return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
    }

    // 対象ユーザーのリクエストに絞り込み
    const filteredRequests = (requests || []).filter(r => {
      const email = (r.customer_email || '').trim().toLowerCase();
      return targetUserEmails.includes(email);
    });

    // 4. 計算
    let totalCustomerPayment = 0;
    let unpaidCustomerPayment = 0;
    let systemFee = 0; // FFGN売上
    let japanPayout = 0; // 商品立替金

    for (const req of filteredRequests) {
      const email = (req.customer_email || '').trim().toLowerCase();
      const userDoc = allUsers.find(u => (u.email || '').trim().toLowerCase() === email);
      
      const finalPrice = parseFloat(req.final_price) || 0;
      const finalMaxBidUsd = req.max_bid || 0;
      
      const itemDummy = {
        customerId: userDoc?.customer_id,
        agentCustomerId: userDoc?.agent_customer_id,
        country: userDoc?.country
      };
      
      const payoutAmount = req.japan_send_usd !== null && req.japan_send_usd !== undefined
        ? req.japan_send_usd
        : calculateJapanSendAmount(itemDummy, finalPrice || finalMaxBidUsd, 150);
      const isPaid = req.paid || false;

      totalCustomerPayment += finalPrice;
      if (!isPaid) {
        unpaidCustomerPayment += finalPrice;
      }

      japanPayout += payoutAmount;
      systemFee += (finalPrice - payoutAmount);
    }

    return NextResponse.json({
      totalCustomerPayment,
      unpaidCustomerPayment,
      systemFee,
      japanPayout
    });

  } catch (error) {
    console.error('Financials API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
