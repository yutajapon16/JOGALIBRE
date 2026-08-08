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

export async function sendShippingInfoEmail(
  to: string,
  productTitle: string,
  trackingNumber?: string,
  carrier?: string,
  trackingUrl?: string,
  language: string = 'es'
) {
  try {
    const resend = getResend();
    const isPt = (language || '').toLowerCase() === 'pt';
    const subject = isPt
      ? '🚢 Seu pedido foi enviado! - JOGALIBRE'
      : '🚢 ¡Tu pedido ha sido enviado! - JOGALIBRE';

    const trackingHtml = trackingNumber
      ? `
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; font-size: 14px; color: #64748b;"><strong>${isPt ? 'Informações de Rastreamento:' : 'Información de Seguimiento:'}</strong></p>
          ${carrier ? `<p style="margin: 0 0 4px 0; font-size: 14px;"><strong>${isPt ? 'Transportadora' : 'Empresa de envío'}:</strong> ${carrier}</p>` : ''}
          <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>${isPt ? 'Código de Rastreio' : 'Código de Seguimiento'}:</strong> ${trackingNumber}</p>
          ${trackingUrl ? `<a href="${trackingUrl}" style="color: #2563eb; font-weight: bold; font-size: 14px; text-decoration: underline;" target="_blank" rel="noopener noreferrer">${isPt ? 'Rastrear Encomenda' : 'Rastrear Envío'} &rarr;</a>` : ''}
        </div>
      `
      : '';

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
          <h2 style="color: #2563eb; margin-bottom: 20px; font-size: 20px;">🚢 Seu Pedido Foi Enviado!</h2>
          <p>Olá,</p>
          <p>Temos o prazer de informar que o seu pedido do produto <strong>"${productTitle}"</strong> já foi enviado!</p>
          ${trackingHtml}
          <p>Acompanhe o status do envio diretamente pelo nosso aplicativo.</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="https://www.jogalibre.com/" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Acessar JOGALIBRE</a>
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
          <h2 style="color: #2563eb; margin-bottom: 20px; font-size: 20px;">🚢 ¡Tu Pedido Ha Sido Enviado!</h2>
          <p>Hola,</p>
          <p>Nos complace informarte que tu pedido del producto <strong>"${productTitle}"</strong> ya ha sido enviado.</p>
          ${trackingHtml}
          <p>Sigue el estado del envío directamente desde nuestra aplicación.</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="https://www.jogalibre.com/" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Acceder a JOGALIBRE</a>
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
      console.error('Resend shipping info email error:', error);
      throw error;
    }
    return data;
  } catch (error) {
    console.error('Failed to send shipping info email via Resend:', error);
  }
}

