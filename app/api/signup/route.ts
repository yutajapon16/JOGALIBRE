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

    // 1. 通常のSupabaseクライアントでsignUp（確認メールが自動送信される）
    const supabaseAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: authData, error: authError } = await supabaseAnon.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || null,
          whatsapp: whatsapp || null,
          role: userRole
        }
      }
    });

    if (authError) {
      console.error('Auth signUp error:', authError);
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

    // 2. supabaseAdmin で user_roles に登録（RLSバイパス）
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert([{
        id: authData.user.id,
        email: email,
        role: userRole,
        full_name: fullName || null,
        whatsapp: whatsapp || null
      }]);

    if (roleError) {
      console.error('user_roles insert error:', roleError);
      // ロールバック：authユーザーを削除
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: 'ロール設定に失敗しました: ' + roleError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: authData.user
    });

  } catch (error: any) {
    console.error('Critical error in POST /api/signup:', error);
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
