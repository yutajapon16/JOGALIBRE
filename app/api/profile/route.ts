export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth-helpers';

import { cookies } from 'next/headers';

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
                        // setAll will error if called from a Server Component
                    }
                },
            },
        }
    );
}

// GET: 自分のプロフィールを取得
// Bearerトークン または cookie のどちらでも認証可能
export async function GET(request: Request) {
    try {
        // Bearerトークンを優先、無ければcookieから認証
        let user = await getUserFromRequest(request);
        
        if (!user) {
            const supabase = await getSupabaseServer();
            const { data: { user: cookieUser } } = await supabase.auth.getUser();
            user = cookieUser;
        }
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

        // エージェントIDが設定されている場合は、そのエージェントの氏名も取得する
        let agentFullName = null;
        if (roleData.agent_customer_id) {
            const cleanAgentId = roleData.agent_customer_id.trim().toUpperCase();
            const { data: agentData } = await supabaseAdmin
                .from('user_roles')
                .select('full_name')
                .eq('customer_id', cleanAgentId)
                .eq('role', 'agent')
                .maybeSingle();
            
            if (agentData) {
                agentFullName = agentData.full_name;
            }
        }

        return NextResponse.json({ 
            profile: {
                ...roleData,
                agent_full_name: agentFullName
            } 
        });
    } catch (error) {
        console.error('Error in GET /api/profile:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST: プロフィール情報を更新 (RLSを回避して確実な上書き)
export async function POST(request: Request) {
    try {
        // 認証
        let user = await getUserFromRequest(request);

        if (!user) {
            const supabase = await getSupabaseServer();
            const { data: { user: cookieUser } } = await supabase.auth.getUser();
            user = cookieUser;
        }
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { fullName, whatsapp, address, zipCode, agentCustomerId, cpf } = body;
        const cleanAgentCustomerId = agentCustomerId ? agentCustomerId.trim().toUpperCase() : null;

        // 既存のロールと国名を取得（国名は更新しないため、引き継ぐ）
        const { data: existingData } = await supabaseAdmin
            .from('user_roles')
            .select('role, country')
            .eq('id', user.id)
            .single();

        const currentRole = existingData?.role || 'customer';
        const currentCountry = existingData?.country || null;

        // supabaseAdmin（service role key）でRLSを完全に回避してUPSERT
        const { data: roleData, error: roleError } = await supabaseAdmin
            .from('user_roles')
            .upsert({
                id: user.id,
                email: user.email,
                full_name: fullName,
                whatsapp: whatsapp,
                address: address,
                zip_code: zipCode,
                country: currentCountry, // 国名は変更不可なので引き継ぐ
                role: currentRole, // 既存のロールを引き継ぐ、無い場合はcustomer
                agent_customer_id: cleanAgentCustomerId,
                cpf: cpf || null
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
            { user_metadata: { full_name: fullName, whatsapp: whatsapp, address: address, zip_code: zipCode, agent_customer_id: cleanAgentCustomerId, cpf: cpf || null } }
        );

        if (updateAuthError) {
            console.error('Error updating user auth metadata:', updateAuthError);
        }

        // エージェントIDが設定されている場合は、そのエージェントの氏名も取得する
        let agentFullName = null;
        if (roleData && roleData.agent_customer_id) {
            const cleanAgentId = roleData.agent_customer_id.trim().toUpperCase();
            const { data: agentData } = await supabaseAdmin
                .from('user_roles')
                .select('full_name')
                .eq('customer_id', cleanAgentId)
                .eq('role', 'agent')
                .maybeSingle();
            
            if (agentData) {
                agentFullName = agentData.full_name;
            }
        }

        return NextResponse.json({ 
            profile: {
                ...roleData,
                agent_full_name: agentFullName
            } 
        });
    } catch (error) {
        console.error('Error in POST /api/profile:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
