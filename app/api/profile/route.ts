import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Bearerトークンからユーザーを取得するヘルパー（後方互換用）
async function getUserFromBearerToken(request: Request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    if (!token) return null;
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    return user;
}

// cookieからユーザーを取得するヘルパー（@supabase/ssr対応）
async function getUserFromCookies() {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                },
            }
        );
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) return null;
        return user;
    } catch {
        return null;
    }
}

// GET: 自分のプロフィールを取得
// Bearerトークン または cookie のどちらでも認証可能
export async function GET(request: Request) {
    try {
        // Bearerトークンを優先、無ければcookieから認証
        const user = await getUserFromBearerToken(request) || await getUserFromCookies();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // supabaseAdmin（service role key）でRLSを回避してプロフィール取得
        const { data: roleData, error: roleError } = await supabaseAdmin
            .from('user_roles')
            .select('role, full_name, whatsapp, customer_id')
            .eq('id', user.id)
            .single();

        if (roleError || !roleData) {
            return NextResponse.json({ profile: null });
        }

        return NextResponse.json({ profile: roleData });
    } catch (error) {
        console.error('Error in GET /api/profile:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
