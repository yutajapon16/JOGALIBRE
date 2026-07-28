const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(
  url || "https://unpyhggedkfupjsaxhkj.supabase.co", 
  key || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVucHloZ2dlZGtmdXBqc2F4aGtqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTA0MjUxMSwiZXhwIjoyMDg2NjE4NTExfQ.z9Z-dgUoXrvO6tvtFxn3498vooaHq7zsTZICZ0bLuIE"
);

async function check() {
  const { data: item, error } = await supabase
    .from('bid_requests')
    .select('id, status, paid_brazil, deposit_id')
    .eq('id', '17851950334835599');
  console.log('Bid request:', error ? error : JSON.stringify(item, null, 2));
  
  if (item && item.length > 0 && item[0].deposit_id) {
    const { data: dep } = await supabase.from('deposits').select('*').eq('id', item[0].deposit_id);
    console.log('Deposit:', JSON.stringify(dep, null, 2));
  } else {
    console.log('No deposit found for item');
  }
}
check();
