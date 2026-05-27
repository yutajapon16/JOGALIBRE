export const dynamic = 'force-dynamic';
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

// 共通の管理者権限チェック処理
async function checkAdmin(request: Request) {
  let user = await getUserFromRequest(request);
  if (!user) {
    const supabase = await getSupabaseServer();
    const { data: { user: cookieUser } } = await supabase.auth.getUser();
    user = cookieUser;
  }

  if (!user) {
    return { error: 'Unauthorized', status: 401 };
  }

  // user_rolesテーブルからロールをチェック
  const { data: userRole } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userRole?.role !== 'admin') {
    return { error: 'Forbidden', status: 403 };
  }

  return { user };
}

export async function GET(request: Request) {
  try {
    const adminCheck = await checkAdmin(request);
    if ('error' in adminCheck) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }

    // 全ての入金履歴を取得（日付の新しい順）
    const { data: deposits, error } = await supabaseAdmin
      .from('deposits')
      .select('*')
      .order('deposit_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching deposits:', error);
      return NextResponse.json({ error: 'Failed to fetch deposits' }, { status: 500 });
    }

    return NextResponse.json({ deposits });
  } catch (error) {
    console.error('Error in GET /api/admin/deposits:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const adminCheck = await checkAdmin(request);
    if ('error' in adminCheck) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await request.json();
    const { customerId, depositDate, amount, paymentMethod } = body;

    if (!customerId || !depositDate || amount === undefined || !paymentMethod) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('deposits')
      .insert({
        customer_id: customerId,
        deposit_date: depositDate,
        amount: Number(amount),
        payment_method: paymentMethod,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating deposit:', error);
      return NextResponse.json({ error: 'Failed to create deposit' }, { status: 500 });
    }

    return NextResponse.json({ success: true, deposit: data });
  } catch (error) {
    console.error('Error in POST /api/admin/deposits:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const adminCheck = await checkAdmin(request);
    if ('error' in adminCheck) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await request.json();
    const { id, depositDate, amount, paymentMethod } = body;

    if (!id || !depositDate || amount === undefined || !paymentMethod) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('deposits')
      .update({
        deposit_date: depositDate,
        amount: Number(amount),
        payment_method: paymentMethod,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating deposit:', error);
      return NextResponse.json({ error: 'Failed to update deposit' }, { status: 500 });
    }

    return NextResponse.json({ success: true, deposit: data });
  } catch (error) {
    console.error('Error in PATCH /api/admin/deposits:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const adminCheck = await checkAdmin(request);
    if ('error' in adminCheck) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('deposits')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting deposit:', error);
      return NextResponse.json({ error: 'Failed to delete deposit' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/admin/deposits:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
