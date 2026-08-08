import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth-helpers';
import { translateTitle } from '@/lib/translate';
import { sendWonEmail } from '@/lib/resend';

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
    const isTodayStr = formData.get('isToday') as string | null;
    const isToday = isTodayStr === 'true';
    const finalPriceVal = formData.get('finalPrice') as string;
    const deliveryLocation = formData.get('deliveryLocation') as string | null;
    const deliveryCountry = formData.get('deliveryCountry') as string | null;
    const deliveryCity = formData.get('deliveryCity') as string | null;
    const shippingMethod = formData.get('shippingMethod') as string | null;

    // タイトルの翻訳
    let productTitleEs = null;
    let productTitlePt = null;
    if (productTitle) {
      [productTitleEs, productTitlePt] = await Promise.all([
        translateTitle(productTitle, 'es'),
        translateTitle(productTitle, 'pt')
      ]);
    }
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
      .select('email, full_name, language')
      .eq('customer_id', customerId)
      .single();

    if (customerRoleError || !customerRoleData) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // 4. 画像のアップロード (存在する場合)
    let productImageUrl = '';
    if (imageFile && imageFile.size > 0) {
      // バケットが存在するか確認し、存在しない場合は自動作成
      const { error: bucketError } = await supabaseAdmin.storage.getBucket('bid-images');
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

    // 購入日時の設定
    let finalCreatedAt: string | null = null;
    if (!isToday && createdAt) {
      try {
        // 過去などの特定日付が指定された場合、時差による日付のズレを防ぐためUTC正午（12:00:00Z）で統一して保存する
        const parsedDate = new Date(`${createdAt}T12:00:00Z`);
        if (isNaN(parsedDate.getTime())) {
          throw new Error('Invalid date format');
        }
        finalCreatedAt = parsedDate.toISOString();
      } catch (err) {
        console.warn('Failed to parse past date, using fallback to DB default:', err);
        finalCreatedAt = null;
      }
    }

    // 5. bid_requests に手動追加レコードを登録
    const bidRequest: Record<string, any> = {
      id: recordId,
      product_id: 'm-' + recordId, // NOT NULL制約を回避するためのダミー商品ID
      product_title: productTitle,
      product_title_es: productTitleEs,
      product_title_pt: productTitlePt,
      product_url: productUrl || '', // NOT NULL制約を回避するために空文字を設定
      product_image: productImageUrl || null,
      product_price: finalPrice,
      max_bid: finalPrice,
      customer_name: customerRoleData.full_name || customerRoleData.email.split('@')[0],
      customer_email: customerRoleData.email,
      language: 'es', // デフォルト言語
      status: 'approved',
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
      delivery_location: deliveryLocation || 'JP',
      delivery_country: deliveryCountry || null,
      delivery_city: deliveryCity || null,
      shipping_method: shippingMethod || 'sea',
      won_at: new Date().toISOString()
    };

    if (finalCreatedAt) {
      bidRequest.created_at = finalCreatedAt;
      bidRequest.approved_at = finalCreatedAt;
    }

    const { data: insertedData, error: insertError } = await supabaseAdmin
      .from('bid_requests')
      .insert([bidRequest])
      .select()
      .single();

    if (insertError) {
      console.error('Insert manual bid request error:', insertError);
      return NextResponse.json({ error: 'Failed to save record: ' + insertError.message }, { status: 500 });
    }

    // isToday かつ approved_at が未設定の場合、DB側で自動設定された created_at と同じ値を approved_at にコピーして更新する
    if (isToday && insertedData && !insertedData.approved_at) {
      const { data: updatedData, error: updateError } = await supabaseAdmin
        .from('bid_requests')
        .update({ approved_at: insertedData.created_at })
        .eq('id', recordId)
        .select()
        .single();
      
      if (!updateError && updatedData) {
        return NextResponse.json({
          success: true,
          bidRequest: updatedData
        });
      }
    }

    // 顧客へ落札完了メールを送信
    if (customerRoleData?.email) {
      const lang = (customerRoleData.language || 'es').toLowerCase();
      const isPt = lang === 'pt';
      const itemTitle = isPt ? (productTitlePt || productTitle) : (productTitleEs || productTitle);
      sendWonEmail(customerRoleData.email, itemTitle, lang).catch(err =>
        console.error('Manual won email send error:', err)
      );
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
