export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createServerClient } from '@supabase/ssr';

// リクエストのcookieヘッダーから直接ユーザーを取得
async function getUserFromRequestCookies(request: Request) {
    try {
        const cookieHeader = request.headers.get('cookie');
        if (!cookieHeader) return null;

        const parsedCookies = cookieHeader.split(';').map(c => {
            const [name, ...rest] = c.trim().split('=');
            let value = rest.join('=');
            try {
                value = decodeURIComponent(value);
            } catch (e) { }
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
                    setAll() { },
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

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const fullName = searchParams.get('name') || 'Debug User';
    const whatsapp = searchParams.get('wa') || '999999999';

    // ログイン中のユーザー情報を取得
    const user = await getUserFromRequestCookies(request);

    if (!user) {
        return NextResponse.json({ error: 'Please login first to use this debug endpoint. (Your session could not be read automatically)' }, { status: 401 });
    }

    const userId = user.id;

    try {
        // 現在のDBのuser_rolesを直接取得
        const { data: dbDataBefore, error: dbErrorBefore } = await supabaseAdmin
            .from('user_roles')
            .select('*')
            .eq('id', userId)
            .single();

        const currentRole = dbDataBefore?.role || 'customer';

        // 強制的にupsertを実行 (admin権限)
        const { data: upsertData, error: upsertError } = await supabaseAdmin
            .from('user_roles')
            .upsert({
                id: userId,
                full_name: fullName,
                whatsapp: whatsapp,
                role: currentRole
            }, {
                onConflict: 'id'
            })
            .select('*')
            .single();

        // 実行直後の状態を再確認
        const { data: dbDataAfter, error: dbErrorAfter } = await supabaseAdmin
            .from('user_roles')
            .select('*')
            .eq('id', userId)
            .single();

        // プロフィールの状態も確認
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);

        return NextResponse.json({
            message: "DEBUG ENDPOINT (Auto detected userId: " + userId + ")",
            requestArgs: { userId, fullName, whatsapp },
            action: {
                message: "Tried to UPSERT user_roles with admin privileges",
                upsertSuccess: !upsertError,
                upsertReturnData: upsertData,
                upsertErrorMessage: upsertError ? upsertError.message : null,
                upsertErrorDetails: upsertError ? upsertError.details : null,
                upsertErrorHint: upsertError ? upsertError.hint : null,
                upsertErrorCode: upsertError ? upsertError.code : null,
            },
            databaseState: {
                beforeUpsert: dbDataBefore,
                afterUpsert: dbDataAfter,
                beforeError: dbErrorBefore ? dbErrorBefore.message : null,
                afterError: dbErrorAfter ? dbErrorAfter.message : null,
            },
            authMetadata: authUser?.user?.user_metadata || null,
            authError: authError ? authError.message : null
        });

    } catch (error: any) {
        return NextResponse.json({
            error: 'Fatal Error in Debug Endpoint',
            message: error.message
        }, { status: 500 });
    }
}
