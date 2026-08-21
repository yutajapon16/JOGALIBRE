export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth-helpers';
import { calculateJapanSendAmount } from '@/lib/utils';
import { foxbitClient } from '@/lib/foxbit';

/**
 * 管理者権限チェックヘルパー
 */
async function checkAdminAuth(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) return { isAuthorized: false, user: null, error: 'Unauthorized' };

  const { data: roleData, error: roleError } = await supabaseAdmin
    .from('user_roles')
    .select('role, email')
    .eq('id', user.id)
    .single();

  if (roleError || roleData?.role !== 'admin') {
    return { isAuthorized: false, user: null, error: 'Forbidden: Admin access required' };
  }

  return { isAuthorized: true, user: { ...user, email: roleData.email || user.email }, error: null };
}

/**
 * GET: Foxbit残高・最新レート・未送金注文の集計・充足判定を取得
 */
export async function GET(request: Request) {
  try {
    const auth = await checkAdminAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.error === 'Unauthorized' ? 401 : 403 });
    }

    // 1. Foxbit APIからレートと残高を取得
    let usdtBrlRate = 5.20;
    let brlBalance = 0;
    let usdtBalance = 0;
    let foxbitConnected = false;
    let foxbitError: string | null = null;

    try {
      if (foxbitClient.isConfigured()) {
        const [rate, balances] = await Promise.all([
          foxbitClient.getUsdtBrlRate(),
          foxbitClient.getBalances().catch(err => {
            console.warn('[Foxbit API] Balances fetch warning:', err.message);
            return [];
          }),
        ]);

        usdtBrlRate = rate > 0 ? rate : 5.20;

        const brlItem = balances.find(b => b.currency_symbol?.toLowerCase() === 'brl');
        const usdtItem = balances.find(b => b.currency_symbol?.toLowerCase() === 'usdt');

        brlBalance = parseFloat(brlItem?.balance_available || brlItem?.balance || '0');
        usdtBalance = parseFloat(usdtItem?.balance_available || usdtItem?.balance || '0');
        foxbitConnected = true;
      } else {
        foxbitError = 'Foxbit API credentials not configured in environment variables.';
      }
    } catch (err: any) {
      console.error('[Foxbit API] Fetch error:', err);
      foxbitError = err.message || 'Failed to connect to Foxbit API';
    }

    // 2. system_settings から設定値（Pixキー、USDTアドレス）を取得
    const { data: settingsData } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'foxbit_settings')
      .maybeSingle();

    const foxbitSettings = settingsData?.value || {
      pix_key: process.env.FOXBIT_PIX_KEY || '',
      joga_usdt_address: process.env.JOGA_USDT_WALLET_ADDRESS || 'TAgk4wvd5rYQFU9EdwPipBwb7pzUDX52Gc',
    };

    // 3. JPY為替レートの取得 (日本送金額計算用)
    let jpyRate = 150;
    const { data: exchangeRateData } = await supabaseAdmin
      .from('exchange_rates')
      .select('rate')
      .eq('currency', 'JPY')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (exchangeRateData?.rate) {
      jpyRate = Number(exchangeRateData.rate);
    }

    // 4. 未送金の落札・決済済み注文を抽出
    // 条件: final_status = 'won' AND (paid = true OR paid_brazil = true) AND (foxbit_remittance_status = 'pending' OR foxbit_remittance_status IS NULL)
    const { data: pendingOrders, error: ordersError } = await supabaseAdmin
      .from('bid_requests')
      .select('*')
      .eq('final_status', 'won')
      .or('paid.eq.true,paid_brazil.eq.true')
      .or('foxbit_remittance_status.eq.pending,foxbit_remittance_status.is.null')
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('[Foxbit API] Error fetching pending orders:', ordersError);
      throw ordersError;
    }

    // 顧客情報を取得してマージ
    const customerEmails = Array.from(new Set((pendingOrders || []).map(o => o.customer_email).filter(Boolean)));
    let userRolesMap: Record<string, any> = {};

    if (customerEmails.length > 0) {
      const { data: usersData } = await supabaseAdmin
        .from('user_roles')
        .select('email, full_name, customer_id, agent_customer_id, country')
        .in('email', customerEmails);

      if (usersData) {
        userRolesMap = usersData.reduce((acc, u) => {
          acc[u.email] = u;
          return acc;
        }, {} as Record<string, any>);
      }
    }

    // 各注文の送金対象額（USD / BRL）を算出
    let totalBrlNeeded = 0;
    let targetUsdNeeded = 0;

    const formattedOrders = (pendingOrders || []).map(order => {
      const userInfo = userRolesMap[order.customer_email] || {};
      const orderWithUser = {
        ...order,
        customerId: userInfo.customer_id || order.customer_id,
        customerCountry: userInfo.country || order.delivery_country,
        agentCustomerId: userInfo.agent_customer_id || order.agent_customer_id,
      };

      // 1. 日本送金額 (USD) の算出
      const totalSalePrice = order.final_price || order.counter_offer || order.max_bid || 0;
      const orderUsdAmount = order.japan_send_usd !== null && order.japan_send_usd !== undefined
        ? Number(order.japan_send_usd)
        : calculateJapanSendAmount(orderWithUser, totalSalePrice, jpyRate);

      // 2. Foxbit送金指示額 (BRL) の算出（実勢レート換算、10レアル単位切り上げ）
      const orderBrlAmount = Math.ceil((orderUsdAmount * usdtBrlRate) / 10) * 10;

      totalBrlNeeded += orderBrlAmount;
      targetUsdNeeded += orderUsdAmount;

      return {
        id: order.id,
        stock_number: order.stock_number || '',
        product_title: order.product_title || order.product_title_pt || '',
        customer_name: userInfo.full_name || order.customer_name || 'Cliente',
        customer_id: userInfo.customer_id || order.customer_id || '',
        final_price: totalSalePrice,
        japan_send_usd: orderUsdAmount,
        cost_brl: orderBrlAmount,
        paid_at: order.paid_at || order.paid_brazil_at || order.created_at,
      };
    });

    // 5. 総合USD評価額と充足判定の計算
    // 総合USD評価額 = (Foxbit BRL残高 / USDTレート) + Foxbit USDT残高
    const totalFoxbitUsdValue = (brlBalance / usdtBrlRate) + usdtBalance;
    const isSufficient = totalFoxbitUsdValue >= targetUsdNeeded;
    const differenceUsd = totalFoxbitUsdValue - targetUsdNeeded;
    const fulfillmentPercent = targetUsdNeeded > 0
      ? Math.min(Math.round((totalFoxbitUsdValue / targetUsdNeeded) * 100), 999)
      : 100;

    return NextResponse.json({
      success: true,
      foxbit: {
        connected: foxbitConnected,
        error: foxbitError,
        usdt_brl_rate: usdtBrlRate,
        brl_balance: brlBalance,
        usdt_balance: usdtBalance,
        total_usd_value: Math.round(totalFoxbitUsdValue * 100) / 100,
        is_sufficient: isSufficient,
        difference_usd: Math.round(differenceUsd * 100) / 100,
        fulfillment_percent: fulfillmentPercent,
      },
      remittance: {
        total_brl_needed: totalBrlNeeded,
        target_usd_needed: targetUsdNeeded,
        orders_count: formattedOrders.length,
        orders: formattedOrders,
      },
      settings: {
        pix_key: foxbitSettings.pix_key || '',
        joga_usdt_address: foxbitSettings.joga_usdt_address || 'TAgk4wvd5rYQFU9EdwPipBwb7pzUDX52Gc',
      },
    });
  } catch (error: any) {
    console.error('[Foxbit API] Error in GET handler:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST: 一括送金完了（mark_remitted）または設定更新
 */
export async function POST(request: Request) {
  try {
    const auth = await checkAdminAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.error === 'Unauthorized' ? 401 : 403 });
    }

    const body = await request.json();
    const { action } = body;

    // アクション 1: 一括送金完了（mark_remitted）
    if (action === 'mark_remitted') {
      const { orderIds } = body;

      let query = supabaseAdmin
        .from('bid_requests')
        .update({
          foxbit_remittance_status: 'remitted',
          foxbit_remitted_at: new Date().toISOString(),
          foxbit_remitted_by: auth.user?.email || 'admin',
        });

      if (Array.isArray(orderIds) && orderIds.length > 0) {
        query = query.in('id', orderIds);
      } else {
        // orderIds未指定時は未送金全件を対象にする
        query = query
          .eq('final_status', 'won')
          .or('paid.eq.true,paid_brazil.eq.true')
          .or('foxbit_remittance_status.eq.pending,foxbit_remittance_status.is.null');
      }

      const { data, error } = await query.select('id');

      if (error) {
        console.error('[Foxbit API] Error updating remittance status:', error);
        throw error;
      }

      return NextResponse.json({
        success: true,
        message: `${data?.length || 0} 件の注文を送金済みとして記録しました。`,
        updated_count: data?.length || 0,
      });
    }

    // アクション 2: 設定情報の更新（Pixキー、JOGA USDTアドレス等）
    if (action === 'update_settings') {
      const { pix_key, joga_usdt_address } = body;

      const { data: existingSettings } = await supabaseAdmin
        .from('system_settings')
        .select('value')
        .eq('key', 'foxbit_settings')
        .maybeSingle();

      const newSettings = {
        ...(existingSettings?.value || {}),
        pix_key: pix_key !== undefined ? pix_key : existingSettings?.value?.pix_key,
        joga_usdt_address: joga_usdt_address !== undefined ? joga_usdt_address : existingSettings?.value?.joga_usdt_address,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabaseAdmin
        .from('system_settings')
        .upsert({
          key: 'foxbit_settings',
          value: newSettings,
        });

      if (upsertError) {
        console.error('[Foxbit API] Error saving settings:', upsertError);
        throw upsertError;
      }

      return NextResponse.json({
        success: true,
        message: '設定を更新しました。',
        settings: newSettings,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('[Foxbit API] Error in POST handler:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
