const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Querying database for product_url containing 1230853321...");
  try {
    const { data: requests, error } = await supabase
      .from('bid_requests')
      .select('id, product_url, product_end_time, created_at')
      .ilike('product_url', '%1230853321%');

    if (error) {
      console.error("DB Error:", error);
      return;
    }

    if (!requests || requests.length === 0) {
      console.log("No records found in bid_requests for this auction ID.");
      return;
    }

    console.log("Found records:");
    requests.forEach(req => {
      console.log(`ID: ${req.id}`);
      console.log(`URL: ${req.product_url}`);
      console.log(`product_end_time (raw): "${req.product_end_time}"`);
      console.log(`product_end_time Type: ${typeof req.product_end_time}`);
      console.log(`created_at: "${req.created_at}"`);
    });

  } catch (e) {
    console.error("Script error:", e);
  }
}

run();
