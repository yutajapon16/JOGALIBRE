import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

console.log('=== Twilio Configuration ===');
console.log('Account SID:', accountSid ? 'Set' : 'NOT SET');
console.log('Auth Token:', authToken ? 'Set' : 'NOT SET');
console.log('WhatsApp Number:', whatsappNumber);

let client: any = null;

if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
}

export async function sendWhatsAppMessage(
  to: string,
  message: string
) {
  try {
    console.log('=== Sending WhatsApp Message ===');
    console.log('To:', to);
    console.log('Message:', message);

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

    const response = await client.messages.create({
      from: whatsappNumber,
      to: `whatsapp:${to}`,
      body: message
    });
    
    console.log('WhatsApp message sent successfully:', response.sid);
    return { success: true, messageSid: response.sid };
  } catch (error) {
    console.error('WhatsApp send error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}