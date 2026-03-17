import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

let client: twilio.Twilio | null = null;

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

    // 電話番号の正規化: 数字と+以外を削除
    let normalizedTo = to.replace(/[^\d+]/g, '');

    // 先頭に + がなければ付加 (E.164規格)
    if (!normalizedTo.startsWith('+')) {
      normalizedTo = '+' + normalizedTo;
    }

    const response = await client.messages.create({
      from: whatsappNumber,
      to: `whatsapp:${normalizedTo}`,
      body: message
    });

    return { success: true, messageSid: response.sid };
  } catch (error: unknown) {
    console.error('WhatsApp send error:', error);

    // エラー63016: 24時間ウィンドウ外（Sandbox再オプトインが必要）
    const twilioError = error as { code?: number; message?: string; moreInfo?: string };
    const isOutsideWindow = twilioError?.code === 63016 ||
      twilioError?.message?.includes('outside the allowed window') ||
      twilioError?.moreInfo?.includes('63016');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      outsideWindow: isOutsideWindow
    };
  }
}