const { createClient } = require('@supabase/supabase-js');
const { generateAndUploadReceipt } = require('./lib/receipt-generator');
require('dotenv').config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const payment = {
    id: "pay_mybt295vzvbri4pf",
    value: 2040,
    status: "RECEIVED_IN_CASH",
    billingType: "PIX",
    externalReference: "17851982815198240"
  };
  
  const bidRequestIds = payment.externalReference.split(',').map(id => id.trim()).filter(id => id);

  const { data: items, error: itemsError } = await supabaseAdmin
    .from('bid_requests')
    .select('id, total_jpy, customer_email, customer_name, final_price, customer_counter_offer, customer_counter_offer_used, counter_offer, max_bid, customer_id')
    .in('id', bidRequestIds);

  const brlRate = 5.65;
  const jpyRate = 150;
  const totalJpySum = items.reduce((sum, item) => sum + (Number(item.total_jpy) || 0), 0);
  let thirdPartyRepasseBrl = (totalJpySum / jpyRate) * brlRate;
  if (thirdPartyRepasseBrl > payment.value) {
    thirdPartyRepasseBrl = payment.value * 0.9;
  }
  const systemFeeBrl = payment.value - thirdPartyRepasseBrl;

  console.log('Generating PDF...');
  let receiptUrl = '';
  try {
    const uploadedUrl = await generateAndUploadReceipt({
      receiptNumber: payment.id.replace('pay_', '').substring(0, 8).toUpperCase(),
      customerName: items[0].customer_name || 'Customer',
      paymentDate: new Date().toLocaleDateString('pt-BR'),
      totalAmountBrl: payment.value,
      systemFeeBrl: systemFeeBrl,
      thirdPartyRepasseBrl: thirdPartyRepasseBrl,
      paymentMethod: payment.billingType === 'PIX' ? 'PIX' : 'Cartão de Crédito',
    });
    receiptUrl = uploadedUrl || '';
    console.log('URL:', receiptUrl);
  } catch (pdfErr) {
    console.error('[ASAAS Webhook] PDF生成エラー:', pdfErr);
  }
}

run().catch(console.error);
