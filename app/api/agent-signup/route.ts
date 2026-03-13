export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// エージェント登録用API
// admin.createUser で確実にユーザーを作成し、email_confirm: true で即ログイン可能にする
// /agent ページからのみアクセスされるため、URLがアクセス制御として機能する
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

    // 1. admin.createUser でユーザーを作成
    // email_confirm: true → メール確認済みとして作成（確認メール不要、即ログイン可能）
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || null,
        whatsapp: whatsapp || null,
        role: 'agent'
      }
    });

    if (authError) {
      console.error('Auth user creation error:', authError);
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

    return NextResponse.json({
      success: true,
      message: 'エージェントアカウントが作成されました。すぐにログインできます。'
    });

  } catch (error) {
    console.error('Critical error in POST /api/agent-signup:', error);
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
