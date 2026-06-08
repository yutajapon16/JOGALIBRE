export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// ユーザーロール保存用API
// signUp後の未認証状態でもRLSをバイパスしてuser_rolesに書き込むための専用API
export async function POST(request: Request) {
  try {
    const { id, email, role, fullName, whatsapp, address, zipCode, country, agentCustomerId, cpf, state, city, language } = await request.json();
 
    if (!id || !email) {
      return NextResponse.json(
        { error: 'IDとメールアドレスは必須です' },
        { status: 400 }
      );
    }
 
    const userRole = role || 'customer';
    const defaultDeposit = userRole === 'agent' ? 500 : 100;

    // 自動紐づけは行わず、手動紐づけ（agentCustomerId）を使用
    const finalAgentCustomerId = agentCustomerId || null;
 
    // supabaseAdmin で user_roles に登録（RLSバイパス）
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert([{
        id: id,
        email: email,
        role: userRole,
        full_name: fullName || null,
        whatsapp: whatsapp || null,
        address: address || null,
        zip_code: zipCode || null,
        country: country || null,
        agent_customer_id: finalAgentCustomerId,
        deposit_amount: defaultDeposit, // ロールに応じたデフォルト保証金を設定
        cpf: cpf || null,
        state: state || null,
        city: city || null,
        language: language || 'es'
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

  } catch (error) {
    console.error('Critical error in POST /api/save-user-role:', error);
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
