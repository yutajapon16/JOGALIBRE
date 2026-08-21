import crypto from 'crypto';

/**
 * Foxbit API設定インターフェース
 */
interface FoxbitConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

/**
 * 通貨残高インターフェース
 */
export interface FoxbitAccountBalance {
  currency_symbol: string;
  balance: string;
  balance_available: string;
  balance_locked: string;
}

/**
 * ティッカー情報インターフェース
 */
export interface FoxbitTicker {
  market_symbol: string;
  last_trade?: {
    price: string;
    volume?: string;
    date?: string;
  };
  rolling_24h?: {
    price_change?: string;
    price_change_percent?: string;
    volume?: string;
    open?: string;
    high?: string;
    low?: string;
  };
  best?: {
    ask?: { price: string; volume?: string };
    bid?: { price: string; volume?: string };
  };
}

/**
 * Foxbit API クライアント
 */
class FoxbitClient {
  private config: FoxbitConfig;

  constructor() {
    this.config = {
      apiKey: process.env.FOXBIT_API_KEY || '',
      apiSecret: process.env.FOXBIT_API_SECRET || '',
      baseUrl: 'https://api.foxbit.com.br',
    };
  }

  /**
   * APIキーが設定されているか確認
   */
  public isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.apiSecret);
  }

  /**
   * 認証付きAPIリクエストを実行
   */
  private async request<T>(method: string, path: string, body: any = null): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error('Foxbit API credentials (FOXBIT_API_KEY / FOXBIT_API_SECRET) are not configured');
    }

    const timestamp = Date.now().toString();
    const bodyStr = body ? JSON.stringify(body) : '';
    
    // 署名生成 (timestamp + HTTP_METHOD + path + body)
    const prehash = timestamp + method.toUpperCase() + path + bodyStr;
    const signature = crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(prehash)
      .digest('hex');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-FB-ACCESS-KEY': this.config.apiKey,
      'X-FB-ACCESS-TIMESTAMP': timestamp,
      'X-FB-ACCESS-SIGNATURE': signature,
    };

    const url = `${this.config.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers,
      body: body ? bodyStr : undefined,
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        errorJson = { message: errorText };
      }
      throw new Error(`Foxbit API Error (${response.status}): ${JSON.stringify(errorJson)}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * パブリックAPIリクエスト（署名不要）
   */
  private async publicRequest<T>(path: string): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Foxbit Public API Error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * 口座残高一覧を取得
   */
  public async getBalances(): Promise<FoxbitAccountBalance[]> {
    try {
      const res = await this.request<{ data: FoxbitAccountBalance[] }>('GET', '/rest/v3/accounts');
      return res.data || [];
    } catch (error) {
      console.error('[Foxbit] Failed to fetch balances:', error);
      throw error;
    }
  }

  /**
   * USDT/BRLの24時間ティッカー・実勢レートを取得
   */
  public async getUsdtBrlTicker(): Promise<FoxbitTicker | null> {
    try {
      const res = await this.publicRequest<{ data: FoxbitTicker[] }>('/rest/v3/markets/usdtbrl/ticker/24hr');
      return res.data?.[0] || null;
    } catch (error) {
      console.error('[Foxbit] Failed to fetch USDT/BRL ticker:', error);
      return null;
    }
  }

  /**
   * 現在のUSDT/BRL実勢レート（数値）を取得
   * 優先度: last_trade.price > best.ask.price > フォールバック 5.20
   */
  public async getUsdtBrlRate(): Promise<number> {
    const ticker = await this.getUsdtBrlTicker();
    if (!ticker) return 5.20; // フォールバック

    const lastPrice = parseFloat(ticker.last_trade?.price || '0');
    if (lastPrice > 0) return lastPrice;

    const askPrice = parseFloat(ticker.best?.ask?.price || '0');
    if (askPrice > 0) return askPrice;

    return 5.20;
  }
}

export const foxbitClient = new FoxbitClient();
