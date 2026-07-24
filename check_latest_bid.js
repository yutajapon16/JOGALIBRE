const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Querying latest manual bid_requests...");
  try {
    const { data: requests, error } = await supabase
      .from('bid_requests')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error("DB Error:", error);
      return;
    }

    console.log("Found records:");
    requests.forEach(req => {
      console.log(`ID: ${req.id}`);
      console.log(`Product ID: ${req.product_id}`);
      console.log(`Title: ${req.product_title}`);
      console.log(`created_at: ${req.created_at}`);
      console.log(`approved_at: ${req.approved_at}`);
      console.log(`updated_at: ${req.updated_at}`);
      console.log('---');
    });

  } catch (e) {
    console.error("Script error:", e);
  }
}

run();
