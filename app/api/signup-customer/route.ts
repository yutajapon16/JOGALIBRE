import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendWelcomeEmail } from '@/lib/resend';

// アノンキーを使用した通常のクライアントを作成（確認メールの自動送信を有効にするため）
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * 顧客用新規アカウント登録API
 * サーバー側で認証ユーザー作成（確認メール送信）とDB登録（user_roles）をアトミックに実行します。
 * DB登録でエラーが発生した場合は作成した認証ユーザーを自動削除（ロールバック）します。
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, fullName, whatsapp, address, zipCode, country, agentCustomerId, cpf, state, city, language } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'メールアドレスとパスワードは必須です', errorCode: 'MISSING_FIELDS' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'パスワードは6文字以上必要です', errorCode: 'PASSWORD_TOO_SHORT' },
        { status: 400 }
      );
    }

    // 1. Supabase Anon Clientを用いてユーザー登録を実行（これで自動的に確認メールが送信されます）
    const { data: authData, error: authError } = await supabaseAnon.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || null,
          whatsapp: whatsapp || null,
          role: 'customer',
          user_role: 'customer',
          address: address || null,
          zip_code: zipCode || null,
          country: country || null,
          agent_customer_id: agentCustomerId || null,
          cpf: cpf || null,
          state: state || null,
          city: city || null,
          language: language || 'es'
        }
      }
    });

    if (authError) {
      console.error('Auth customer creation error:', authError);
      const msg = (authError.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
        return NextResponse.json(
          { error: 'このメールアドレスは既に使用されています', errorCode: 'EMAIL_ALREADY_EXISTS' },
          { status: 409 }
        );
      }
      if (msg.includes('password') && (msg.includes('short') || msg.includes('least') || msg.includes('character') || msg.includes('6'))) {
        return NextResponse.json(
          { error: 'パスワードは6文字以上必要です', errorCode: 'PASSWORD_TOO_SHORT' },
          { status: 400 }
        );
      }
      if (msg.includes('valid email') || msg.includes('invalid email')) {
        return NextResponse.json(
          { error: 'メールアドレスの形式が正しくありません', errorCode: 'INVALID_EMAIL' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'ユーザー作成に失敗しました: ' + authError.message, errorCode: 'AUTH_ERROR' },
        { status: 500 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'ユーザー作成に失敗しました', errorCode: 'USER_CREATION_FAILED' },
        { status: 500 }
      );
    }

    // 2. 作成したユーザーIDを用いて user_roles テーブルに設定情報を保存する
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert([{
        id: authData.user.id,
        email: email,
        role: 'customer',
        full_name: fullName || null,
        whatsapp: whatsapp || null,
        address: address || null,
        zip_code: zipCode || null,
        country: country || null,
        agent_customer_id: agentCustomerId || null,
        deposit_amount: 100, // 顧客のデフォルト保証金
        cpf: cpf || null,
        state: state || null,
        city: city || null,
        language: language || 'es'
      }]);

    if (roleError) {
      console.error('user_roles insert error:', roleError);
      // ロールバック処理：user_rolesへの登録が失敗した場合は作成された認証ユーザーも削除する
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: 'ロール設定に失敗しました: ' + roleError.message },
        { status: 500 }
      );
    }

    // 管理者へのプッシュ通知送信
    try {
      const { data: createdUser } = await supabaseAdmin
        .from('user_roles')
        .select('customer_id')
        .eq('id', authData.user.id)
        .single();

      const custName = fullName || email;
      const custIdStr = createdUser?.customer_id ? `(${createdUser.customer_id})` : '';

      const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      await fetch(`${baseUrl}/api/push-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sendToAdmins: true,
          title: '🔔 新規顧客登録',
          body: `${custName} ${custIdStr}`.trim(),
          url: '/admin'
        }),
      });
      // 登録ユーザーへウェルカムメールの送信
      if (email && createdUser?.customer_id) {
        sendWelcomeEmail(email, fullName || '', createdUser.customer_id, language || 'es').catch(err =>
          console.error('Customer welcome email error:', err)
        );
      }
    } catch (e) {
      console.error('Failed to send admin push notification:', e);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Critical error in POST /api/signup-customer:', error);
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
