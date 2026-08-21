// 為替レートのレジリエンス（弾力性）管理モジュール
// Foxbit API (BRL) および国際為替APIから取得し、1時間キャッシュで安定したレートを提供します。

import { foxbitClient } from './foxbit';

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
const CACHE_TTL_MS = 60 * 60 * 1000; // 1時間キャッシュ (3600秒)

/**
 * 1時間キャッシュ付きで最新の為替レート(各通貨)を取得します。
 * BRLレートは Foxbit API (USDT/BRL 実勢レート) + R$ 0.05 を最優先で取得します。
 */
export async function getResilientExchangeRate(): Promise<{
  rates: ExchangeRates;
  isCached: boolean;
  lastUpdated: string;
}> {
  const now = Date.now();

  // 1. 有効期限内（1時間以内）のキャッシュが存在する場合は即座に返却
  if (lastUpdated > 0 && (now - lastUpdated) < CACHE_TTL_MS) {
    return {
      rates: cachedRates,
      isCached: true,
      lastUpdated: new Date(lastUpdated).toISOString(),
    };
  }

  // 2. Foxbit APIから最新の USDT/BRL 実勢レートを取得（最優先）
  let foxbitBrlRate: number | null = null;
  try {
    if (foxbitClient.isConfigured()) {
      const liveRate = await foxbitClient.getUsdtBrlRate();
      if (liveRate > 0) {
        const brlBuffer = 0.05; // Foxbit実勢レートに +0.05 レアルの安全バッファ
        foxbitBrlRate = Math.round((liveRate + brlBuffer) * 10000) / 10000;
      }
    }
  } catch (err) {
    console.warn('[Exchange Rate] Foxbit rate fetch warning, falling back to market API:', err);
  }

  // 3. メインAPI (exchangerate-api.com) からJPYおよびその他の通貨レートを取得
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
      const jpyTtbRate = jpyMarketRate - 3.5; // JPYはTTBレート相当（-3.5円）
      const brlBuffer = 0.05;

      const newRates: ExchangeRates = {
        JPY: jpyTtbRate,
        BRL: foxbitBrlRate || (data.rates.BRL ? data.rates.BRL + brlBuffer : cachedRates.BRL),
        PYG: data.rates.PYG || cachedRates.PYG,
        CLP: data.rates.CLP || cachedRates.CLP,
        BOB: data.rates.BOB || cachedRates.BOB,
        ARS: data.rates.ARS || cachedRates.ARS,
      };

      cachedRates = newRates;
      lastUpdated = now;

      return {
        rates: newRates,
        isCached: false,
        lastUpdated: new Date(lastUpdated).toISOString(),
      };
    }
  } catch (error) {
    console.warn('[Exchange Rate] Primary exchange rate API failed. Trying secondary API...', error);
  }

  // 4. セカンダリAPI (open.er-api.com) へのフェイルオーバー
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
        BRL: foxbitBrlRate || (data2.rates.BRL ? data2.rates.BRL + brlBuffer : cachedRates.BRL),
        PYG: data2.rates.PYG || cachedRates.PYG,
        CLP: data2.rates.CLP || cachedRates.CLP,
        BOB: data2.rates.BOB || cachedRates.BOB,
        ARS: data2.rates.ARS || cachedRates.ARS,
      };

      cachedRates = newRates2;
      lastUpdated = now;

      return {
        rates: newRates2,
        isCached: false,
        lastUpdated: new Date(lastUpdated).toISOString(),
      };
    }
  } catch (error2) {
    console.warn('[Exchange Rate] Secondary API failed. Falling back to cached rates:', error2);
  }

  // 5. キャッシュまたは安全な最新実勢デフォルト値を返却
  return {
    rates: {
      ...cachedRates,
      BRL: foxbitBrlRate || cachedRates.BRL,
    },
    isCached: true,
    lastUpdated: lastUpdated > 0 ? new Date(lastUpdated).toISOString() : 'Never (using fallback defaults)',
  };
}
