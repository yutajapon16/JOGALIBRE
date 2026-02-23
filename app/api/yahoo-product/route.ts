import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = body.url;
    const lang = body.lang || 'ja';

    if (!url || !url.includes('auctions.yahoo.co.jp')) {
      return NextResponse.json(
        { error: 'Invalid Yahoo Auctions URL' },
        { status: 400 }
      );
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const html = await response.text();

    console.log('HTML length:', html.length);

    let title = '';
    let currentPrice = 0;
    let bids = 0;
    let imageUrl = 'https://via.placeholder.com/300x200?text=Yahoo+Auction';
    let endTime = null;
    let shippingCost = 0;
    let shippingUnknown = false;
    let allImages: string[] = [];

    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);

    if (nextDataMatch) {
      try {
        const jsonData = JSON.parse(nextDataMatch[1]);
        console.log('Found __NEXT_DATA__');

        const pageProps = jsonData.props?.pageProps;

        if (pageProps) {
          const initialState = pageProps.initialState;

          if (initialState) {
            console.log('Found initialState, keys:', Object.keys(initialState).slice(0, 20));

            const itemData = initialState.item?.detail?.item || {};
            console.log('ItemData keys:', Object.keys(itemData).slice(0, 40));

            // paymentとoptionの中身を確認
            console.log('payment object:', JSON.stringify(itemData.payment, null, 2));
            console.log('option object:', JSON.stringify(itemData.option, null, 2));

            currentPrice = itemData.price ||
              itemData.currentPrice ||
              itemData.currentBidPrice ||
              itemData.startPrice ||
              0;

            bids = itemData.bids ||
              itemData.bidCount ||
              itemData.numberOfBids ||
              itemData.bidders ||
              itemData.bidOrBuy ||
              0;

            title = itemData.title ||
              itemData.name ||
              itemData.productName ||
              '';

            // 全画像URLを取得
            allImages = itemData.images?.map((img: any) => img.url) ||
              itemData.imageDetail?.map((img: any) => img.url) ||
              itemData.gallery?.map((img: any) => img.url) ||
              [];

            imageUrl = allImages[0] ||
              itemData.img?.url ||
              itemData.image ||
              itemData.imageUrl ||
              itemData.thumbnail ||
              imageUrl;

            // 終了時刻を取得（UNIXタイムスタンプまたはISO文字列）
            if (itemData.endTime) {  // ← let を削除
              // UNIXタイムスタンプの場合（秒単位）
              if (typeof itemData.endTime === 'number') {
                endTime = new Date(itemData.endTime * 1000).toISOString();
              } else if (typeof itemData.endTime === 'string') {
                endTime = itemData.endTime;
              }
            }

            console.log('End time data:', {
              rawEndTime: itemData.endTime,
              formattedEndTime: itemData.formattedEndTime,
              leftTime: itemData.leftTime,
              parsedEndTime: endTime
            });

            // 送料を取得 - HTMLから直接抽出
            console.log('chargeForShipping:', itemData.chargeForShipping);

            // 送料セクションを探す
            const shippingSection = html.match(/送料[\s\S]{0,500}?円/);
            if (shippingSection) {
              console.log('Shipping section found:', shippingSection[0].substring(0, 200));
            } else {
              console.log('Shipping section NOT found');
            }

            // HTMLから送料を抽出（複数のパターンを試す）
            const shippingPatterns = [
              // シンプルに数字+円を探す（送料の後500文字以内）
              />([\d,]+)円</,
              // カンマ区切りの数字と円
              /([\d,]+)円/,
              // 送料セクション内の金額を探す（最も一般的）
              /送料[^<]*?<[^>]*?>([\d,]+)円/,
              // gv-u-fontWeightBold クラスの中の金額
              /<span[^>]*gv-u-fontWeightBold[^>]*>([\d,]+)円<\/span>/,
              // 送料の後に続く金額（汎用）
              /送料[：:\s]*¥?([\d,]+)\s*円/,
              /配送料[：:\s]*¥?([\d,]+)\s*円/,
              // HTMLタグを含む場合
              /送料[^>]*?>\s*([\d,]+)\s*円/,
            ];

            for (const pattern of shippingPatterns) {
              const match = html.match(pattern);
              console.log('Testing pattern:', pattern, 'Match:', match ? match[1] : 'NO MATCH');
              if (match && match[1]) {
                const extractedCost = parseInt(match[1].replace(/,/g, ''));
                if (!isNaN(extractedCost) && extractedCost > 0) {
                  shippingCost = extractedCost;
                  shippingUnknown = false;
                  console.log('Found shipping cost in HTML:', shippingCost, 'from pattern:', pattern);
                  break;
                }
              }
            }

            // 送料無料の場合
            if (itemData.chargeForShipping === 'free') {
              shippingCost = 0;
              shippingUnknown = false;
            }

            // 送料が見つからない場合は不明フラグ
            if (shippingCost === 0 && itemData.chargeForShipping === 'winner') {
              shippingUnknown = true;
            }

            // 送料が0の場合、送料不明フラグを立てる
            if (shippingCost === 0) {
              shippingUnknown = true;
            }

            console.log('Shipping data:', {
              shippingCost,
              shippingUnknown,
              chargeForShipping: itemData.chargeForShipping,
              itemDataKeys: Object.keys(itemData).filter(key => key.toLowerCase().includes('ship') || key.toLowerCase().includes('delivery'))
            });

            console.log('Extracted from item.detail.item:', {
              title: title ? title.substring(0, 50) : '',
              currentPrice,
              bids,
              imageUrl: imageUrl.substring(0, 50),
              endTime
            });
          }

          console.log('Available pageProps keys:', Object.keys(pageProps).slice(0, 30));
        }
      } catch (e) {
        console.log('JSON parse error:', e);
      }
    }

    if (!title) {
      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (titleMatch) {
        title = titleMatch[1].trim();
      } else {
        const titleTag = html.match(/<title>([^<]+)<\/title>/i);
        if (titleTag) {
          title = titleTag[1].split('-')[0].trim();
        }
      }
    }

    if (imageUrl.includes('placeholder')) {
      const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
      if (ogImageMatch) {
        imageUrl = ogImageMatch[1];
      }
    }

    if (imageUrl && imageUrl.startsWith('/')) {
      imageUrl = 'https://auctions.yahoo.co.jp' + imageUrl;
    }

    const match1 = url.match(/\/([a-z0-9]+)$/);
    const match2 = url.match(/\/item\/([a-z0-9]+)/);
    const match3 = url.match(/auction\/([a-z0-9]+)/);
    const productId = (match1 && match1[1]) ||
      (match2 && match2[1]) ||
      (match3 && match3[1]) ||
      Date.now().toString();

    // 商品の説明文を抽出
    let description = '';
    const descriptionMatch = html.match(/<div[^>]*class="ProductDescription__body"[^>]*>([\s\S]*?)<\/div>/i);
    if (descriptionMatch) {
      // タグを除去してテキストのみ抽出（または簡易HTMLとして保持）
      description = descriptionMatch[1].replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').trim();
    } else {
      // 別のパターン
      const descPart = html.match(/<!--\s*description\s*-->([\s\S]*?)<!--\s*\/description\s*-->/i);
      if (descPart) {
        description = descPart[1].trim();
      }
    }

    // 説明文の翻訳 (オプション: パラメータで言語が指定されている場合)
    let translatedDescription = '';
    // ここで lang を再宣言しない

    if (description && lang !== 'ja') {
      try {
        // 長文の場合は分割が必要だが、まずはシンプルに試行
        const cleanDesc = description.replace(/<[^>]*>/g, ' ').substring(0, 2000); // 2000文字制限
        const transRes = await fetch(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=${lang}&dt=t&q=${encodeURIComponent(cleanDesc)}`
        );
        const transData = await transRes.json();
        translatedDescription = transData?.[0]?.map((x: any) => x[0]).join('') || '';
      } catch (e) {
        console.error('Description translation error:', e);
      }
    }

    // タイトルの翻訳
    let translatedTitle = title;
    if (title && lang !== 'ja') {
      try {
        const transRes = await fetch(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=${lang}&dt=t&q=${encodeURIComponent(title)}`
        );
        const transData = await transRes.json();
        translatedTitle = transData?.[0]?.[0]?.[0] || title;
      } catch (e) {
        console.error('Title translation error:', e);
      }
    }

    const product = {
      id: productId,
      title: translatedTitle || 'タイトル取得失敗',
      currentPrice: currentPrice,
      bids: bids,
      endTime: endTime,
      imageUrl: imageUrl,
      url: url,
      source: 'yahoo_url_import',
      shippingCost: shippingCost,
      shippingUnknown: shippingUnknown,
      description: description,
      translatedDescription: translatedDescription,
      titleJa: title,
      images: allImages.length > 0 ? allImages : [imageUrl]
    };

    console.log('Final product:', product);

    return NextResponse.json({ product });

  } catch (error) {
    console.error('Error fetching Yahoo product:', error);
    return NextResponse.json(
      { error: 'Failed to fetch product data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}