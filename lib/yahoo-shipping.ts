import { calculateDefaultShippingCost } from '@/lib/utils';

/**
 * 解決された送料情報のインターフェース
 */
export interface ResolvedShippingCost {
  /** 算出された国内送料 (JPY) */
  shippingCost: number;
  /** 送料種別: 'actual' (出品者設定実送料) | 'free' (送料無料) | 'csv_fallback' (送料CSVフォールバック) */
  shippingType: 'actual' | 'free' | 'csv_fallback';
  /** 配送方法の名称（例: '飛脚宅配便（佐川急便）', 'おてがる配送ネコポス', '送料無料（出品者負担）', '推定国内送料（CSV）'） */
  shippingMethodName: string;
  /** 出品者側で送料が具体的に設定されていたかどうか */
  isShippingConfigured: boolean;
  /** 茨城県宛配送情報などの追加詳細 */
  deliveryNote?: string;
}

/**
 * ストア出品向け送料API (/web/api/itempage/v1/shipments/shopping) を呼び出して茨城県宛の最安送料を取得する内部ヘルパー
 */
async function fetchStoreShippingCost(params: {
  auctionId: string;
  sellerId?: string;
  itemCode?: string;
  price?: number;
  postageSet?: number | string;
  weight?: number | string;
}): Promise<ResolvedShippingCost | null> {
  const { auctionId, sellerId, itemCode, price, postageSet, weight } = params;

  if (!sellerId && !itemCode) {
    return null;
  }

  try {
    const searchParams = new URLSearchParams({ prefCode: '08' });
    if (sellerId) searchParams.set('sellerId', String(sellerId));
    if (itemCode) searchParams.set('itemCode', String(itemCode));
    if (price) searchParams.set('price', String(price));
    if (postageSet) searchParams.set('postageSet', String(postageSet));
    if (weight) searchParams.set('weight', String(weight));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const storeApiUrl = `https://auctions.yahoo.co.jp/web/api/itempage/v1/shipments/shopping?${searchParams.toString()}`;
    const response = await fetch(storeApiUrl, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': `https://auctions.yahoo.co.jp/jp/auction/${auctionId}`
      }
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const json = await response.json();

      if (json.isFreeShipping === true || json.lowestPrice === 0) {
        return {
          shippingCost: 0,
          shippingType: 'free',
          shippingMethodName: json.mainMethodName || '送料無料（出品者負担）',
          isShippingConfigured: true,
          deliveryNote: 'ヤフオクストア出品者負担のため国内送料無料'
        };
      }

      if (typeof json.lowestPrice === 'number' && json.lowestPrice > 0) {
        return {
          shippingCost: json.lowestPrice,
          shippingType: 'actual',
          shippingMethodName: json.mainMethodName || 'ヤフオクストア設定送料（茨城県宛）',
          isShippingConfigured: true,
          deliveryNote: `茨城県宛確定送料: ${json.mainMethodName || ''}`
        };
      }

      if (Array.isArray(json.methods) && json.methods.length > 0) {
        let minimumFee: number | null = null;
        let selectedMethodName = '';

        for (const method of json.methods) {
          if (typeof method.shippingPrice === 'number' && method.shippingPrice > 0) {
            if (minimumFee === null || method.shippingPrice < minimumFee) {
              minimumFee = method.shippingPrice;
              selectedMethodName = method.name || '';
            }
          }
          if (Array.isArray(method.aucShippingPrices)) {
            for (const p of method.aucShippingPrices) {
              if (typeof p.price === 'number' && p.price > 0) {
                if (minimumFee === null || p.price < minimumFee) {
                  minimumFee = p.price;
                  selectedMethodName = method.name || '';
                }
              }
            }
          }
        }

        if (minimumFee !== null && minimumFee > 0) {
          return {
            shippingCost: minimumFee,
            shippingType: 'actual',
            shippingMethodName: selectedMethodName || json.mainMethodName || 'ヤフオクストア設定送料（茨城県宛）',
            isShippingConfigured: true,
            deliveryNote: `茨城県宛確定送料: ${selectedMethodName}`
          };
        }
      }
    }
  } catch (storeError) {
    console.warn(`Yahoo store shipping API warning for ${auctionId}:`, storeError);
  }

  return null;
}

