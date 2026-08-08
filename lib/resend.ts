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
        <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px; background-color: #ffffff;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px; border-bottom: 1px solid #f0f0f0; padding-bottom: 16px;">
            <tr>
              <td style="vertical-align: middle; padding-right: 8px; line-height: 1;">
                <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jogalibre.com'}/icons/logo-mark.png" alt="" width="22" height="22" style="width: 22px; height: 22px; display: block; border: 0;" />
              </td>
              <td style="vertical-align: middle; line-height: 1;">
                <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jogalibre.com'}/icons/logo-text.png" alt="JOGALIBRE" height="15" style="height: 15px; width: auto; max-width: 200px; display: block; border: 0;" />
              </td>
            </tr>
          </table>
          <h2 style="color: #059669; margin-bottom: 20px; font-size: 20px;">Pagamento Confirmado!</h2>
          <p>Olá,</p>
          <p>Recebemos o seu pagamento no valor de <strong>R$ ${amount}</strong>.</p>
          <p>O seu <strong>Recibo de Intermediação e Repasse</strong> já está disponível.</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="${receiptUrl}" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Baixar Recibo em PDF</a>
          </div>
          <p style="font-size: 13px; color: #666;">Você também pode encontrar este recibo na aba "Deposits" do seu painel.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="font-size: 11px; color: #888;">Obrigado por utilizar a JOGALIBRE.</p>
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

export async function sendWonEmail(to: string, productTitle: string, language: string = 'es') {
  try {
    const resend = getResend();
    const isPt = (language || '').toLowerCase() === 'pt';
    const subject = isPt
      ? '🎉 Parabéns! Seu produto foi arrematado!'
      : '🎉 ¡Felicidades! ¡Tu producto ha sido ganado!';

    const html = isPt
      ? `
        <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px; background-color: #ffffff;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px; border-bottom: 1px solid #f0f0f0; padding-bottom: 16px;">
            <tr>
              <td style="vertical-align: middle; padding-right: 8px; line-height: 1;">
                <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jogalibre.com'}/icons/logo-mark.png" alt="" width="22" height="22" style="width: 22px; height: 22px; display: block; border: 0;" />
              </td>
              <td style="vertical-align: middle; line-height: 1;">
                <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jogalibre.com'}/icons/logo-text.png" alt="JOGALIBRE" height="15" style="height: 15px; width: auto; max-width: 200px; display: block; border: 0;" />
              </td>
            </tr>
          </table>
          <h2 style="color: #059669; margin-bottom: 20px; font-size: 20px;">🎉 Leilão Arrematado com Sucesso!</h2>
          <p>Olá,</p>
          <p>Temos ótimas notícias! O produto <strong>"${productTitle}"</strong> foi arrematado com sucesso!</p>
          <p>Por favor, acesse o aplicativo JOGALIBRE para verificar os detalhes e concluir a confirmação/pagamento.</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="https://www.jogalibre.com/" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ver Detalhes no JOGALIBRE</a>
          </div>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="font-size: 11px; color: #888;">Obrigado por utilizar a JOGALIBRE.</p>
        </div>
      `
      : `
        <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px; background-color: #ffffff;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px; border-bottom: 1px solid #f0f0f0; padding-bottom: 16px;">
            <tr>
              <td style="vertical-align: middle; padding-right: 8px; line-height: 1;">
                <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jogalibre.com'}/icons/logo-mark.png" alt="" width="22" height="22" style="width: 22px; height: 22px; display: block; border: 0;" />
              </td>
              <td style="vertical-align: middle; line-height: 1;">
                <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jogalibre.com'}/icons/logo-text.png" alt="JOGALIBRE" height="15" style="height: 15px; width: auto; max-width: 200px; display: block; border: 0;" />
              </td>
            </tr>
          </table>
          <h2 style="color: #059669; margin-bottom: 20px; font-size: 20px;">🎉 ¡Subasta Ganada con Éxito!</h2>
          <p>Hola,</p>
          <p>¡Tenemos excelentes noticias! El producto <strong>"${productTitle}"</strong> ha sido ganado con éxito.</p>
          <p>Por favor, ingresa a la aplicación JOGALIBRE para revisar los detalles y completar la confirmación/pago.</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="https://www.jogalibre.com/" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ver Detalles en JOGALIBRE</a>
          </div>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="font-size: 11px; color: #888;">Gracias por utilizar JOGALIBRE.</p>
        </div>
      `;

    const { data, error } = await resend.emails.send({
      from: 'JOGALIBRE <info@jogalibre.com>',
      to: [to],
      subject: subject,
      html: html,
    });

    if (error) {
      console.error('Resend won email error:', error);
      throw error;
    }
    return data;
  } catch (error) {
    console.error('Failed to send won email via Resend:', error);
  }
}

