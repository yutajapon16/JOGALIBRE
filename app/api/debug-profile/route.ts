export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');
    const fullName = searchParams.get('name') || 'Test User';
    const whatsapp = searchParams.get('wa') || '1234567890';

    if (!userId) {
        return NextResponse.json({ error: 'Please provide ?id= (Your user ID)' }, { status: 400 });
    }

    try {
        // 現在のDBのuser_rolesを直接取得
        const { data: dbDataBefore, error: dbErrorBefore } = await supabaseAdmin
            .from('user_roles')
            .select('*')
            .eq('id', userId)
            .single();

        // 強制的にupsertを実行 (admin権限)
        const { data: upsertData, error: upsertError } = await supabaseAdmin
            .from('user_roles')
            .upsert({
                id: userId,
                full_name: fullName,
                whatsapp: whatsapp
            }, {
                onConflict: 'id' // 明示的に id カラムで処理する
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
            message: "DEBUG ENDPOINT",
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
            authMetadata: authUser ? authUser.user.user_metadata : null
        });

    } catch (error: any) {
        return NextResponse.json({
            error: 'Fatal Error in Debug Endpoint',
            message: error.message
        }, { status: 500 });
    }
}
