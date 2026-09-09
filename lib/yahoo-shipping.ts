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
 * ヤフオク商品IDおよび商品情報から、国内送料（茨城県宛）を判定・算出する共通関数
 * 
 * 判定ロジック:
 * 1. 出品者負担（送料無料）の判定 ➜ 送料0円 (isShippingConfigured: true)
 * 2. ヤフオク内部送料API (/web/api/itempage/v1/shipments/auction/items/{id}?prefCode=08) による茨城県宛送料取得
 * 3. ページ内データ（全国一律送料など）の判定
 * 4. 上記で送料が未設定（着払い、未定、落札後連絡など）の場合 ➜ 送料CSV (calculateDefaultShippingCost) から読み込み
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
}): Promise<ResolvedShippingCost> {
  const { auctionId, title, url, itemData, html } = params;

  // 1. 送料無料の判定（出品者負担）
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

  // 2. ヤフオク内部送料API（茨城県宛: prefCode=08）の呼び出し
  if (auctionId && auctionId !== 'yjauctions') {
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

        // APIから送料無料フラグが返ってきた場合
        if (json.isFreeShipping === true) {
          return {
            shippingCost: 0,
            shippingType: 'free',
            shippingMethodName: json.mainMethodName || '送料無料（出品者負担）',
            isShippingConfigured: true,
            deliveryNote: '出品者負担のため国内送料無料'
          };
        }

        // 最安送料（lowestPrice）が正の数値として設定されている場合
        if (typeof json.lowestPrice === 'number' && json.lowestPrice > 0) {
          return {
            shippingCost: json.lowestPrice,
            shippingType: 'actual',
            shippingMethodName: json.mainMethodName || 'ヤフオク設定送料（茨城県宛）',
            isShippingConfigured: true,
            deliveryNote: `茨城県宛確定送料: ${json.mainMethodName || ''}`
          };
        }

        // methods 配列から茨城県宛の具体的な送料を走査
        if (Array.isArray(json.methods) && json.methods.length > 0) {
          let minimumFee: number | null = null;
          let selectedMethodName = '';

          for (const method of json.methods) {
            // direct fee
            if (typeof method.shippingPrice === 'number' && method.shippingPrice > 0) {
              if (minimumFee === null || method.shippingPrice < minimumFee) {
                minimumFee = method.shippingPrice;
                selectedMethodName = method.name || '';
              }
            }

            // aucShippingPrices 配列内の送料
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
      // API接続タイムアウトまたはパース失敗時は次のフォールバックへ進む
      console.warn(`Yahoo shipping API warning for ${auctionId}:`, apiError);
    }
  }

  // 3. ページ内データ（itemData.shipping.methods）の確認（全国一律送料など）
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

  // 4. HTML内からの送料抽出（正規表現フォールバック）
  if (html) {
    const shippingPatterns = [
      /送料[：:\s]*¥?([\d,]+)\s*円/,
      /配送料[：:\s]*¥?([\d,]+)\s*円/,
      /送料[^<]*?<[^>]*?>([\d,]+)円/
    ];
    for (const pattern of shippingPatterns) {
      const match = html.match(pattern);
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

  // 5. 送料が未設定（着払い、送料未定、落札後連絡など）の場合: 送料CSVから読み込み
  const fallbackShippingCost = calculateDefaultShippingCost(title, url);

  return {
    shippingCost: fallbackShippingCost,
    shippingType: 'csv_fallback',
    shippingMethodName: '推定国内送料（CSV）',
    isShippingConfigured: false,
    deliveryNote: '出品者の送料が未設定（着払い・未定等）のためCSVマスターより推定'
  };
}
