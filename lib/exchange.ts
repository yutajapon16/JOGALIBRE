// 為替レートのレジリエンス（弾力性）管理モジュール
// 外部APIのタイムアウトや障害時に、前回成功したレート（キャッシュ）または安全なデフォルト値を返します。

export interface ExchangeRates {
  JPY: number;
  BRL: number;
  PYG: number;
  CLP: number;
  BOB: number;
  ARS: number;
}

let cachedRates: ExchangeRates = {
  JPY: 150,
  BRL: 5.6,
  PYG: 7500,
  CLP: 930,
  BOB: 6.9,
  ARS: 935,
};
let lastUpdated: number = 0;

/**
 * タイムアウト制御付きで最新の為替レート(各通貨)を取得します。
 * 失敗した場合はメモリ内のキャッシュレートを返します。
 */
export async function getResilientExchangeRate(): Promise<{
  rates: ExchangeRates;
  isCached: boolean;
  lastUpdated: string;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒でタイムアウト

  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      signal: controller.signal,
    });
    
    const data = await response.json();
    clearTimeout(timeoutId);

    const jpyMarketRate = data.rates.JPY;
    const jpyTtbRate = jpyMarketRate - 4; // JPYは従来通りTTBレート相当の計算

    if (isNaN(jpyTtbRate) || jpyTtbRate <= 0) {
      throw new Error('Invalid rate structure from external API');
    }

    const newRates: ExchangeRates = {
      JPY: jpyTtbRate,
      BRL: data.rates.BRL || cachedRates.BRL,
      PYG: data.rates.PYG || cachedRates.PYG,
      CLP: data.rates.CLP || cachedRates.CLP,
      BOB: data.rates.BOB || cachedRates.BOB,
      ARS: data.rates.ARS || cachedRates.ARS,
    };

    // キャッシュを更新
    cachedRates = newRates;
    lastUpdated = Date.now();

    return {
      rates: newRates,
      isCached: false,
      lastUpdated: new Date(lastUpdated).toISOString()
    };
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('Exchange rate API timeout or error. Falling back to cached rates:', error);
    
    return {
      rates: cachedRates,
      isCached: true,
      lastUpdated: lastUpdated > 0 ? new Date(lastUpdated).toISOString() : 'Never (using hardcoded defaults)'
    };
  }
}