/**
 * 通常出品向け送料API (/web/api/itempage/v1/shipments/auction/items/{id}) を呼び出して茨城県宛の最安送料を取得する内部ヘルパー
 */
async function fetchRegularAuctionShippingCost(auctionId: string): Promise<ResolvedShippingCost | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const apiUrl = `https://auctions.yahoo.co.jp/web/api/itempage/v1/shipments/auction/items/${encodeURIComponent(auctionId)}?prefCode=08`;
    const apiResponse = await fetch(apiUrl, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': `https://auctions.yahoo.co.jp/jp/auction/${auctionId}`
      }
    });

    clearTimeout(timeoutId);

    if (apiResponse.ok) {
      const json = await apiResponse.json();

      if (json.isFreeShipping === true || json.lowestPrice === 0) {
        return {
          shippingCost: 0,
          shippingType: 'free',
          shippingMethodName: json.mainMethodName || '送料無料（出品者負担）',
          isShippingConfigured: true,
          deliveryNote: '出品者負担のため国内送料無料'
        };
      }

      if (typeof json.lowestPrice === 'number' && json.lowestPrice > 0) {
        return {
          shippingCost: json.lowestPrice,
          shippingType: 'actual',
          shippingMethodName: json.mainMethodName || 'ヤフオク設定送料（茨城県宛）',
          isShippingConfigured: true,
          deliveryNote: `茨城県宛確定送料: ${json.mainMethodName || ''}`
        };
      }

      if (Array.isArray(json.methods) && json.methods.length > 0) {
        let minimumFee: number | null = null;
        let selectedMethodName = '';

        for (const method of json.methods) {
          if (typeof method.shippingPrice === 'number' && method.shippingPrice > 0) {
            if (minimumFee === null || method.shippingPrice < minimumFee) {
              minimumFee = method.shippingPrice;
              selectedMethodName = method.name || '';
            }
          }

          if (Array.isArray(method.aucShippingPrices)) {
            for (const priceItem of method.aucShippingPrices) {
              if (typeof priceItem.price === 'number' && priceItem.price > 0) {
                if (minimumFee === null || priceItem.price < minimumFee) {
                  minimumFee = priceItem.price;
                  selectedMethodName = method.name || '';
                }
              }
            }
          }
        }

        if (minimumFee !== null && minimumFee > 0) {
          return {
            shippingCost: minimumFee,
            shippingType: 'actual',
            shippingMethodName: selectedMethodName || json.mainMethodName || 'ヤフオク設定送料（茨城県宛）',
            isShippingConfigured: true,
            deliveryNote: `茨城県宛確定送料: ${selectedMethodName}`
          };
        }
      }
    }
  } catch (apiError) {
    console.warn(`Yahoo regular shipping API warning for ${auctionId}:`, apiError);
  }

  return null;
}

/**
 * ヤフオク商品IDおよび商品情報から、国内送料（茨城県宛）を判定・算出する共通関数
 * 
 * 判定ロジック:
 * 1. 出品者負担（送料無料）の判定 ➜ 送料0円 (isShippingConfigured: true)
 * 2. itemDataが未指定の場合: 商品ページからitemDataを直接取得して補完
 * 3. ヤフオクストア出品判定（isStore または aucShoppingItemInfo） ➜ ストア送料API (/shipments/shopping?prefCode=08)
 * 4. 通常出品用ヤフオク送料API (/shipments/auction/items/{id}?prefCode=08)
 * 5. ページ内データ（全国一律送料など）の判定
 * 6. HTML内正規表現抽出フォールバック（送料無料判定含む）
 * 7. 上記ですべて未設定（着払い、未定、落札後連絡など）の場合 ➜ 送料CSV (calculateDefaultShippingCost) から読み込み
 * 
 * @param params 商品ID、タイトル、URL、パース済みitemDataなど
 * @returns 判定・算出された送料情報
 */
