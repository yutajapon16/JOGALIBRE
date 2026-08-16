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
  JPY: 155.73,
  BRL: 5.6,
  PYG: 7500,
  CLP: 930,
  BOB: 6.9,
  ARS: 935,
};
let lastUpdated: number = 0;

/**
 * タイムアウト制御付きで最新の為替レート(各通貨)を取得します。
 * メインAPIが失敗した場合はセカンダリAPIにフェイルオーバーし、
 * それも失敗した場合はメモリ内のキャッシュレート（最新取得値）を返します。
 */
export async function getResilientExchangeRate(): Promise<{
  rates: ExchangeRates;
  isCached: boolean;
  lastUpdated: string;
}> {
  // 1. メインAPIの試行
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      signal: controller.signal,
    });
    const data = await response.json();
    clearTimeout(timeoutId);

    const jpyMarketRate = data?.rates?.JPY;
    if (jpyMarketRate && jpyMarketRate > 50) {
      const jpyTtbRate = jpyMarketRate - 3.5; // JPYはTTBレート相当の計算（API値から-3.5円）
      const brlBuffer = 0.05;

      const newRates: ExchangeRates = {
        JPY: jpyTtbRate,
        BRL: data.rates.BRL ? data.rates.BRL + brlBuffer : cachedRates.BRL,
        PYG: data.rates.PYG || cachedRates.PYG,
        CLP: data.rates.CLP || cachedRates.CLP,
        BOB: data.rates.BOB || cachedRates.BOB,
        ARS: data.rates.ARS || cachedRates.ARS,
      };

      cachedRates = newRates;
      lastUpdated = Date.now();

      return {
        rates: newRates,
        isCached: false,
        lastUpdated: new Date(lastUpdated).toISOString()
      };
    }
  } catch (error) {
    console.warn('Primary exchange rate API failed. Trying secondary API...', error);
  }

  // 2. セカンダリAPI（open.er-api.com）へのフェイルオーバー
  try {
    const controller2 = new AbortController();
    const timeoutId2 = setTimeout(() => controller2.abort(), 4000);

    const response2 = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: controller2.signal,
    });
    const data2 = await response2.json();
    clearTimeout(timeoutId2);

    const jpyMarketRate2 = data2?.rates?.JPY;
    if (jpyMarketRate2 && jpyMarketRate2 > 50) {
      const jpyTtbRate2 = jpyMarketRate2 - 3.5;
      const brlBuffer = 0.05;

      const newRates2: ExchangeRates = {
        JPY: jpyTtbRate2,
        BRL: data2.rates.BRL ? data2.rates.BRL + brlBuffer : cachedRates.BRL,
        PYG: data2.rates.PYG || cachedRates.PYG,
        CLP: data2.rates.CLP || cachedRates.CLP,
        BOB: data2.rates.BOB || cachedRates.BOB,
        ARS: data2.rates.ARS || cachedRates.ARS,
      };

      cachedRates = newRates2;
      lastUpdated = Date.now();

      return {
        rates: newRates2,
        isCached: false,
        lastUpdated: new Date(lastUpdated).toISOString()
      };
    }
  } catch (error2) {
    console.warn('Secondary exchange rate API also failed. Falling back to cached rates:', error2);
  }

  // 3. キャッシュまたは安全な最新実勢デフォルト値を返却
  return {
    rates: cachedRates,
    isCached: true,
    lastUpdated: lastUpdated > 0 ? new Date(lastUpdated).toISOString() : 'Never (using hardcoded defaults)'
  };
}

