const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(
  url || "https://unpyhggedkfupjsaxhkj.supabase.co", 
  key || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVucHloZ2dlZGtmdXBqc2F4aGtqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTA0MjUxMSwiZXhwIjoyMDg2NjE4NTExfQ.z9Z-dgUoXrvO6tvtFxn3498vooaHq7zsTZICZ0bLuIE"
);

async function run() {
  const payment = {
    id: "pay_369zi332nvni4zmj",
    value: 2350,
    status: "RECEIVED_IN_CASH",
    billingType: "PIX",
    externalReference: "17851960149871524"
  };
  
  const bidRequestIds = payment.externalReference.split(',').map(id => id.trim()).filter(id => id);

  const { data: items, error: itemsError } = await supabaseAdmin
    .from('bid_requests')
    .select('id, total_jpy, customer_email, customer_name, final_price, customer_counter_offer, counter_offer, max_bid, customer_id')
    .in('id', bidRequestIds);

  if (itemsError || !items || items.length === 0) {
    console.error(`[ASAAS Webhook] bid_requests 取得エラー:`, itemsError);
    return;
  }
  
  console.log('Items found:', items.length);

  const { data: settings } = await supabaseAdmin
    .from('payment_settings')
    .select('rates')
    .single();

  const brlRate = settings?.rates?.BRL || 5.65;
  const jpyRate = settings?.rates?.JPY || 150;
  
  const totalJpySum = items.reduce((sum, item) => sum + (Number(item.total_jpy) || 0), 0);
  let thirdPartyRepasseBrl = (totalJpySum / jpyRate) * brlRate;
  if (thirdPartyRepasseBrl > payment.value) {
    thirdPartyRepasseBrl = payment.value * 0.9;
  }
  const systemFeeBrl = payment.value - thirdPartyRepasseBrl;

  const usdEquivalent = payment.value / brlRate;
  
  console.log('Inserting deposit...');
  const { data: newDeposit, error: depositError } = await supabaseAdmin
    .from('deposits')
    .insert({
      customer_id: items[0].customer_id,
      amount: payment.value,
      usd_amount: usdEquivalent,
      deposit_date: new Date().toISOString().split('T')[0],
      payment_method: `asaas_${payment.billingType.toLowerCase()}`,
      deposit_type: '商品代金',
    })
    .select('id')
    .single();

  if (depositError) {
    console.error('[ASAAS Webhook] deposits 作成エラー:', depositError);
    return;
  }
  console.log('Deposit inserted:', newDeposit.id);
  
  console.log('Updating bid_requests...');
  const { error: updateError } = await supabaseAdmin
    .from('bid_requests')
    .update({
      status: 'won', 
      final_status: 'won', 
      paid_brazil: true,
      paid_brazil_at: new Date().toISOString(),
    })
    .in('id', bidRequestIds);

  if (updateError) {
    console.error('[ASAAS Webhook] bid_requests 更新エラー:', updateError);
  } else {
    console.log('Update success');
  }
}

run().catch(console.error);
