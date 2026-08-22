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
  JPY: 155.73,
  BRL: 5.24,
  PYG: 7500,
  CLP: 930,
  BOB: 6.9,
  ARS: 935,
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1時間キャッシュ (3600秒)

interface DbCachedRateData {
  rates: ExchangeRates;
  updated_at: string;
  foxbit_raw_rate?: number;
}

/**
 * データベースで一元同期された最新為替レートを取得します。
 * 全ユーザー（管理者・顧客全アカウント）に100%同一のレートが返ります。
 */
export async function getResilientExchangeRate(forceRefresh: boolean = false): Promise<{
  rates: ExchangeRates;
  isCached: boolean;
  lastUpdated: string;
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
          };
        }
      }
    } catch (err) {
      console.warn('[Exchange Rate DB Fetch Error]:', err);
    }
  }

  // 2. 1時間以上経過または強制更新の場合、Foxbit APIから最新実勢レートを取得
  let foxbitBrlRate: number | null = null;
  let foxbitRawRate: number | null = null;
  try {
    if (foxbitClient.isConfigured()) {
      const liveRate = await foxbitClient.getUsdtBrlRate();
      if (liveRate > 0) {
        foxbitRawRate = liveRate;
        const brlBuffer = 0.05; // 安全バッファ (+5センタボ)
        foxbitBrlRate = Math.round((liveRate + brlBuffer) * 10000) / 10000;
      }
    }
  } catch (err) {
    console.warn('[Exchange Rate Foxbit Error]:', err);
  }

  // 3. JPYおよびその他の通貨レートを外部APIから取得
  let newRates: ExchangeRates = dbCachedData?.rates ? { ...dbCachedData.rates } : { ...DEFAULT_RATES };
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
      const jpyTtbRate = jpyMarketRate - 3.5;
      const brlBuffer = 0.05;

      newRates = {
        JPY: jpyTtbRate,
        BRL: foxbitBrlRate || (data.rates.BRL ? Math.round((data.rates.BRL + brlBuffer) * 10000) / 10000 : (dbCachedData?.rates?.BRL || DEFAULT_RATES.BRL)),
        PYG: data.rates.PYG || dbCachedData?.rates?.PYG || DEFAULT_RATES.PYG,
        CLP: data.rates.CLP || dbCachedData?.rates?.CLP || DEFAULT_RATES.CLP,
        BOB: data.rates.BOB || dbCachedData?.rates?.BOB || DEFAULT_RATES.BOB,
        ARS: data.rates.ARS || dbCachedData?.rates?.ARS || DEFAULT_RATES.ARS,
      };
    }
  } catch (err) {
    console.warn('[Exchange Rate External API Error]:', err);
    if (foxbitBrlRate) {
      newRates.BRL = foxbitBrlRate;
    }
  }

  const updatedIso = new Date().toISOString();

  // 4. 新しいレートを Supabase (system_settings) に一元保存（全ユーザー・全インスタンスへ即時同期）
  try {
    await supabaseAdmin
      .from('system_settings')
      .upsert({
        key: 'latest_exchange_rates',
        value: {
          rates: newRates,
          updated_at: updatedIso,
          foxbit_raw_rate: foxbitRawRate,
        },
      });
  } catch (err) {
    console.warn('[Exchange Rate DB Save Error]:', err);
  }

  return {
    rates: newRates,
    isCached: false,
    lastUpdated: updatedIso,
  };
}
