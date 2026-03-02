import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('user_roles').select('*').limit(10);
  console.log('User roles error:', error);
  console.log('User roles data:', data);
  
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
  console.log('Auth users error:', authError);
  console.log('Auth users:', authData?.users?.map(u => ({ id: u.id, email: u.email, meta: u.user_metadata })));
}

check();
