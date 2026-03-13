export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';

// 顧客向けのユーザー登録API（エージェントとは別ルート）
// クライアント側で直接 signUp すると、メール確認前の未認証状態となり
// RLSに弾かれて user_roles への INSERT が失敗するため、サーバーサイドでRLSをバイパスする
export async function POST(request: Request) {
  try {
    const { email, password, role, fullName, whatsapp } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'メールアドレスとパスワードは必須です' },
        { status: 400 }
      );
    }

    const userRole = role || 'customer';

    // 1. inviteUserByEmail で「ユーザー作成 + 確認メール送信」を一括実行
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName || null,
        whatsapp: whatsapp || null,
        role: userRole
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
        { error: 'ユーザー作成に失敗しました: ' + inviteError.message },
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
      // パスワード設定失敗は致命的ではない（招待からの再設定可能）
    }

    // 3. supabaseAdmin で user_roles に登録（RLSバイパス）
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert([{
        id: userId,
        email: email,
        role: userRole,
        full_name: fullName || null,
        whatsapp: whatsapp || null
      }]);

    if (roleError) {
      console.error('user_roles insert error:', roleError);
      // ロールバック：authユーザーを削除
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: 'ロール設定に失敗しました: ' + roleError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: inviteData.user
    });

  } catch (error: any) {
    console.error('Critical error in POST /api/signup:', error);
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
