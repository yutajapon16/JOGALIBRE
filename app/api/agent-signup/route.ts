export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// エージェント登録用API
// inviteUserByEmail で「ユーザー作成 + 確認メール送信」を一括実行し、
// その後 updateUserById でパスワードを設定、user_roles にロールを挿入する
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

    // 1. inviteUserByEmail でユーザー作成 + 確認メール送信を一括実行
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName || null,
        whatsapp: whatsapp || null,
        role: 'agent'
      }
    });

    if (inviteError) {
      console.error('Invite user error:', inviteError);
      if (inviteError.message?.includes('already') || inviteError.message?.includes('exists')) {
        return NextResponse.json(
          { error: 'このメールアドレスは既に使用されています' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'ユーザー招待に失敗しました: ' + inviteError.message },
        { status: 500 }
      );
    }

    if (!inviteData.user) {
      return NextResponse.json(
        { error: 'ユーザー作成に失敗しました' },
        { status: 500 }
      );
    }

    const userId = inviteData.user.id;

    // 2. パスワードを設定（招待リンク確認後にログインで使えるように）
    const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: password
    });

    if (passwordError) {
      console.error('Password set error:', passwordError);
      // パスワード設定失敗は致命的ではない（招待リンクから再設定可能）
    }

    // 3. user_roles にエージェントとして登録（service role でRLSを回避）
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert([{
        id: userId,
        email: email,
        role: 'agent',
        full_name: fullName || null,
        whatsapp: whatsapp || null
      }]);

    if (roleError) {
      console.error('user_roles insert error:', roleError);
      // ロールバック：auth ユーザーを削除
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: 'ロール設定に失敗しました: ' + roleError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'エージェントアカウントが作成されました。確認メールを確認してください。'
    });

  } catch (error) {
    console.error('Critical error in POST /api/agent-signup:', error);
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
