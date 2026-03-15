export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth-helpers';

// リクエストのcookieヘッダーから直接ユーザーを取得
// next/headersの cookies() ではなくリクエストから直接パースする
async function getUserFromRequestCookies(request: Request) {
    try {
        const cookieHeader = request.headers.get('cookie');
        if (!cookieHeader) return null;

        // cookieヘッダーをパースして配列形式に変換 (安全なデコード)
        const parsedCookies = cookieHeader.split(';').map(c => {
            const [name, ...rest] = c.trim().split('=');
            let value = rest.join('=');
            try {
                value = decodeURIComponent(value);
            } catch (e) {
                // デコード失敗時はそのままの値を使う
            }
            return { name, value };
        });

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return parsedCookies;
                    },
                    setAll() {
                        // Route Handlerではcookieの書き込みは不要
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
        const user = await getUserFromRequest(request) || await getUserFromRequestCookies(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // supabaseAdmin（service role key）でRLSを完全に回避
        const { data: roleData, error: roleError } = await supabaseAdmin
            .from('user_roles')
            .select('*') // 特定のカラム指定で存在しないカラムがあった場合のクラッシュを防ぐ
            .eq('id', user.id)
            .single();

        if (roleError) {
            console.error('Database error fetching user_roles:', roleError);
            return NextResponse.json({ profile: null, errorDetail: roleError.message });
        }

        if (!roleData) {
            return NextResponse.json({ profile: null, errorDetail: 'No data found in user_roles' });
        }

        return NextResponse.json({ profile: roleData });
    } catch (error) {
        console.error('Error in GET /api/profile:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST: プロフィール情報を更新 (RLSを回避して確実な上書き)
export async function POST(request: Request) {
    try {
        // 認証
        const user = await getUserFromRequest(request) || await getUserFromRequestCookies(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { fullName, whatsapp } = body;

        // 既存のロールを取得
        const { data: existingData } = await supabaseAdmin
            .from('user_roles')
            .select('role')
            .eq('id', user.id)
            .single();

        const currentRole = existingData?.role || 'customer';

        // supabaseAdmin（service role key）でRLSを完全に回避してUPSERT
        const { data: roleData, error: roleError } = await supabaseAdmin
            .from('user_roles')
            .upsert({
                id: user.id,
                email: user.email,
                full_name: fullName,
                whatsapp: whatsapp,
                role: currentRole // 既存のロールを引き継ぐ、無い場合はcustomer
            }, {
                onConflict: 'id'
            })
            .select('*')
            .single();

        if (roleError) {
            console.error('Error upserting user_roles:', roleError);
            return NextResponse.json({ error: 'Failed to update profile in DB' }, { status: 500 });
        }

        // ついでに User Metadata の方も更新しておく (supabaseAdminなら可能)
        const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
            user.id,
            { user_metadata: { full_name: fullName, whatsapp: whatsapp } }
        );

        if (updateAuthError) {
            console.error('Error updating user auth metadata:', updateAuthError);
        }

        return NextResponse.json({ profile: roleData });
    } catch (error) {
        console.error('Error in POST /api/profile:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
