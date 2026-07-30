import { Resend } from 'resend';

let resendInstance: Resend | null = null;

// Resendインスタンスを遅延初期化する関数（ビルド時のAPIキー未設定によるエラーを防止）
function getResend() {
  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_API_KEY || 're_dummy_key');
  }
  return resendInstance;
}

export async function sendOrderCsvEmail(to: string, csvContent: string, dateStr: string) {
  try {
    const resend = getResend();
    const dateStrUnderscore = dateStr.replace(/\//g, '_'); // '2026/06/16' -> '2026_06_16'
    const { data, error } = await resend.emails.send({
      from: 'JOGALIBRE Orders <order@jogalibre.com>',
      to: [to],
      subject: `[JOGALIBRE] 入札依頼（${dateStr}）`,
      html: `<p>${dateStr} 時点での入札希望商品リストです。</p>`,
      attachments: [
        {
          filename: `JOGALIBRE_入札依頼_${dateStrUnderscore}.csv`,
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

export async function sendReceiptEmail(to: string, receiptUrl: string, amount: string) {
  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: 'JOGALIBRE Pagamentos <pagamentos@jogalibre.com>', // 独自ドメイン推奨。テスト時は resend 登録ドメインに変更
      to: [to],
      subject: `[JOGALIBRE] Recibo de Pagamento - R$ ${amount}`,
      html: `
        <h2>Pagamento Confirmado!</h2>
        <p>Olá,</p>
        <p>Recebemos o seu pagamento no valor de <strong>R$ ${amount}</strong>.</p>
        <p>O seu <strong>Recibo de Intermediação e Repasse</strong> já está disponível.</p>
        <br/>
        <a href="${receiptUrl}" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Baixar Recibo em PDF</a>
        <br/><br/>
        <p>Você também pode encontrar este recibo na aba "Deposits" do seu painel.</p>
        <p>Obrigado por utilizar a JOGALIBRE.</p>
        <br/>
        <div style="margin-top: 20px;">
          <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jogalibre.com'}/icons/logo-mark.png" alt="" style="height: 40px; width: 40px; vertical-align: middle; margin-right: 12px;" />
          <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jogalibre.com'}/icons/logo-text.png" alt="JOGALIBRE" style="height: 29px; vertical-align: middle;" />
        </div>
      `,
    });

    if (error) {
      console.error('Resend receipt email error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Failed to send receipt email via Resend:', error);
    throw error;
  }
}
