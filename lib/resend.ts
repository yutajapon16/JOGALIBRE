import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOrderCsvEmail(to: string, csvContent: string, dateStr: string) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'JOGALIBRE Orders <orders@jogalibre.com>',
      to: [to],
      subject: `[JOGALIBRE] Order Report - ${dateStr}`,
      html: `<p>Attached is the daily order report for ${dateStr}.</p>`,
      attachments: [
        {
          filename: `orders_${dateStr}.csv`,
          content: Buffer.from('\uFEFF' + csvContent).toString('base64'), // BOM for Excel
        },
      ],
    });

    if (error) {
      console.error('Resend email error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Failed to send email via Resend:', error);
    throw error;
  }
}
