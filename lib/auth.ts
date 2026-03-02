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
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.warn('signOut error (continuing with cleanup):', error);
  }
  // cookieベースセッションの場合、Supabase関連cookieを手動クリア
  if (typeof document !== 'undefined') {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const name = cookie.split('=')[0].trim();
      if (name.startsWith('sb-') || name.includes('supabase')) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    }
  }
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
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const res = await fetch('/api/profile', {
      method: 'POST',
      headers,
      credentials: 'include', // cookieベースでも認証させる
      body: JSON.stringify({ fullName, whatsapp }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('API Error Response:', res.status, errorText);
      throw new Error(`Failed to update profile via API: ${res.status} ${errorText}`);
    }

    // Auth Metadata のローカルキャッシュも更新して不整合を防ぐ
    await supabase.auth.updateUser({
      data: { full_name: fullName, whatsapp: whatsapp }
    });

    return true;
  } catch (error: any) {
    console.error('Error updating profile:', error);
    throw error;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const isExportAdmin = user.email?.toLowerCase() === 'export@joga.ltd';

    // キャッシュの不整合を防ぐため、常にDB(user_roles)から最新情報を取得する
    const { data: roleData, error } = await supabase
      .from('user_roles')
      .select('role, full_name, whatsapp')
      .eq('id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows found"
      console.warn('Could not fetch user_roles from DB, falling back to metadata:', error);
    }

    const metadata = user.user_metadata || {};

    return {
      id: user.id,
      email: user.email!,
      role: isExportAdmin ? 'admin' : (roleData?.role || metadata.role || 'customer'),
      fullName: roleData?.full_name || metadata.full_name || undefined,
      whatsapp: roleData?.whatsapp || metadata.whatsapp || undefined,
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