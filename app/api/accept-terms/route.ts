import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase-admin';

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
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 現在のユーザーロール情報を取得
    const { data: userRole, error: fetchError } = await supabaseAdmin
      .from('user_roles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (fetchError || !userRole) {
      return NextResponse.json({ error: 'User role not found' }, { status: 404 });
    }

    if (userRole.terms_accepted_at) {
      return NextResponse.json({ success: true, message: 'Already accepted' });
    }

    // 保証金金額のデフォルト設定 (agent は 1000、customer は 300)
    const defaultDeposit = userRole.role === 'agent' ? 1000 : 300;
    const currentDeposit = userRole.deposit_amount !== null && userRole.deposit_amount !== undefined
      ? Number(userRole.deposit_amount)
      : defaultDeposit;

    const { error: updateError } = await supabaseAdmin
      .from('user_roles')
      .update({
        terms_accepted_at: new Date().toISOString(),
        deposit_amount: currentDeposit
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating terms acceptance:', updateError);
      return NextResponse.json({ error: 'Failed to accept terms' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/accept-terms:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
