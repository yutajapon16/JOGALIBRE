/**
 * Evolution API を使用した WhatsApp メッセージ送信ヘルパー
 */

interface SendWhatsAppParams {
  to: string;
  message: string;
  country?: string | null;
}

interface SendWhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * 電話番号を Evolution API / WhatsApp 規格（数字のみ、国番号付き）に正規化する
 * @param phone 入力電話番号（例: "+55 (11) 98765-4321"）
 * @param country 顧客の国（例: "BR", "PY", "Brasil", "Paraguay" など）
 * @returns 正規化された電話番号文字列（例: "5511987654321"）、無効な場合は null
 */
export function normalizeWhatsAppNumber(phone: string | null | undefined, country?: string | null): string | null {
  if (!phone) return null;

  // 数字以外のすべての文字（+、-、括弧、スペース等）を除去
  let digits = phone.replace(/\D/g, '');

  if (!digits || digits.length < 8) {
    return null;
  }

  // 先頭の 00 （国際電話プレフィックス）を除去
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  const cleanCountry = (country || '').trim().toUpperCase();
  const isParaguay = cleanCountry === 'PY' || cleanCountry === 'PARAGUAY' || cleanCountry === 'PARAGUAI';

  // パラグアイ番号の処理（例: 0981xxxxxx -> 595981xxxxxx）
  if (isParaguay) {
    if (digits.startsWith('595')) {
      return digits;
    }
    if (digits.startsWith('0')) {
      digits = digits.slice(1);
    }
    return `595${digits}`;
  }

  // 既に国番号が含まれていると思われるケース（55から始まる12〜13桁、595から始まる11〜12桁、1から始まる11桁、81から始まるなど）
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.startsWith('595') && (digits.length >= 11 && digits.length <= 13)) {
    return digits;
  }
  if (digits.startsWith('81') && (digits.length === 11 || digits.length === 12)) {
    return digits;
  }

  // ブラジル番号で国番号（55）が抜けている場合（10桁または11桁）
  if (digits.length === 10 || digits.length === 11) {
    // 先頭の0を削除（例: 011987654321 -> 11987654321）
    if (digits.startsWith('0')) {
      digits = digits.slice(1);
    }
    return `55${digits}`;
  }

  // その他の国番号付き番号
  return digits;
}

/**
 * Evolution API 経由で WhatsApp メッセージを送信する
 * @param params 送信パラメータ（宛先、本文、国コード）
 * @returns 送信結果オブジェクト
 */
export async function sendEvolutionWhatsAppMessage({
  to,
  message,
  country
}: SendWhatsAppParams): Promise<SendWhatsAppResult> {
  try {
    const isEnabled = process.env.ENABLE_WHATSAPP_NOTIFICATIONS === 'true';
    const apiUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, '');
    const apiKey = process.env.EVOLUTION_API_KEY;
    const instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'jogalibre-bot';

    // WhatsApp通知が無効または未設定の場合はスキップ
    if (!isEnabled || !apiUrl || !apiKey) {
      return {
        success: false,
        skipped: true,
        error: !isEnabled ? 'WhatsApp notifications are disabled by config' : 'Evolution API credentials not configured'
      };
    }

    const normalizedNumber = normalizeWhatsAppNumber(to, country);
    if (!normalizedNumber) {
      return {
        success: false,
        skipped: true,
        error: `Invalid WhatsApp phone number: ${to}`
      };
    }

    // Evolution API v2 のテキスト送信エンドポイント
    const endpoint = `${apiUrl}/message/sendText/${instanceName}`;

    // 送信ペイロード（Evolution API v2 仕様）
    const payload = {
      number: normalizedNumber,
      text: message,
      options: {
        delay: 1000,
        presence: 'composing',
        linkPreview: false
      }
    };

    // タイムアウト付きフェッチ（最大8秒）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error response');
      console.error(`Evolution API HTTP error [${response.status}]:`, errorText);
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`
      };
    }

    const data = await response.json().catch(() => ({}));
    const messageId = data?.key?.id || data?.messageId || data?.id;

    return {
      success: true,
      messageId: typeof messageId === 'string' ? messageId : undefined
    };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.error('Evolution API request timed out (8 seconds)');
      return {
        success: false,
        error: 'Evolution API request timed out'
      };
    }

    console.error('Evolution API send error:', error);
    return {
      success: false,
      error: error?.message || 'Unknown network error'
    };
  }
}
