export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cleanExpiredInviteCodes, type InviteCode } from '@/lib/utils';

// エージェント登録用API
// admin.createUser で確実にユーザーを作成し、email_confirm: true で即ログイン可能にする
// 一時的な招待コードで保護されており、有効なコードがないと登録できない
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, fullName, whatsapp, accessPassword, address, zipCode, country, cpf, state, city, language } = body;

    // 招待コードの検証
    if (!accessPassword) {
      return NextResponse.json(
        { error: '招待コードは必須です' },
        { status: 400 }
      );
    }

    const { data: settingData, error: fetchError } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'agent_invite_codes')
      .single();

    if (fetchError) {
      console.error('Error fetching invite codes:', fetchError);
      return NextResponse.json(
        { error: '招待コードの検証に失敗しました。管理者にお問い合わせください。' },
        { status: 500 }
      );
    }

    const inviteCodes: InviteCode[] = settingData?.value ? (settingData.value as InviteCode[]) : [];

    // 有効期限切れ後24時間経過したコードをクリーンアップ
    const { cleanedCodes } = cleanExpiredInviteCodes(inviteCodes);

    // 入力されたコードと一致する有効な（未使用かつ期限内の）招待コードを検索
    const matchedCodeIndex = cleanedCodes.findIndex(c => 
      c.code === accessPassword && 
      !c.used && 
      new Date(c.expiresAt).getTime() > Date.now()
    );

    if (matchedCodeIndex === -1) {
      return NextResponse.json(
        { error: '招待コードが正しくないか、期限切れです' },
        { status: 403 }
      );
    }

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
        role: 'agent',
        user_role: 'agent',
        address: address || null,
        zip_code: zipCode || null,
        country: country || null,
        cpf: cpf || null,
        state: state || null,
        city: city || null,
        language: language || 'es'
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
        whatsapp: whatsapp || null,
        address: address || null,
        zip_code: zipCode || null,
        country: country || null,
        deposit_amount: 500, // エージェントのデフォルト保証金を設定
        cpf: cpf || null,
        state: state || null,
        city: city || null,
        language: language || 'es'
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

    // 3. 招待コードを「使用済み」に更新（クリーンアップ後の配列を使用）
    cleanedCodes[matchedCodeIndex].used = true;
    const { error: updateError } = await supabaseAdmin
      .from('system_settings')
      .upsert({
        key: 'agent_invite_codes',
        value: cleanedCodes
      });

    if (updateError) {
      console.error('Failed to mark invite code as used:', updateError);
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
          title: '🔔 新規エージェント登録',
          body: `${custName} ${custIdStr}`.trim(),
          url: '/admin'
        }),
      });
    } catch (e) {
      console.error('Failed to send admin push notification:', e);
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
