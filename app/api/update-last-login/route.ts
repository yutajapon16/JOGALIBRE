import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth-helpers';

/**
 * ログイン中ユーザーの最終ログイン日時（last_login_at）を更新するAPIエンドポイント。
 * 同時に、リマインドメール送信済み日時（last_login_reminded_at）をNULLにクリアします。
 */
export async function POST(request: Request) {
  try {
    // 1. 認証チェック
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date().toISOString();

    // 2. user_roles の最終ログイン情報を更新
    const { error } = await supabaseAdmin
      .from('user_roles')
      .update({
        last_login_at: now,
        last_login_reminded_at: null // ログインしたため、リマインドフラグをクリア
      })
      .eq('id', user.id);

    if (error) {
      console.error('Failed to update last_login_at in DB:', error);
      return NextResponse.json({ error: 'Failed to update last login' }, { status: 500 });
    }

    return NextResponse.json({ success: true, lastLoginAt: now });
  } catch (error) {
    console.error('Critical error in POST /api/update-last-login:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
