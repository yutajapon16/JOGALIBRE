import { supabaseAdmin } from './supabase-admin';

// Bearerトークンからユーザーを取得する共通ヘルパー
// 各APIルートで重複していた認証ロジックを一箇所に集約
export async function getUserFromRequest(request: Request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    if (!token) return null;
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    return user;
}

// メールアドレスからユーザー情報を取得する共通ヘルパー
// listUsers()で全ユーザーを取得する非効率なパターンを、
// user_rolesテーブルへの直接クエリに置き換え
export async function getUserInfoByEmail(email: string) {
    try {
        const { data, error } = await supabaseAdmin
            .from('user_roles')
            .select('full_name, whatsapp, customer_id, role')
            .eq('email', email)
            .single();

        if (error) {
            console.error('getUserInfoByEmail error:', error);
            return null;
        }
        return data;
    } catch (error) {
        console.error('Error in getUserInfoByEmail:', error);
        return null;
    }
}
