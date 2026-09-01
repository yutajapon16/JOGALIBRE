// 為替レートのレジリエンス（弾力性）および全ユーザー完全同期モジュール
// データベース (Supabase system_settings) を単一真実源 (Single Source of Truth) として一元管理し、
// Vercel Serverlessの複数インスタンス間でも全ユーザー・管理者に100%同一のレートを提供します。

import { foxbitClient } from './foxbit';
import { supabaseAdmin } from './supabase-admin';

export interface ExchangeRates {
  JPY: number;
  BRL: number;
  PYG: number;
  CLP: number;
  BOB: number;
  ARS: number;
}

const DEFAULT_RATES: ExchangeRates = {
  JPY: 155.45,
  BRL: 5.22,
  PYG: 6494.95,
  CLP: 818.42,
  BOB: 7.01,
  ARS: 1497.45,
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1時間キャッシュ (3600秒)
const JPY_BUFFER = 2.5; // リアルタイム市場レートからの安全バッファ (-2.5円)
const BRL_BUFFER = 0.05; // ブラジルレアルの安全バッファ (+5センタボ)

interface DbCachedRateData {
  rates: ExchangeRates;
  updated_at: string;
  foxbit_raw_rate?: number;
  jpy_source?: string;
}

/**
 * リアルタイム USD/JPY レートを取得する（Yahoo Finance ➜ Wise ➜ exchangerate-api の三重フォールバック）
 */
async function fetchRealtimeJpyRate(): Promise<{ rate: number; source: string } | null> {
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  };

  // 1. Yahoo Finance (市場リアルタイム相場)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/USDJPY=X', {
      headers: browserHeaders,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price && typeof price === 'number' && price > 50) {
        return { rate: price, source: 'Yahoo Finance (Real-time)' };
      }
    }
  } catch (err) {
    console.warn('[Exchange Rate Yahoo Finance Error]:', err);
  }

  // 2. Wise (国際送金リアルタイム仲値)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch('https://wise.com/rates/live?source=USD&target=JPY', {
      headers: browserHeaders,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const price = data?.value;
      if (price && typeof price === 'number' && price > 50) {
        return { rate: price, source: 'Wise (Real-time)' };
      }
    }
  } catch (err) {
    console.warn('[Exchange Rate Wise Error]:', err);
  }

  // 3. exchangerate-api (日次公認レート)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const price = data?.rates?.JPY;
      if (price && typeof price === 'number' && price > 50) {
        return { rate: price, source: 'exchangerate-api.com' };
      }
    }
  } catch (err) {
    console.warn('[Exchange Rate exchangerate-api Error]:', err);
  }

  return null;
}

/**
 * データベースで一元同期された最新為替レートを取得します。
 * 全ユーザー（管理者・顧客全アカウント）に100%同一のレートが返ります。
 */
export async function getResilientExchangeRate(forceRefresh: boolean = false): Promise<{
  rates: ExchangeRates;
  isCached: boolean;
  lastUpdated: string;
  source?: string;
}> {
  // 1. Supabase (system_settings) から共有レートを取得（強制更新でない場合）
  let dbCachedData: DbCachedRateData | null = null;
  if (!forceRefresh) {
    try {
      const { data, error } = await supabaseAdmin
        .from('system_settings')
        .select('value')
        .eq('key', 'latest_exchange_rates')
        .maybeSingle();

      if (!error && data?.value?.rates && data?.value?.updated_at) {
        const val = data.value as DbCachedRateData;
        dbCachedData = val;
        const lastUpdatedTime = new Date(val.updated_at).getTime();
        const ageMs = Date.now() - lastUpdatedTime;

        // 1時間以内であれば、DB上の共有レートを全ユーザーに返却
        if (ageMs >= 0 && ageMs < CACHE_TTL_MS) {
          return {
            rates: val.rates,
            isCached: true,
            lastUpdated: val.updated_at,
            source: val.jpy_source,
          };
        }
      }
    } catch (err) {
      console.warn('[Exchange Rate DB Fetch Error]:', err);
    }
  }

  // 2. リアルタイム JPY レートの取得 (Yahoo Finance ➜ Wise ➜ exchangerate-api)
  const jpyResult = await fetchRealtimeJpyRate();

  // 3. Foxbit API から最新 BRL 実勢レートを取得
  let foxbitBrlRate: number | null = null;
  let foxbitRawRate: number | null = null;
  try {
    if (foxbitClient.isConfigured()) {
      const liveRate = await foxbitClient.getUsdtBrlRate();
      if (liveRate > 0) {
        foxbitRawRate = liveRate;
        foxbitBrlRate = Math.round((liveRate + BRL_BUFFER) * 100) / 100;
      }
    }
  } catch (err) {
    console.warn('[Exchange Rate Foxbit Error]:', err);
  }

  // 4. その他の南米通貨（PYG, CLP, BOB, ARS）を外部APIから補完
  let newRates: ExchangeRates = dbCachedData?.rates ? { ...dbCachedData.rates } : { ...DEFAULT_RATES };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      signal: controller.signal,
    });
    const data = await response.json();
    clearTimeout(timeoutId);

    if (data?.rates) {
      newRates = {
        JPY: jpyResult ? Math.round((jpyResult.rate - JPY_BUFFER) * 100) / 100 : (data.rates.JPY ? Math.round((data.rates.JPY - JPY_BUFFER) * 100) / 100 : newRates.JPY),
        BRL: foxbitBrlRate || (data.rates.BRL ? Math.round((data.rates.BRL + BRL_BUFFER) * 100) / 100 : newRates.BRL),
        PYG: data.rates.PYG ? Math.round(data.rates.PYG * 100) / 100 : newRates.PYG,
        CLP: data.rates.CLP ? Math.round(data.rates.CLP * 100) / 100 : newRates.CLP,
        BOB: data.rates.BOB ? Math.round(data.rates.BOB * 100) / 100 : newRates.BOB,
        ARS: data.rates.ARS ? Math.round(data.rates.ARS * 100) / 100 : newRates.ARS,
      };
    }
  } catch (err) {
    console.warn('[Exchange Rate Complementary API Error]:', err);
    if (jpyResult) {
      newRates.JPY = Math.round((jpyResult.rate - JPY_BUFFER) * 100) / 100;
    }
    if (foxbitBrlRate) {
      newRates.BRL = foxbitBrlRate;
    }
  }

  const updatedIso = new Date().toISOString();

  // 5. 新しいレートを Supabase (system_settings) に一元保存（全ユーザー・全インスタンスへ即時同期）
  try {
    await supabaseAdmin
      .from('system_settings')
      .upsert({
        key: 'latest_exchange_rates',
        value: {
          rates: newRates,
          updated_at: updatedIso,
          foxbit_raw_rate: foxbitRawRate,
          jpy_source: jpyResult?.source || 'Fallback',
          jpy_market_raw: jpyResult?.rate,
          jpy_buffer: JPY_BUFFER,
        },
      });
  } catch (err) {
    console.warn('[Exchange Rate DB Save Error]:', err);
  }

  return {
    rates: newRates,
    isCached: false,
    lastUpdated: updatedIso,
    source: jpyResult?.source,
  };
}
