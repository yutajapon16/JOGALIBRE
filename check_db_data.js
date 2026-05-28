const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: allReqs, error: err1 } = await supabase.from('bid_requests').select('customer_id');
  if (err1) {
    console.error("Error 1:", err1);
    return;
  }
  
  const notNull = allReqs.filter(r => r.customer_id !== null).length;
  console.log(`Total bid requests: ${allReqs.length} | customer_id not null: ${notNull}`);

  // 各ユーザーのメールアドレスとcustomer_idのリスト
  const { data: users, error: err2 } = await supabase.from('user_roles').select('email, customer_id, id');
  if (err2) {
    console.error("Error 2:", err2);
    return;
  }
  console.log("Users in DB (email, customer_id, id):");
  users.forEach(u => {
    console.log(`Email: ${u.email} | CustomerID: ${u.customer_id} | UUID: ${u.id}`);
  });
}

run();
