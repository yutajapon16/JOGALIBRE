// 為替レートのレジリエンス（弾力性）管理モジュール
// 外部APIのタイムアウトや障害時に、前回成功したレート（キャッシュ）または安全なデフォルト値を返します。

let cachedRate: number = 150; // キャッシュ用グローバル変数（初期値はデフォルトの150円）
let lastUpdated: number = 0;

/**
 * タイムアウト制御付きで最新の為替レート(TTBレート)を取得します。
 * 失敗した場合はメモリ内のキャッシュレートを返します。
 */
export async function getResilientExchangeRate(): Promise<{
  usdToJpy: number;
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

    const marketRate = data.rates.JPY;
    const ttbRate = marketRate - 4; // TTBレート相当の計算

    if (isNaN(ttbRate) || ttbRate <= 0) {
      throw new Error('Invalid rate structure from external API');
    }

    // キャッシュを更新
    cachedRate = ttbRate;
    lastUpdated = Date.now();

    return {
      usdToJpy: ttbRate,
      isCached: false,
      lastUpdated: new Date(lastUpdated).toISOString()
    };
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('Exchange rate API timeout or error. Falling back to cached rate:', error);
    
    return {
      usdToJpy: cachedRate,
      isCached: true,
      lastUpdated: lastUpdated > 0 ? new Date(lastUpdated).toISOString() : 'Never (using hardcoded default)'
    };
  }
}
