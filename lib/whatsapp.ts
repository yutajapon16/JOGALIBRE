import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

const client = twilio(accountSid, authToken);

export async function sendWhatsAppMessage(
  to: string,  // 受信者のWhatsApp番号（例: +817013476721）
  message: string
) {
  try {
    const response = await client.messages.create({
      from: whatsappNumber,
      to: `whatsapp:${to}`,  // 自動で "whatsapp:+817013476721" になる
      body: message
    });
    
    console.log('WhatsApp message sent:', response.sid);
    return { success: true, messageSid: response.sid };
  } catch (error) {
    console.error('WhatsApp send error:', error);
    return { success: false, error };
  }
}