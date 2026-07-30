import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { calculateJapanSendAmount } from '@/lib/utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const targetMonth = searchParams.get('month'); // e.g. "2026-07"

    if (!targetMonth) {
      return NextResponse.json({ error: 'Month parameter is required' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (adminRole?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 1. 全ユーザー情報を取得して、B001とブラジルエージェントを特定
    const { data: allUsers } = await supabaseAdmin
      .from('user_roles')
      .select('*');
      
    if (!allUsers) return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });

    const targetUserIds = allUsers.filter(u => {
      const isB001Linked = u.agent_customer_id === 'B001' || u.customer_id === 'B001';
      const country = (u.country || '').trim().toLowerCase();
      const isBrasilAgent = u.role === 'agent' && (country === 'brasil' || country === 'brazil');
      return isB001Linked || isBrasilAgent;
    }).map(u => u.id);

    if (targetUserIds.length === 0) {
      return NextResponse.json({
        totalCustomerPayment: 0,
        unpaidCustomerPayment: 0,
        systemFee: 0,
        japanPayout: 0
      });
    }

    // 2. 指定された月の 'purchased', 'completed' な requests を取得
    const startDate = `${targetMonth}-01T00:00:00.000Z`;
    const dateObj = new Date(startDate);
    dateObj.setMonth(dateObj.getMonth() + 1);
    const endDate = dateObj.toISOString();

    const { data: requests, error: reqError } = await supabaseAdmin
      .from('requests')
      .select('*')
      .in('user_id', targetUserIds)
      .in('status', ['purchased', 'completed'])
      .gte('created_at', startDate)
      .lt('created_at', endDate);

    if (reqError) {
      console.error('Error fetching requests for financials:', reqError);
      return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
    }

    // 3. 計算
    let totalCustomerPayment = 0;
    let unpaidCustomerPayment = 0;
    let systemFee = 0; // FFGN売上
    let japanPayout = 0; // 商品立替金

    for (const req of (requests || [])) {
      const userDoc = allUsers.find(u => u.id === req.user_id);
      
      const finalPrice = parseFloat(req.final_price) || 0;
      
      let finalMaxBidUsd = req.max_bid;
      if (req.customer_counter_offer_used) {
        finalMaxBidUsd = req.counter_offer || req.max_bid;
      } else if (req.customer_counter_offer) {
        finalMaxBidUsd = req.customer_counter_offer;
      }
      
      const itemDummy = {
        customerId: userDoc?.customer_id,
        agentCustomerId: userDoc?.agent_customer_id,
        country: userDoc?.country
      };
      
      const payoutAmount = calculateJapanSendAmount(itemDummy, finalMaxBidUsd, 150);
      const isPaid = req.paid_brazil || req.paid_paraguay || req.paid || false;

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
