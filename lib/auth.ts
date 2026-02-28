import { supabase } from './supabase';

export type UserRole = 'customer' | 'admin';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  fullName?: string;
  whatsapp?: string;
  customerId?: string;
}

export async function signUp(
  email: string,
  password: string,
  role: UserRole = 'customer',
  fullName?: string,
  whatsapp?: string
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) throw error;
  if (!data.user) throw new Error('User creation failed');

  const { error: roleError } = await supabase
    .from('user_roles')
    .insert([{
      id: data.user.id,
      role,
      full_name: fullName || null,
      whatsapp: whatsapp || null
    }]);

  if (roleError) throw roleError;

  return data;
}

export async function signIn(email: string, password: string) {
  // 古い壊れたセッションをクリアしてから新規ログイン
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // 無視（既にログアウト状態の場合）
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  // supabase.auth.signOut() が自動的にセッショントークンを
  // localStorage から削除するため、手動での clear() は不要
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// パスワードリセットメール送信
export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`
  });
  if (error) throw error;
}

// パスワード更新（リセットリンクからアクセスした後）
export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({
    password: newPassword
  });
  if (error) throw error;
}

// プロフィール更新（氏名・WhatsApp）
export async function updateProfile(fullName: string, whatsapp: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('user_roles')
    .update({ full_name: fullName, whatsapp })
    .eq('id', user.id);

  if (error) throw error;
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user || (await supabase.auth.getUser()).data.user;

    if (!user) return null;

    // サーバーサイドAPI経由でプロフィールを取得（RLSを回避）
    const accessToken = session?.access_token;
    if (accessToken) {
      try {
        const res = await fetch('/api/profile', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.ok) {
          const { profile } = await res.json();
          if (profile) {
            return {
              id: user.id,
              email: user.email!,
              role: profile.role as UserRole,
              fullName: profile.full_name || undefined,
              whatsapp: profile.whatsapp || undefined,
              customerId: profile.customer_id || undefined,
            };
          }
        }
      } catch (apiError) {
        console.warn('Profile API call failed, using fallback:', apiError);
      }
    }

    // フォールバック: メタデータから取得
    const metadata = user.user_metadata || {};
    const isExportAdmin = user.email?.toLowerCase() === 'export@joga.ltd';
    return {
      id: user.id,
      email: user.email!,
      role: isExportAdmin ? 'admin' : ((metadata.role as UserRole) || 'customer'),
      fullName: metadata.full_name || undefined,
      whatsapp: metadata.whatsapp || undefined,
    };
  } catch (error) {
    console.error('Error in getCurrentUser:', error);
    return null;
  }
}


export function onAuthStateChange(callback: (user: User | null) => void) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      const user = await getCurrentUser();
      callback(user);
    } else {
      callback(null);
    }
  });

  return subscription;
}