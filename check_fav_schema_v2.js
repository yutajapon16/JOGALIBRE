const { createClient } = require('@supabase/supabase-client');
require('dotenv').config({ path: '.env.local' });

async function check() {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // 実際に1件取得してプロパティを確認
        const { data, error } = await supabase.from('favorites').select('*').limit(1);
        if (error) {
            console.error('Fetch Error:', error);
            return;
        }

        if (data && data.length > 0) {
            console.log('Available Columns:', Object.keys(data[0]));
        } else {
            // データがない場合は rpc または直接メタデータを叩く（権限があれば）
            console.log('No data found in favorites table. Trying to insert a dummy to see error...');
            const { error: insError } = await supabase.from('favorites').insert([{ user_id: '00000000-0000-0000-0000-000000000000', product_id: 'test' }]);
            console.log('Insert attempt error (expected due to dummy ID but may contain column info):', insError?.message);
        }
    } catch (e) {
        console.error('Script Error:', e);
    }
}
check();