export async function sendWelcomeEmail(to: string, fullName: string, customerId: string, language: string = 'es') {
  try {
    const resend = getResend();
    const isPt = (language || '').toLowerCase() === 'pt';
    const subject = isPt
      ? '🎉 Bem-vindo ao JOGALIBRE!'
      : '🎉 ¡Bienvenido a JOGALIBRE!';

    const nameStr = fullName || (isPt ? 'Usuário' : 'Usuario');

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
          <h2 style="color: #4f46e5; margin-bottom: 20px; font-size: 20px;">🎉 Seja muito bem-vindo ao JOGALIBRE!</h2>
          <p>Olá, <strong>${nameStr}</strong>,</p>
          <p>Sua conta foi criada com sucesso na plataforma de leilões e compras no Japão.</p>
          <div style="background-color: #f3f4f6; border-left: 4px solid #4f46e5; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px; color: #374151;"><strong>Seu ID de Cliente:</strong> <span style="font-size: 16px; color: #4f46e5; font-weight: bold;">${customerId}</span></p>
          </div>
          <p style="font-weight: bold; margin-top: 20px;">Como funciona o JOGALIBRE?</p>
          <ul style="padding-left: 20px; line-height: 1.6; color: #4b5563;">
            <li><strong>1. Busque Produtos:</strong> Copie o link do produto no Yahoo Auctions (ou busque na nossa plataforma) e envie sua solicitação de lance.</li>
            <li><strong>2. Confirmação:</strong> Nossa equipe avaliará e aprovará seu pedido rapidamente.</li>
            <li><strong>3. Pagamento e Envio:</strong> Pague de forma segura via Pix/Cartão e receba o acompanhamento direto no seu app.</li>
          </ul>
          <div style="margin: 30px 0; text-align: center;">
            <a href="https://www.jogalibre.com/" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Começar a Usar Agora</a>
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
          <h2 style="color: #4f46e5; margin-bottom: 20px; font-size: 20px;">🎉 ¡Te damos la bienvenida a JOGALIBRE!</h2>
          <p>Hola, <strong>${nameStr}</strong>,</p>
          <p>Tu cuenta ha sido creada con éxito en la plataforma de subastas y compras en Japón.</p>
          <div style="background-color: #f3f4f6; border-left: 4px solid #4f46e5; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px; color: #374151;"><strong>Tu ID de Cliente:</strong> <span style="font-size: 16px; color: #4f46e5; font-weight: bold;">${customerId}</span></p>
          </div>
          <p style="font-weight: bold; margin-top: 20px;">¿Cómo funciona JOGALIBRE?</p>
          <ul style="padding-left: 20px; line-height: 1.6; color: #4b5563;">
            <li><strong>1. Busca Productos:</strong> Copia el enlace del producto en Yahoo Auctions (o busca en nuestra plataforma) y envía tu solicitud de oferta.</li>
            <li><strong>2. Confirmación:</strong> Nuestro equipo revisará y aprobará tu pedido rápidamente.</li>
            <li><strong>3. Pago y Envío:</strong> Paga de forma segura y recibe el seguimiento directamente en tu aplicación.</li>
          </ul>
          <div style="margin: 30px 0; text-align: center;">
            <a href="https://www.jogalibre.com/" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Comenzar a Usar Ahora</a>
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
      console.error('Resend welcome email error:', error);
      throw error;
    }
    return data;
  } catch (error) {
    console.error('Failed to send welcome email via Resend:', error);
  }
}

export async function sendAutoConfirmedEmail(to: string, productTitle: string, language: string = 'es') {
  try {
    const resend = getResend();
    const isPt = (language || '').toLowerCase() === 'pt';
    const subject = isPt
      ? '✅ Confirmação Automática de Pedido - JOGALIBRE'
      : '✅ Confirmación Automática de Pedido - JOGALIBRE';

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
          <h2 style="color: #059669; margin-bottom: 20px; font-size: 20px;">✅ Confirmação Automática Concluída</h2>
          <p>Olá,</p>
          <p>Como se passaram 24 horas após o término do leilão, o seu pedido do produto <strong>"${productTitle}"</strong> foi confirmado automaticamente.</p>
          <p>Por favor, acesse o aplicativo JOGALIBRE para concluir o pagamento e permitir o envio do seu produto.</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="https://www.jogalibre.com/" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Pagar Agora no JOGALIBRE</a>
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
          <h2 style="color: #059669; margin-bottom: 20px; font-size: 20px;">✅ Confirmación Automática Completada</h2>
          <p>Hola,</p>
          <p>Dado que han transcurrido 24 horas desde el cierre de la subasta, tu pedido del producto <strong>"${productTitle}"</strong> ha sido confirmado automáticamente.</p>
          <p>Por favor, ingresa a la aplicación JOGALIBRE para completar el pago y proceder con el envío de tu producto.</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="https://www.jogalibre.com/" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Pagar Ahora en JOGALIBRE</a>
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
      console.error('Resend auto confirmed email error:', error);
      throw error;
    }
    return data;
  } catch (error) {
    console.error('Failed to send auto confirmed email via Resend:', error);
  }
}
