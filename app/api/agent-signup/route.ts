export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// エージェント登録用API
// supabaseAdmin (service role) を使用してRLSを回避し、
// user_rolesへのinsertを確実に行う
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, fullName, whatsapp } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'メールアドレスとパスワードは必須です' },
        { status: 400 }
      );
    }

    // 1. Supabase Auth でユーザーを作成（管理者権限で）
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // メール確認を要求
      user_metadata: {
        full_name: fullName || null,
        whatsapp: whatsapp || null,
        role: 'agent'
      }
    });

    if (authError) {
      console.error('Auth user creation error:', authError);
      // メールアドレス重複の場合
      if (authError.message?.includes('already') || authError.message?.includes('exists')) {
        return NextResponse.json(
          { error: 'このメールアドレスは既に使用されています' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'ユーザー作成に失敗しました: ' + authError.message },
        { status: 500 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'ユーザー作成に失敗しました' },
        { status: 500 }
      );
    }

    // 2. user_roles にエージェントとして登録（service role でRLSを回避）
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert([{
        id: authData.user.id,
        email: email,
        role: 'agent',
        full_name: fullName || null,
        whatsapp: whatsapp || null
      }]);

    if (roleError) {
      console.error('user_roles insert error:', roleError);
      // ロールバック：auth ユーザーを削除
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: 'ロール設定に失敗しました: ' + roleError.message },
        { status: 500 }
      );
    }

    // 3. メール確認メールを送信（signUp経由で招待）
    const { error: inviteError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
    });

    if (inviteError) {
      console.warn('メール送信エラー（ユーザーは作成済み）:', inviteError);
    }

    return NextResponse.json({
      success: true,
      message: 'エージェントアカウントが作成されました。メールを確認してください。'
    });

  } catch (error) {
    console.error('Critical error in POST /api/agent-signup:', error);
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
