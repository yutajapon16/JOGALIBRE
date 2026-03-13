import { supabase } from './supabase';

export type UserRole = 'customer' | 'admin' | 'agent';

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
      email: email,
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒でタイムアウト

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
      signal: controller.signal,
      body: JSON.stringify({ fullName, whatsapp }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      console.error('API Error Response:', res.status, errorText);
      throw new Error(`Failed to update profile via API: ${res.status} ${errorText}`);
    }

    // Auth Metadata のローカルキャッシュ更新（エラーが起きても全体処理は止めない）
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        data: { full_name: fullName, whatsapp: whatsapp }
      });
      if (updateError) {
        console.warn('Non-fatal error updating local auth metadata:', updateError);
      }
    } catch (e) {
      console.warn('Exception while updating local metadata:', e);
    }

    return true;
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('Error updating profile:', error);
    if (error.name === 'AbortError') {
      throw new Error('API Request Timeout');
    }
    throw error;
  }
}

export async function getCurrentUser(alreadyFetchedUser?: any): Promise<User | null> {
  // 関数全体（getUser + user_roles取得）が3秒を超えたら強制的にタイムアウトさせる
  const timeoutPromise = new Promise<null>((_, reject) => {
    setTimeout(() => reject(new Error('getCurrentUser overall timeout')), 3000);
  });

  const fetchUserLogic = async () => {
    try {
      let user = alreadyFetchedUser;

      if (!user) {
        // getUserはネットワークリクエストを伴うためハングのリスクがある
        const { data } = await supabase.auth.getUser();
        user = data?.user;
      }
      if (!user) return null;

      const isExportAdmin = user.email?.toLowerCase() === 'export@joga.ltd';

      // キャッシュの不整合を防ぐためDB(user_roles)から最新情報を取得する
      const controller = new AbortController();
      const dbTimeoutId = setTimeout(() => controller.abort(), 2000);

      let roleData = null;
      let fetchError = null;

      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role, full_name, whatsapp, customer_id')
          .eq('id', user.id)
          .abortSignal(controller.signal)
          .single();

        roleData = data;
        fetchError = error;
      } catch (e: any) {
        fetchError = e;
      } finally {
        clearTimeout(dbTimeoutId);
      }

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.warn('Could not fetch user_roles from DB, falling back to metadata:', fetchError);
      }

      const metadata = user.user_metadata || {};

      return {
        id: user.id,
        email: user.email!,
        role: isExportAdmin ? 'admin' : (roleData?.role || metadata.role || 'customer'),
        fullName: roleData?.full_name || metadata.full_name || undefined,
        whatsapp: roleData?.whatsapp || metadata.whatsapp || undefined,
        customerId: roleData?.customer_id || undefined,
      };
    } catch (error) {
      console.error('Error inside fetchUserLogic:', error);
      return null;
    }
  };

  try {
    const result = await Promise.race([fetchUserLogic(), timeoutPromise]);
    return result as User | null;
  } catch (error) {
    console.error('getCurrentUser timed out or crashed completely:', error);
    // タイムアウトした場合は、既に取得済みの`alreadyFetchedUser`があれば、最低限の情報を返す
    if (alreadyFetchedUser) {
      const metadata = alreadyFetchedUser.user_metadata || {};
      return {
        id: alreadyFetchedUser.id,
        email: alreadyFetchedUser.email!,
        role: alreadyFetchedUser.email?.toLowerCase() === 'export@joga.ltd' ? 'admin' : (metadata.role || 'customer'),
        fullName: metadata.full_name,
        whatsapp: metadata.whatsapp
      };
    }
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