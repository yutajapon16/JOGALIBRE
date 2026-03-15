import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

let client: any = null;

if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
}

export async function sendWhatsAppMessage(
  to: string,
  message: string
) {
  try {
    if (!client) {
      console.error('Twilio client not initialized');
      return {
        success: false,
        error: 'Twilio credentials not configured'
      };
    }

    if (!whatsappNumber) {
      console.error('WhatsApp number not configured');
      return {
        success: false,
        error: 'WhatsApp number not configured'
      };
    }

    // 電話番号の正規化: 数字のみを抽出
    let normalizedTo = to.replace(/\D/g, '');

    // 国番号の調整（先頭に + が必要）
    if (!normalizedTo.startsWith('+')) {
      normalizedTo = '+' + normalizedTo;
    }

    const response = await client.messages.create({
      from: whatsappNumber,
      to: `whatsapp:${normalizedTo}`,
      body: message
    });

    return { success: true, messageSid: response.sid };
  } catch (error: any) {
    console.error('WhatsApp send error:', error);

    // エラー63016: 24時間ウィンドウ外（Sandbox再オプトインが必要）
    const isOutsideWindow = error?.code === 63016 ||
      error?.message?.includes('outside the allowed window') ||
      error?.moreInfo?.includes('63016');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      outsideWindow: isOutsideWindow
    };
  }
}