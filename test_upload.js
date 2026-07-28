const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const buffer = fs.readFileSync('output.pdf');
  console.log('Uploading...', buffer.length);
  
  const { data, error } = await supabaseAdmin.storage
    .from('receipts')
    .upload('test.pdf', buffer, {
      contentType: 'application/pdf',
      upsert: true
    });
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Data:', data);
    const { data: p } = supabaseAdmin.storage.from('receipts').getPublicUrl('test.pdf');
    console.log('URL:', p.publicUrl);
  }
}
run();
