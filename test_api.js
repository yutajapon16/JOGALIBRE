const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  try {
    const { data: users, error: usersError } = await supabase
      .from('user_roles')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: requests, error: requestsError } = await supabase
      .from('bid_requests')
      .select('*')
      .eq('final_status', 'won')
      .eq('customer_confirmed', true);

    console.log("Total Users in DB:", users.length);
    console.log("Total Requests in DB:", requests.length);

    const userRequestsMap = new Map();
    requests.forEach(req => {
      const key = req.customer_email; 
      if (key) {
        if (!userRequestsMap.has(key)) {
          userRequestsMap.set(key, []);
        }
        userRequestsMap.get(key).push(req);
      }
    });

    const compiledUsers = users.map(u => {
      const userReqs = u.email ? (userRequestsMap.get(u.email) || []) : [];
      const unpaidCount = userReqs.filter(r => !r.paid).length;
      const unpaidAmount = userReqs.filter(r => !r.paid).reduce((sum, r) => sum + (r.final_price || 0), 0);
      const paidCount = userReqs.filter(r => r.paid).length;
      const paidAmount = userReqs.filter(r => r.paid).reduce((sum, r) => sum + (r.final_price || 0), 0);

      return {
        email: u.email,
        role: u.role,
        fullName: u.full_name,
        customerId: u.customer_id,
        unpaidAmount,
        paidAmount
      };
    });

    console.log("Compiled Users:");
    compiledUsers.forEach(u => {
      console.log(`Email: ${u.email} | Role: ${u.role} | ID: ${u.customerId} | Name: ${u.fullName} | Unpaid: $${u.unpaidAmount} | Paid: $${u.paidAmount}`);
    });

  } catch (e) {
    console.error(e);
  }
}

run();
