export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth-helpers';

// Supabaseクライアントを作成する内部ヘルパー
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

// GET: ログイン中の顧客自身の入金履歴を取得
export async function GET(request: Request) {
  try {
    // 認証情報の取得（ヘッダーまたはクッキーから）
    let user = await getUserFromRequest(request);
    if (!user) {
      const supabase = await getSupabaseServer();
      const { data: { user: cookieUser } } = await supabase.auth.getUser();
      user = cookieUser;
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ユーザーに紐づく customer_id を取得
    const { data: userRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('customer_id')
      .eq('id', user.id)
      .single();

    if (roleError || !userRole?.customer_id) {
      console.error('Error fetching user customer_id:', roleError);
      return NextResponse.json({ deposits: [] });
    }

    // deposits テーブルから customer_id が一致する入金データを取得
    const { data: deposits, error: depositsError } = await supabaseAdmin
      .from('deposits')
      .select('*')
      .eq('customer_id', userRole.customer_id)
      .order('deposit_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (depositsError) {
      console.error('Error fetching deposits for customer:', depositsError);
      return NextResponse.json({ error: 'Failed to fetch deposits' }, { status: 500 });
    }

    return NextResponse.json({ deposits });
  } catch (error) {
    console.error('Error in GET /api/deposits:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
