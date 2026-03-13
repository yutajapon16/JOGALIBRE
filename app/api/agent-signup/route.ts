export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';

// エージェント登録用API
// 通常のsignUp（確認メール自動送信）+ supabaseAdmin（RLSをバイパスしてuser_rolesに確実にinsert）
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
          role: 'agent'
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

    // 2. supabaseAdmin でuser_rolesにエージェントとして登録（RLSバイパス）
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
      // ロールバック：authユーザーを削除
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
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
