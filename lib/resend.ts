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

export interface SystemAlertEmailOptions {
  to?: string;
  type: string;
  title: string;
  message: string;
  details?: string | Record<string, any>;
  url?: string;
  timestamp?: string;
  severity?: 'warning' | 'critical' | 'error';
  user?: {
    customerId?: string;
    name?: string;
    email?: string;
    role?: string;
  };
}

/**
 * 管理者（admin@jogalibre.com）宛てのシステムエラー通知メールを送信
 */
export async function sendSystemAlertEmail(options: SystemAlertEmailOptions) {
  try {
    const resend = getResend();
    const recipient = options.to || process.env.ADMIN_ALERT_EMAIL || 'admin@jogalibre.com';
    const severity = options.severity || 'error';
    const jstTime = options.timestamp || new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    const badgeColor = severity === 'critical' ? '#dc2626' : severity === 'warning' ? '#d97706' : '#ef4444';
    const badgeText = severity === 'critical' ? 'CRITICAL' : severity === 'warning' ? 'WARNING' : 'ERROR';

    let formattedDetails = '';
    if (options.details) {
      if (typeof options.details === 'string') {
        formattedDetails = options.details;
      } else {
        formattedDetails = JSON.stringify(options.details, null, 2);
      }
    }

    const userInfo = options.user;
    const userDisplayHtml = userInfo && (userInfo.customerId || userInfo.email || userInfo.name)
      ? `
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
          <p style="margin: 0 0 8px 0; font-size: 13px; color: #166534; font-weight: bold;">👤 【操作ユーザー / 顧客情報】</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            ${userInfo.customerId ? `<tr><td style="padding: 3px 0; color: #15803d; width: 110px; font-weight: 600;">顧客ID:</td><td style="padding: 3px 0; color: #0f172a; font-weight: bold;">${userInfo.customerId}</td></tr>` : ''}
            ${userInfo.name ? `<tr><td style="padding: 3px 0; color: #15803d; font-weight: 600;">お名前:</td><td style="padding: 3px 0; color: #0f172a;">${userInfo.name} 様</td></tr>` : ''}
            ${userInfo.email ? `<tr><td style="padding: 3px 0; color: #15803d; font-weight: 600;">メール:</td><td style="padding: 3px 0; color: #0f172a;">${userInfo.email}</td></tr>` : ''}
            ${userInfo.role ? `<tr><td style="padding: 3px 0; color: #15803d; font-weight: 600;">権限 (Role):</td><td style="padding: 3px 0; color: #0f172a; font-family: monospace;">${userInfo.role}</td></tr>` : ''}
          </table>
        </div>
      `
      : `
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 20px; font-size: 13px; color: #64748b;">
          👤 <strong>操作ユーザー:</strong> 未ログイン（ゲスト訪問者）またはシステム自動実行
        </div>
      `;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; max-width: 680px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px; border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; width: 100%;">
          <tr>
            <td style="vertical-align: middle;">
              <span style="display: inline-block; background-color: #0f172a; color: #ffffff; font-weight: bold; font-size: 12px; padding: 4px 10px; border-radius: 4px; letter-spacing: 0.5px;">JOGALIBRE SYSTEM MONITOR</span>
            </td>
            <td style="vertical-align: middle; text-align: right;">
              <span style="display: inline-block; background-color: ${badgeColor}; color: #ffffff; font-weight: bold; font-size: 11px; padding: 3px 8px; border-radius: 4px;">${badgeText}</span>
            </td>
          </tr>
        </table>

        <h2 style="color: #0f172a; margin: 0 0 16px 0; font-size: 20px; line-height: 1.4;">
          ⚠️ ${options.title}
        </h2>

        <div style="background-color: #f8fafc; border-left: 4px solid ${badgeColor}; padding: 14px 16px; border-radius: 4px; margin-bottom: 20px;">
          <p style="margin: 0 0 6px 0; font-size: 13px; color: #64748b; font-weight: bold;">【エラー概要】</p>
          <p style="margin: 0; font-size: 15px; color: #0f172a; line-height: 1.5; white-space: pre-wrap;">${options.message}</p>
        </div>

        ${userDisplayHtml}

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
          <tbody>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b; width: 130px; font-weight: 600;">種別 (Type)</td>
              <td style="padding: 8px 0; color: #0f172a; font-family: monospace;">${options.type}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b; font-weight: 600;">発生日時 (JST)</td>
              <td style="padding: 8px 0; color: #0f172a;">${jstTime}</td>
            </tr>
            ${options.url ? `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b; font-weight: 600;">対象URL / 画面</td>
              <td style="padding: 8px 0; color: #2563eb; word-break: break-all;">
                <a href="${options.url}" style="color: #2563eb; text-decoration: underline;" target="_blank" rel="noopener noreferrer">${options.url}</a>
              </td>
            </tr>` : ''}
          </tbody>
        </table>

        ${formattedDetails ? `
        <div style="margin-bottom: 24px;">
          <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b; font-weight: bold;">【詳細情報 / スタックトレース】</p>
          <pre style="background-color: #0f172a; color: #f8fafc; padding: 14px; border-radius: 8px; font-size: 12px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-all; margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">${formattedDetails.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        </div>` : ''}

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0 16px 0;" />
        <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">
          このメールは JOGALIBRE システムエラー自動監視モジュールより送信されています。
        </p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'JOGALIBRE Monitor <info@jogalibre.com>',
      to: [recipient],
      subject: `[JOGALIBRE 警告] ${options.title}`,
      html: html,
    });


    if (error) {
      console.error('Failed to send system alert email via Resend:', error);
      return { success: false, error };
    }
    return { success: true, data };
  } catch (error) {
    console.error('Critical failure in sendSystemAlertEmail:', error);
    return { success: false, error };
  }
}

