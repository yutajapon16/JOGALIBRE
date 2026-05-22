import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth-helpers';

async function getSupabaseServer() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          const cookieStore = await cookies();
          return cookieStore.getAll();
        },
        async setAll(cookiesToSet) {
          try {
            const cookieStore = await cookies();
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component から呼ばれた場合は無視
          }
        },
      },
    }
  );
}

export async function POST(request: Request) {
  try {
    // 1. 管理者認証チェック
    let user = await getUserFromRequest(request);
    if (!user) {
      const supabase = await getSupabaseServer();
      const { data: { user: cookieUser } } = await supabase.auth.getUser();
      user = cookieUser;
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ロールが admin かどうか確認
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userRole?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. リクエストボディのパース
    const body = await request.json();
    const { userId, depositAmount, depositConfirmed, agentCustomerId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // 現在のユーザー情報を取得
    const { data: currentUserRole, error: fetchError } = await supabaseAdmin
      .from('user_roles')
      .select('deposit_confirmed_at, role')
      .eq('id', userId)
      .single();

    if (fetchError || !currentUserRole) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 3. 更新データの組み立て
    const updateData: Record<string, any> = {};

    if (depositAmount !== undefined) {
      updateData.deposit_amount = Number(depositAmount);
    }

    if (depositConfirmed !== undefined) {
      if (depositConfirmed) {
        // すでに日時が入っている場合はそのまま、無ければ現在日時をセット
        updateData.deposit_confirmed_at = currentUserRole.deposit_confirmed_at || new Date().toISOString();
      } else {
        updateData.deposit_confirmed_at = null;
      }
    }

    if (currentUserRole.role === 'customer') {
      // 顧客の場合のみエージェントIDを更新可能
      updateData.agent_customer_id = agentCustomerId ? agentCustomerId.trim() : null;
    }

    // 4. データベースの更新
    const { error: updateError } = await supabaseAdmin
      .from('user_roles')
      .update(updateData)
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating user role:', updateError);
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/admin/update-user:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
