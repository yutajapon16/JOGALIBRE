export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// ユーザーロール保存用API
// signUp後の未認証状態でもRLSをバイパスしてuser_rolesに書き込むための専用API
export async function POST(request: Request) {
  try {
    const { id, email, role, fullName, whatsapp } = await request.json();

    if (!id || !email) {
      return NextResponse.json(
        { error: 'IDとメールアドレスは必須です' },
        { status: 400 }
      );
    }

    const userRole = role || 'customer';

    // supabaseAdmin で user_roles に登録（RLSバイパス）
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert([{
        id: id,
        email: email,
        role: userRole,
        full_name: fullName || null,
        whatsapp: whatsapp || null
      }]);

    if (roleError) {
      console.error('user_roles insert error:', roleError);
      
      // user_rolesの保存に失敗した場合は、作成されたばかりのAuthユーザーも削除してロールバック
      await supabaseAdmin.auth.admin.deleteUser(id);
      
      return NextResponse.json(
        { error: 'ロール設定に失敗しました: ' + roleError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Critical error in POST /api/save-user-role:', error);
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
