import { supabaseAdmin } from './lib/supabase-admin';

async function check() {
  const { data, error } = await supabaseAdmin
    .from('bid_requests')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('Error fetching bid_requests:', error);
  } else {
    console.log('Sample bid_request data:', JSON.stringify(data?.[0], null, 2));
  }
}
check();
