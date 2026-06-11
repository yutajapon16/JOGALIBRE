import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth-helpers';

export async function POST(request: Request) {
  try {
    // 1. 管理者認証チェック
    const userFromToken = await getUserFromRequest(request);
    if (!userFromToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('id', userFromToken.id)
      .single();

    if (roleError || roleData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. FormDataの取得
    const formData = await request.formData();
    const productTitle = formData.get('productTitle') as string;
    const productUrl = formData.get('productUrl') as string | null;
    const customerId = formData.get('customerId') as string;
    const createdAt = formData.get('createdAt') as string; // 購入日時
    const finalPriceVal = formData.get('finalPrice') as string;
    const imageFile = formData.get('image') as File | null;

    if (!productTitle || !customerId || !finalPriceVal || !createdAt) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const finalPrice = parseFloat(finalPriceVal);
    if (isNaN(finalPrice)) {
      return NextResponse.json({ error: 'Invalid finalPrice' }, { status: 400 });
    }

    // 3. 顧客情報の取得（email, 氏名）
    const { data: customerRoleData, error: customerRoleError } = await supabaseAdmin
      .from('user_roles')
      .select('email, full_name')
      .eq('customer_id', customerId)
      .single();

    if (customerRoleError || !customerRoleData) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // 4. 画像のアップロード (存在する場合)
    let productImageUrl = '';
    if (imageFile && imageFile.size > 0) {
      // バケットが存在するか確認し、存在しない場合は自動作成
      const { data: bucketData, error: bucketError } = await supabaseAdmin.storage.getBucket('bid-images');
      if (bucketError) {
        console.log('Bucket "bid-images" not found, creating it...');
        const { error: createError } = await supabaseAdmin.storage.createBucket('bid-images', {
          public: true,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        });
        if (createError) {
          console.error('Failed to create bucket "bid-images":', createError);
          return NextResponse.json({ error: 'Storage bucket initialization failed: ' + createError.message }, { status: 500 });
        }
      }

      const fileBuffer = Buffer.from(await imageFile.arrayBuffer());
      const fileExt = imageFile.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}.${fileExt}`;
      const filePath = `manual-uploads/${fileName}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from('bid-images')
        .upload(filePath, fileBuffer, {
          contentType: imageFile.type,
          upsert: true
        });

      if (uploadError) {
        console.error('Image upload error:', uploadError);
        return NextResponse.json({ error: 'Failed to upload image: ' + uploadError.message }, { status: 500 });
      }

      // 公開URLの取得
      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('bid-images')
        .getPublicUrl(filePath);

      productImageUrl = publicUrl;
    }

    const recordId = Date.now().toString() + Math.floor(1000 + Math.random() * 9000).toString();

    // フォームの日付 (createdAt = "YYYY-MM-DD") と現在時刻の時・分・秒・ミリ秒をマージする
    let finalCreatedAt: string;
    try {
      const now = new Date();
      const timePart = now.toISOString().split('T')[1]; // 例: "15:20:30.123Z"
      const mergedDateTimeStr = `${createdAt}T${timePart}`;
      const parsedDate = new Date(mergedDateTimeStr);
      if (isNaN(parsedDate.getTime())) {
        throw new Error('Invalid merged date');
      }
      finalCreatedAt = parsedDate.toISOString();
    } catch (err) {
      console.warn('Failed to merge date and time, using fallback:', err);
      finalCreatedAt = new Date().toISOString();
    }

    // 5. bid_requests に手動追加レコードを登録
    const bidRequest = {
      id: recordId,
      product_id: 'm-' + recordId, // NOT NULL制約を回避するためのダミー商品ID
      product_title: productTitle,
      product_url: productUrl || '', // NOT NULL制約を回避するために空文字を設定
      product_image: productImageUrl || null,
      product_price: finalPrice,
      max_bid: finalPrice,
      customer_name: customerRoleData.full_name || customerRoleData.email.split('@')[0],
      customer_email: customerRoleData.email,
      language: 'es', // デフォルト言語
      status: 'approved',
      created_at: finalCreatedAt,
      approved_at: finalCreatedAt,
      reject_reason: null,
      counter_offer: null,
      shipping_cost_jpy: null,
      customer_counter_offer: null,
      customer_counter_offer_used: false,
      final_status: 'won',
      final_price: finalPrice,
      customer_confirmed: false,
      customer_message: null,
      admin_needs_confirm: false,
      delivery_location: 'JP'
    };

    const { data: insertedData, error: insertError } = await supabaseAdmin
      .from('bid_requests')
      .insert([bidRequest])
      .select()
      .single();

    if (insertError) {
      console.error('Insert manual bid request error:', insertError);
      return NextResponse.json({ error: 'Failed to save record: ' + insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      bidRequest: insertedData
    });

  } catch (error) {
    console.error('Critical error in manual route:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