export async function resolveItemShippingCost(params: {
  auctionId: string;
  title?: string | null;
  url?: string | null;
  itemData?: any;
  html?: string;
  categoryId?: string | null;
}): Promise<ResolvedShippingCost> {
  const { auctionId, title, url } = params;
  let itemData = params.itemData;
  let pageHtml = params.html;
  const cleanAid = auctionId && auctionId !== 'yjauctions' ? auctionId : '';

  // 1. 引数itemDataがある場合の送料無料判定（出品者負担）
  const isFreeSeller =
    itemData?.chargeForShipping === 'free' ||
    itemData?.chargeForShipping === 'seller' ||
    itemData?.isFreeShipping === true;

  if (isFreeSeller) {
    return {
      shippingCost: 0,
      shippingType: 'free',
      shippingMethodName: '送料無料（出品者負担）',
      isShippingConfigured: true,
      deliveryNote: '出品者負担のため国内送料無料'
    };
  }

  // 2. itemDataが未指定、または情報が不足している場合：商品ページから__NEXT_DATA__を取得して補完
  if (cleanAid && (!itemData || !itemData.chargeForShipping)) {
    try {
      const pageUrl = `https://auctions.yahoo.co.jp/jp/auction/${cleanAid}`;
      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(3500)
      });
      if (res.ok) {
        pageHtml = await res.text();
        const match = pageHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          const scrapedItem = parsed?.props?.pageProps?.initialState?.item?.detail?.item;
          if (scrapedItem) {
            itemData = scrapedItem;

            // スクレイピングしたitemDataから送料無料判定（最優先）
            if (
              scrapedItem.chargeForShipping === 'free' ||
              scrapedItem.chargeForShipping === 'seller' ||
              scrapedItem.isFreeShipping === true
            ) {
              return {
                shippingCost: 0,
                shippingType: 'free',
                shippingMethodName: '送料無料（出品者負担）',
                isShippingConfigured: true,
                deliveryNote: '出品者負担のため国内送料無料'
              };
            }
          }
        }
      }
    } catch (pageErr) {
      console.warn(`HTML inspection fallback warning for ${cleanAid}:`, pageErr);
    }
  }

  // 3. ヤフオクストア出品の場合の送料API呼び出し
  const isStore = itemData?.seller?.isStore === true || !!itemData?.aucShoppingItemInfo;
  if (cleanAid && isStore) {
    const sellerId = itemData?.aucShoppingItemInfo?.shoppingSellerId || itemData?.seller?.id;
    const itemCode = itemData?.aucShoppingItemInfo?.shoppingItemCode || cleanAid;
    const postageSet = itemData?.aucShoppingItemInfo?.postageSetId || itemData?.aucShoppingItemInfo?.shoppingItemInfo?.postageSet;
    const price = itemData?.taxinPrice || itemData?.taxinStartPrice || itemData?.price || itemData?.currentPrice || 0;
    const weight = itemData?.aucShoppingItemInfo?.weight;

    const storeShipping = await fetchStoreShippingCost({
      auctionId: cleanAid,
      sellerId,
      itemCode,
      price,
      postageSet,
      weight
    });

    if (storeShipping) {
      return storeShipping;
    }
  }

  // 4. 通常出品用ヤフオク送料API（茨城県宛: prefCode=08）の呼び出し
  if (cleanAid) {
    const regularShipping = await fetchRegularAuctionShippingCost(cleanAid);
    if (regularShipping) {
      return regularShipping;
    }
  }

  // 5. ページ内データ（itemData.shipping.methods）の確認（全国一律送料など）
  if (Array.isArray(itemData?.shipping?.methods)) {
    let minimumFlatFee: number | null = null;
    let flatMethodName = '';

    for (const method of itemData.shipping.methods) {
      if (method.isFlatFee && typeof method.shippingFee === 'number' && method.shippingFee > 0) {
        if (minimumFlatFee === null || method.shippingFee < minimumFlatFee) {
          minimumFlatFee = method.shippingFee;
          flatMethodName = method.name || '';
        }
      }
    }

    if (minimumFlatFee !== null && minimumFlatFee > 0) {
      return {
        shippingCost: minimumFlatFee,
        shippingType: 'actual',
        shippingMethodName: flatMethodName || '全国一律送料',
        isShippingConfigured: true,
        deliveryNote: `全国一律送料: ${flatMethodName}`
      };
    }
  }

  // 6. HTML内からの送料抽出（正規表現フォールバック）
  if (pageHtml) {
    // 送料無料の文言マッチング
    if (pageHtml.includes('送料無料（出品者負担）') || pageHtml.includes('送料無料(出品者負担)') || pageHtml.includes('>送料無料<')) {
      return {
        shippingCost: 0,
        shippingType: 'free',
        shippingMethodName: '送料無料（出品者負担）',
        isShippingConfigured: true,
        deliveryNote: '出品者負担のため国内送料無料'
      };
    }

    const shippingPatterns = [
      /送料[：:\s]*¥?([\d,]+)\s*円/,
      /配送料[：:\s]*¥?([\d,]+)\s*円/,
      /送料[^<]*?<[^>]*?>([\d,]+)円/
    ];
    for (const pattern of shippingPatterns) {
      const match = pageHtml.match(pattern);
      if (match && match[1]) {
        const extracted = parseInt(match[1].replace(/,/g, ''), 10);
        if (!isNaN(extracted) && extracted > 0) {
          return {
            shippingCost: extracted,
            shippingType: 'actual',
            shippingMethodName: '商品ページ記載送料',
            isShippingConfigured: true,
            deliveryNote: '商品ページ記載の送料'
          };
        }
      }
    }
  }

  // 7. 送料が未設定（着払い、送料未定、落札後連絡など）の場合: 送料CSVから読み込み
  const effectiveTitle = title || itemData?.title || itemData?.name || '';
  let effectiveUrl = url || (cleanAid ? `https://auctions.yahoo.co.jp/jp/auction/${cleanAid}` : '');

  // カテゴリIDの自動抽出・補完（URL既存のauccat、引数のcategoryId、HTMLのパンくずやcatidから全カテゴリIDをマージしてeffectiveUrlに付与）
  const allCategoryIds: string[] = [];

  // 1) 既存のeffectiveUrlに含まれるauccatを取得
  const existingAuccatMatch = effectiveUrl.match(/[?&]auccat=([^&]+)/);
  if (existingAuccatMatch) {
    allCategoryIds.push(...existingAuccatMatch[1].split(',').map(s => s.trim()).filter(Boolean));
  }

  // 2) 引数で渡されたcategoryIdを取得
  if (params.categoryId) {
    allCategoryIds.push(...params.categoryId.split(',').map(s => s.trim()).filter(Boolean));
  }

  // 3) HTMLのパンくずリスト・catidメタ情報から抽出
  if (pageHtml) {
    const breadcrumbMatches = Array.from(
      pageHtml.matchAll(/auctions\.yahoo\.co\.jp\/(?:category\/list\/(\d+)|list\d+\/(\d+)-category\.html)/g)
    );
    const ids = breadcrumbMatches.map(m => m[1] || m[2]).filter(Boolean);
    const catidMatches = Array.from(pageHtml.matchAll(/"catid\d+"\s*:\s*"(\d+)"/g));
    if (catidMatches.length > 0) {
      ids.push(...catidMatches.map(m => m[1]));
    }
    allCategoryIds.push(...ids);
  }

  const uniqueCatIds = Array.from(new Set(allCategoryIds));
  if (uniqueCatIds.length > 0) {
    const combinedCats = uniqueCatIds.join(',');
    if (effectiveUrl.includes('auccat=')) {
      effectiveUrl = effectiveUrl.replace(/([?&])auccat=[^&]+/, (_match, prefix) => prefix + 'auccat=' + combinedCats);
    } else {
      effectiveUrl += (effectiveUrl.includes('?') ? '&' : '?') + 'auccat=' + combinedCats;
    }
  }

  const fallbackShippingCost = calculateDefaultShippingCost(effectiveTitle, effectiveUrl);

  return {
    shippingCost: fallbackShippingCost,
    shippingType: 'csv_fallback',
    shippingMethodName: '推定国内送料（CSV）',
    isShippingConfigured: false,
    deliveryNote: '出品者の送料が未設定（着払い・未定等）のためCSVマスターより推定'
  };
}
