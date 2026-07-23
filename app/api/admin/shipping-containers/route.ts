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

    const { data: containers, error } = await supabaseAdmin
      .from('shipping_containers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching shipping containers:', error);
      return NextResponse.json({ error: 'Failed to fetch shipping containers' }, { status: 500 });
    }

    return NextResponse.json(
      { containers },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('Error in GET /api/admin/shipping-containers:', error);
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
    const { containerCode, shippedAt, estimatedArrivalDate, carrier, trackingNumber, trackingUrl } = body;

    if (!containerCode || !containerCode.trim()) {
      return NextResponse.json({ error: 'Missing required field: containerCode' }, { status: 400 });
    }

    const payload = {
      container_code: containerCode.trim(),
      shipped_at: shippedAt ? new Date(shippedAt).toISOString() : null,
      estimated_arrival_date: estimatedArrivalDate || null,
      carrier: carrier ? carrier.trim() : null,
      tracking_number: trackingNumber ? trackingNumber.trim() : null,
      tracking_url: trackingUrl ? trackingUrl.trim() : null,
    };

    const { data, error } = await supabaseAdmin
      .from('shipping_containers')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      console.error('Error inserting shipping container:', error);
      if (error.code === '23505') {
        return NextResponse.json({ error: 'この管理番号は既に登録されています' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message || 'Failed to create shipping container' }, { status: 500 });
    }

    return NextResponse.json({ success: true, container: data });
  } catch (error) {
    console.error('Error in POST /api/admin/shipping-containers:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
