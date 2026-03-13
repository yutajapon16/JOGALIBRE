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

    // 1. Supabase Admin でユーザーを作成
    // email_confirm: false → メール未確認状態で作成（後で確認メールを送る）
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
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

    // 3. 確認メールを送信（ベストエフォート）
    // ここでエラーが発生しても、ユーザーとロールは既に作成済みなので
    // 成功レスポンスを返す。メールが届かない場合は管理者が手動確認も可能。
    let emailSent = false;
    try {
      const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: {
          full_name: fullName || null,
          whatsapp: whatsapp || null,
          role: 'agent'
        }
      });
      if (inviteError) {
        console.warn('招待メール送信でエラー（ユーザーは作成済み）:', inviteError.message);
      } else {
        emailSent = true;
      }
    } catch (inviteException) {
      // inviteUserByEmailが例外をスローした場合もキャッチして無視
      console.warn('招待メール送信で例外（ユーザーは作成済み）:', inviteException);
    }

    return NextResponse.json({
      success: true,
      emailSent,
      message: emailSent
        ? 'エージェントアカウントが作成されました。確認メールを確認してください。'
        : 'エージェントアカウントが作成されました。確認メールの送信に失敗しましたが、管理者が手動で有効化できます。'
    });

  } catch (error) {
    console.error('Critical error in POST /api/agent-signup:', error);
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
