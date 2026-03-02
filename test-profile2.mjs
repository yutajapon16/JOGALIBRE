import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://unpyhggedkfupjsaxhkj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVucHloZ2dlZGtmdXBqc2F4aGtqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTA0MjUxMSwiZXhwIjoyMDg2NjE4NTExfQ.z9Z-dgUoXrvO6tvtFxn3498vooaHq7zsTZICZ0bLuIE';

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
