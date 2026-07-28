import { createClient } from '@supabase/supabase-js';
import { generateAndUploadReceipt } from './lib/receipt-generator';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data: items } = await supabase
    .from('bid_requests')
    .select('id, total_jpy, customer_email, customer_name, final_price, customer_counter_offer, counter_offer, max_bid, customer_id')
    .eq('id', '17851982815198240');
    
  console.log('Generating PDF...');
  try {
    const url = await generateAndUploadReceipt({
      customerName: items![0].customer_name || 'Customer',
      customerEmail: items![0].customer_email || '',
      paymentId: 'pay_mybt295vzvbri4pf',
      items: items!,
      totalBrl: 2040,
      totalUsd: 400,
      brlRate: 5.10,
      systemFeeBrl: 100,
      thirdPartyRepasseBrl: 1940,
      paymentMethod: 'PIX',
    });
    console.log('URL:', url);
  } catch (e) {
    console.error('Error:', e);
  }
}
run();
