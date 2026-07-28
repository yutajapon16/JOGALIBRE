const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { error: err1 } = await supabase
    .from('bid_requests')
    .update({ japan_send_usd: 350 })
    .eq('stock_number', 'A003S001');
    
  if (err1) console.error('Error updating A003S001:', err1);
  else console.log('Successfully updated A003S001');

  const { error: err2 } = await supabase
    .from('bid_requests')
    .update({ japan_send_usd: 440 })
    .eq('stock_number', 'A003S002');
    
  if (err2) console.error('Error updating A003S002:', err2);
  else console.log('Successfully updated A003S002');
}

main();
