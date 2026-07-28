import { createClient } from '@supabase/supabase-js';
import { generateAndUploadReceipt } from './lib/receipt-generator';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// We need to polyfill supabaseAdmin inside the library
jest = require('jest-mock');
jest.mock('./lib/supabase-admin', () => {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  return { supabaseAdmin: sb };
});

async function run() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data: items } = await sb
    .from('bid_requests')
    .select('id, total_jpy, customer_email, customer_name, final_price, customer_counter_offer, counter_offer, max_bid, customer_id')
    .eq('id', '17851982815198240');
    
  console.log('Generating PDF...');
  try {
    const url = await generateAndUploadReceipt({
      receiptNumber: 'MYBT295VZV',
      customerName: items![0].customer_name || 'Customer',
      paymentDate: '27/07/2026',
      totalAmountBrl: 2040,
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
