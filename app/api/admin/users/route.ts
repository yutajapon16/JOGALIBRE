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

export async function GET(request: Request) {
  try {
    // 1. 認証チェック（管理者以外は拒否）
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

    // 2. データの全取得
    // RLSを回避して全ユーザーと入札リクエストを取得
    const { data: users, error: usersError } = await supabaseAdmin
      .from('user_roles')
      .select('*')
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    // 落札確認済みの全リクエストを取得（キャンセルされたものも含める）
    const { data: requests, error: requestsError } = await supabaseAdmin
      .from('bid_requests')
      .select('*')
      .eq('final_status', 'won')
      .eq('customer_confirmed', true);

    if (requestsError) {
      console.error('Error fetching requests:', requestsError);
      return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
    }

    // 3. インメモリ集計の準備
    // メールアドレス (customer_email) からのリクエストマップを作成
    const userRequestsMap = new Map<string, typeof requests>();
    requests.forEach(req => {
      const key = req.customer_email ? req.customer_email.trim().toLowerCase() : null; 
      if (key) {
        if (!userRequestsMap.has(key)) {
          userRequestsMap.set(key, []);
        }
        userRequestsMap.get(key)!.push(req);
      }
    });

    // 4. 各ユーザーの集計
    const compiledUsers = users.map(u => {
      const emailKey = u.email ? u.email.trim().toLowerCase() : '';
      const userReqs = emailKey ? (userRequestsMap.get(emailKey) || []) : [];
      
      const unpaidAmount = userReqs
        .filter(r => !r.cancelled_at && !r.paid)
        .reduce((sum, r) => sum + (r.final_price || 0), 0);
      const unpaidCount = userReqs.filter(r => !r.cancelled_at && !r.paid).length;
      
      const paidAmount = userReqs
        .filter(r => !r.cancelled_at && r.paid)
        .reduce((sum, r) => sum + (r.final_price || 0), 0);
      const paidCount = userReqs.filter(r => !r.cancelled_at && r.paid).length;

      return {
        id: u.id,
        email: u.email,
        role: u.role,
        fullName: u.full_name,
        whatsapp: u.whatsapp,
        country: u.country,
        customerId: u.customer_id,
        agentCustomerId: u.agent_customer_id,
        depositAmount: u.deposit_amount !== null && u.deposit_amount !== undefined ? Number(u.deposit_amount) : (u.role === 'agent' ? 500 : 100),
        depositConfirmedAt: u.deposit_confirmed_at,
        termsAcceptedAt: u.terms_accepted_at,
        lastLoginAt: u.last_login_at,
        unpaidCount,
        unpaidAmount,
        paidCount,
        paidAmount,
      };
    });

    // 5. エージェントの集計（傘下顧客の合計を合算）
    // 顧客リストとエージェントリストの分離
    const customers = compiledUsers.filter(u => u.role === 'customer');
    const agents = compiledUsers.filter(u => u.role === 'agent').map(agent => {
      // このエージェント（customerId）に紐づく顧客を抽出
      const subCustomers = customers.filter(c => c.agentCustomerId === agent.customerId);

      // 傘下顧客の統計を合算
      const unpaidCount = subCustomers.reduce((sum, c) => sum + c.unpaidCount, 0);
      const unpaidAmount = subCustomers.reduce((sum, c) => sum + c.unpaidAmount, 0);
      const paidCount = subCustomers.reduce((sum, c) => sum + c.paidCount, 0);
      const paidAmount = subCustomers.reduce((sum, c) => sum + c.paidAmount, 0);

      return {
        ...agent,
        unpaidCount,
        unpaidAmount,
        paidCount,
        paidAmount,
        customersCount: subCustomers.length,
        selfUnpaidCount: agent.unpaidCount,
        selfUnpaidAmount: agent.unpaidAmount,
        selfPaidCount: agent.paidCount,
        selfPaidAmount: agent.paidAmount
      };
    });

    return NextResponse.json(
      { customers, agents },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('Error in GET /api/admin/users:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
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

    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userRole?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id') || searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    // 削除対象のユーザー情報を取得
    const { data: targetUser } = await supabaseAdmin
      .from('user_roles')
      .select('id, email, role, customer_id')
      .eq('id', userId)
      .single();

    // 2. DB（user_roles）から削除
    const { error: dbDeleteError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('id', userId);

    if (dbDeleteError) {
      console.error('Error deleting user_roles row:', dbDeleteError);
    }

    // 3. Supabase Auth (auth.users) から完全削除
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      console.warn('Error deleting auth user by id (may already be deleted):', authDeleteError);
      // メールアドレスが残っている場合はメールアドレス一致でも削除
      if (targetUser?.email) {
        try {
          const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers();
          const targetAuth = authUsers?.find(u => (u.email || '').trim().toLowerCase() === targetUser.email.trim().toLowerCase());
          if (targetAuth) {
            await supabaseAdmin.auth.admin.deleteUser(targetAuth.id);
          }
        } catch (e) {
          console.warn('Fallback auth deletion failed:', e);
        }
      }
    }

    // 4. プッシュ通知トークン等のクリーンアップ
    try {
      await supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId);
    } catch {}

    return NextResponse.json({ success: true, message: 'ユーザーを完全に削除しました' });
  } catch (error) {
    console.error('Error in DELETE /api/admin/users:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