export async function sendUnpaidReminderEmail(to: string, productTitle: string, language: string = 'es') {
  try {
    const resend = getResend();
    const isPt = (language || '').toLowerCase() === 'pt';
    const subject = isPt
      ? '🔔 Lembrete de Pagamento Pendente - JOGALIBRE'
      : '🔔 Recordatorio de Pago Pendiente - JOGALIBRE';

    const html = isPt
      ? `
        <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px; background-color: #ffffff;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px; border-bottom: 1px solid #f0f0f0; padding-bottom: 16px;">
            <tr>
              <td style="vertical-align: middle; padding-right: 8px; line-height: 1;">
                <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jogalibre.com'}/icons/logo-mark.png" alt="" width="22" height="22" style="width: 22px; height: 22px; display: block; border: 0;" />
              </td>
              <td style="vertical-align: middle; line-height: 1;">
                <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jogalibre.com'}/icons/logo-text.png" alt="JOGALIBRE" height="15" style="height: 15px; width: auto; max-width: 200px; display: block; border: 0;" />
              </td>
            </tr>
          </table>
          <h2 style="color: #d97706; margin-bottom: 20px; font-size: 20px;">🔔 Lembrete de Pagamento Pendente</h2>
          <p>Olá,</p>
          <p>Lembramos que o pagamento do produto arrematado <strong>"${productTitle}"</strong> ainda está pendente.</p>
          <p>Por favor, acesse o aplicativo JOGALIBRE para efetuar o pagamento e dar continuidade ao processo de envio.</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="https://www.jogalibre.com/" style="background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Pagar Agora no JOGALIBRE</a>
          </div>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="font-size: 11px; color: #888;">Obrigado por utilizar a JOGALIBRE.</p>
        </div>
      `
      : `
        <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px; background-color: #ffffff;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px; border-bottom: 1px solid #f0f0f0; padding-bottom: 16px;">
            <tr>
              <td style="vertical-align: middle; padding-right: 8px; line-height: 1;">
                <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jogalibre.com'}/icons/logo-mark.png" alt="" width="22" height="22" style="width: 22px; height: 22px; display: block; border: 0;" />
              </td>
              <td style="vertical-align: middle; line-height: 1;">
                <img src="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jogalibre.com'}/icons/logo-text.png" alt="JOGALIBRE" height="15" style="height: 15px; width: auto; max-width: 200px; display: block; border: 0;" />
              </td>
            </tr>
          </table>
          <h2 style="color: #d97706; margin-bottom: 20px; font-size: 20px;">🔔 Recordatorio de Pago Pendiente</h2>
          <p>Hola,</p>
          <p>Te recordamos que el pago del producto ganado <strong>"${productTitle}"</strong> aún se encuentra pendiente.</p>
          <p>Por favor, ingresa a la aplicación JOGALIBRE para realizar el pago y continuar con el proceso de envío.</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="https://www.jogalibre.com/" style="background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Pagar Ahora en JOGALIBRE</a>
          </div>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="font-size: 11px; color: #888;">Gracias por utilizar JOGALIBRE.</p>
        </div>
      `;

    const { data, error } = await resend.emails.send({
      from: 'JOGALIBRE <info@jogalibre.com>',
      to: [to],
      subject: subject,
      html: html,
    });

    if (error) {
      console.error('Resend unpaid reminder email error:', error);
      throw error;
    }
    return data;
  } catch (error) {
    console.error('Failed to send unpaid reminder email via Resend:', error);
  }
}
