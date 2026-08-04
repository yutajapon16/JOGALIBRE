import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Resend } from 'resend';

let resendInstance: Resend | null = null;
function getResend() {
  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_API_KEY || 're_dummy_key');
  }
  return resendInstance;
}

/**
 * 最終ログイン（または登録）から5日以上経過しており、
 * まだリマインドメールが送信されていないユーザー（顧客・エージェント）を抽出し、
 * info@jogalibre.com からログインとオファーを促すメールを送信するCronジョブ。
 */
export async function GET(request: Request) {
  // 1. Vercel Cron からの認証チェック
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.warn('Unauthorized cron execution attempt');
      return new Response('Unauthorized', { status: 401 });
    }
  } else {
    console.warn('Warning: CRON_SECRET env variable is not set. Anyone can trigger this endpoint.');
  }

  try {
    const resend = getResend();
    
    // 5日前の境界となる日時を算出
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);


    // 2. 5日以上未ログインの対象ユーザーを取得
    // 抽出条件:
    // - role が 'customer' または 'agent'
    // - last_login_reminded_at が NULL（送信済みでない）
    // - かつ、(last_login_at が5日前以前) OR (last_login_at がNULLで、かつ created_at が5日前以前)
    const { data: users, error: fetchError } = await supabaseAdmin
      .from('user_roles')
      .select('id, email, full_name, role, language, last_login_at, created_at')
      .in('role', ['customer', 'agent'])
      .is('last_login_reminded_at', null);

    if (fetchError) throw fetchError;
    if (!users || users.length === 0) {
      return NextResponse.json({ message: 'No inactive users to remind' });
    }

    // JS側で日付条件のフィルタリングを行う（Supabase REST APIのORクエリの複雑さを避けるため）
    const targetUsers = users.filter(user => {
      if (user.last_login_at) {
        return new Date(user.last_login_at).getTime() <= fiveDaysAgo.getTime();
      } else if (user.created_at) {
        return new Date(user.created_at).getTime() <= fiveDaysAgo.getTime();
      }
      return false;
    });

    if (targetUsers.length === 0) {
      return NextResponse.json({ message: 'No inactive users matched date conditions' });
    }

    console.log(`Found ${targetUsers.length} inactive users to remind.`);

    const sentUserIds: string[] = [];
    const emailPromises = targetUsers.map(async (user) => {
      if (!user.email) return;

      const lang = (user.language || 'es').toLowerCase();
      const isPt = lang === 'pt';
      
      const subject = isPt 
        ? 'Sentimos sua falta no JOGALIBRE!' 
        : '¡Te extrañamos en JOGALIBRE!';
        
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
            <h2 style="color: #4f46e5; margin-bottom: 20px; font-size: 20px;">Sentimos sua falta no JOGALIBRE!</h2>
            <p>Olá, <strong>${user.full_name || 'Usuário'}</strong>,</p>
            <p>Faz tempo que você não entra na plataforma JOGALIBRE.</p>
            <p>Convidamos você a fazer login e enviar suas solicitações de lance para os produtos de seu interesse.</p>
            <div style="margin: 30px 0; text-align: center;">
              <a href="https://www.jogalibre.com/" style="background-color: #4f46e5; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Acessar o JOGALIBRE</a>
            </div>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
            <p style="font-size: 11px; color: #888;">Este é um e-mail automático. Por favor, não responda diretamente a esta mensagem.</p>
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
            <h2 style="color: #4f46e5; margin-bottom: 20px; font-size: 20px;">¡Te extrañamos en JOGALIBRE!</h2>
            <p>Hola, <strong>${user.full_name || 'Usuario'}</strong>,</p>
            <p>Hace tiempo que no ingresas a la plataforma JOGALIBRE.</p>
            <p>Te invitamos a iniciar sesión y realizar tu solicitud de oferta (ofertar) por los productos de tu interés.</p>
            <div style="margin: 30px 0; text-align: center;">
              <a href="https://www.jogalibre.com/" style="background-color: #4f46e5; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Acceder a JOGALIBRE</a>
            </div>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
            <p style="font-size: 11px; color: #888;">Este es un correo automático. Por favor, no respondas directamente a este mensaje.</p>
          </div>
        `;

      try {
        const { error: sendError } = await resend.emails.send({
          from: 'JOGALIBRE <info@jogalibre.com>',
          to: [user.email],
          subject: subject,
          html: html,
        });

        if (sendError) {
          console.error(`Failed to send email to ${user.email}:`, sendError);
        } else {
          sentUserIds.push(user.id);
        }
      } catch (err) {
        console.error(`Exception while sending email to ${user.email}:`, err);
      }
    });

    // 全ての送信処理を完了させる
    await Promise.all(emailPromises);

    // 3. 送信に成功したユーザーのリマインド送信日時を更新
    if (sentUserIds.length > 0) {
      const now = new Date().toISOString();
      const { error: updateError } = await supabaseAdmin
        .from('user_roles')
        .update({ last_login_reminded_at: now })
        .in('id', sentUserIds);

      if (updateError) {
        console.error('Failed to update last_login_reminded_at in DB:', updateError);
      }
    }

    return NextResponse.json({
      success: true,
      remindedCount: sentUserIds.length,
      skippedCount: targetUsers.length - sentUserIds.length
    });

  } catch (error: any) {
    console.error('Remind inactive users cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
