const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(
  url || "https://unpyhggedkfupjsaxhkj.supabase.co", 
  key || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVucHloZ2dlZGtmdXBqc2F4aGtqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTA0MjUxMSwiZXhwIjoyMDg2NjE4NTExfQ.z9Z-dgUoXrvO6tvtFxn3498vooaHq7zsTZICZ0bLuIE"
);

async function check() {
  const { data, error } = await supabase
    .from('deposits')
    .select('id, amount, usd_amount, receipt_url, payment_method')
    .eq('amount', 2040)
    .single();
  console.log(error ? error : JSON.stringify(data, null, 2));
}
check();
