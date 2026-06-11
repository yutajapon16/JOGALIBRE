import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderCsvEmail } from '@/lib/resend';
import { getResilientExchangeRate } from '@/lib/exchange';

export async function GET(request: Request) {
  // Vercel Cron からの認証チェック（必要に応じて）
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // 1. 最新の為替レートを取得（タイムアウト＆メモリキャッシュ保護）
    let exchangeRate = 150;
    try {
      const rateData = await getResilientExchangeRate();
      exchangeRate = rateData.rates.JPY;
    } catch (err) {
      console.error('Error fetching exchange rate in cron, using fallback:', err);
    }

    // 2. 「承認済」ステータスの全注文を取得（送信済み・未送信を問わず、現在の全タスクリスト）
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('bid_requests')
      .select('*')
      .eq('status', 'approved')
      .is('final_status', null)
      .eq('customer_confirmed', false)
      .order('product_end_time', { ascending: true });

    if (ordersError) throw ordersError;
    if (!orders || orders.length === 0) {
      return NextResponse.json({ message: 'No approved orders to export' });
    }

    // 3. ユーザー情報を一括取得
    const emails = Array.from(new Set(orders.map(o => o.customer_email)));
    const { data: users, error: usersError } = await supabaseAdmin
      .from('user_roles')
      .select('email, customer_id, full_name, agent_customer_id, country')
      .in('email', emails);

    if (usersError) throw usersError;

    const userMap = new Map(users?.map(u => [u.email, u]));

    // 4. CSVデータを生成
    const FOB_JPY = 1500;
    const csvHeaders = [
      'Order ID',
      'End Time (JST)',
      'Customer ID',
      'Customer Name',
      'Product Title',
      'Yahoo URL',
      'Max Bid (JPY)',
      'Shipping (JPY)',
      'Max Bid (USD)',
      'Exchange Rate',
      'Profit Rate',
      'FOB (JPY)',
      'Sent Date' // 13列目：初回送信日
    ];

    const escapeCSV = (val: any) => {
      const str = String(val ?? '');
      return `"${str.replace(/"/g, '""')}"`;
    };

    const csvRows = orders.map((order, index) => {
      const userInfo = userMap.get(order.customer_email);
      const customerId = userInfo?.customer_id || 'Unknown';
      const customerName = userInfo?.full_name || order.customer_name || '';
      const agentCustomerId = userInfo?.agent_customer_id;

      let profitRate = 0.4;
      if (customerId === 'B001') {
        profitRate = 0.1;
      } else if (agentCustomerId === 'B001') {
        profitRate = 0.5;
      } else if (customerId.startsWith('A')) {
        const countryLower = userInfo?.country?.trim().toLowerCase();
        if (countryLower === 'brasil' || countryLower === 'brazil') {
          profitRate = 0.3;
        } else {
          profitRate = 0.2;
        }
      }
      
      const rowIdx = index + 2;
      // ユーザー指定の正確な数式形式（カンマを含まない形式に変更）
      const formula = `=(I${rowIdx}*J${rowIdx}*(1-K${rowIdx}))-L${rowIdx}-H${rowIdx}`;

      const sentDate = order.sent_to_joga_at 
        ? new Date(order.sent_to_joga_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })
        : 'New';

      return [
        escapeCSV(order.id),
        escapeCSV(order.product_end_time),
        escapeCSV(customerId),
        escapeCSV(customerName),
        escapeCSV(order.product_title),
        escapeCSV(order.product_url),
        formula, // 数式はクォートなしで出力
        '',      // Shipping (JPY) は空
        order.max_bid,
        exchangeRate,
        profitRate,
        FOB_JPY,
        escapeCSV(sentDate)
      ].join(',');
    });

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

    // 5. メール送信
    const dateStr = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
    await sendOrderCsvEmail('export@joga.ltd', csvContent, dateStr);

    // 6. 今回初めて送った注文のみ、送信済みフラグを更新
    const newOrderIds = orders.filter(o => !o.sent_to_joga_at).map(o => o.id);
    if (newOrderIds.length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('bid_requests')
        .update({ sent_to_joga_at: new Date().toISOString() })
        .in('id', newOrderIds);

      if (updateError) throw updateError;
    }

    return NextResponse.json({ 
      success: true, 
      exportedCount: orders.length,
      date: dateStr
    });

  } catch (error: any) {
    console.error('Cron Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
