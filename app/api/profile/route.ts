import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Bearer トークンからユーザーを取得するヘルパー
async function getUserFromRequest(request: Request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    return user;
}

// GET: 自分のプロフィールを取得
export async function GET(request: Request) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: roleData, error: roleError } = await supabaseAdmin
            .from('user_roles')
            .select('role, full_name, whatsapp, customer_id')
            .eq('id', user.id)
            .single();

        if (roleError || !roleData) {
            // レコードがない場合は null を返す（フロント側でフォールバック処理）
            return NextResponse.json({ profile: null });
        }

        return NextResponse.json({ profile: roleData });
    } catch (error) {
        console.error('Error in GET /api/profile:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
