import { supabase } from './supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { User, UserRole } from './types';

export type { User, UserRole };

export async function signUp(
  email: string,
  password: string,
  role: UserRole = 'customer',
  fullName?: string,
  whatsapp?: string,
  address?: string,
  zipCode?: string,
  country?: string,
  agentCustomerId?: string,
  cpf?: string,
  state?: string,
  city?: string
) {
  // 1. フロントエンドで標準 of signUpを実行（これでSupabaseから確実に確認メールが飛ぶ）
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) throw error;
  if (!data.user) throw new Error('User creation failed');

  // 2. サーバーサイドAPIを叩いて、管理者権限(Service Role)でuser_rolesに安全にINSERTする
  // (クライアントサイドから直接INSERTすると、メール未確認状態のためRLSに弾かれてしまう)
  const res = await fetch('/api/save-user-role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      id: data.user.id,
      email, 
      role, 
      fullName, 
      whatsapp,
      address,
      zipCode,
      country,
      agentCustomerId,
      cpf,
      state,
      city
    })
  });
  
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Role saving failed');
  }

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
  // キャッシュクリア
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('joga_user_cache');
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

// プロフィール更新（氏名・WhatsApp・エージェントID）
export async function updateProfile(fullName: string, whatsapp: string, address?: string, zipCode?: string, agentCustomerId?: string, cpf?: string, state?: string, city?: string) {
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
      body: JSON.stringify({ fullName, whatsapp, address, zipCode, agentCustomerId, cpf, state, city }),
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
        data: { full_name: fullName, whatsapp: whatsapp, address: address, zip_code: zipCode, agent_customer_id: agentCustomerId || null, cpf: cpf || null, state: state || null, city: city || null }
      });
      if (updateError) {
        console.warn('Non-fatal error updating local auth metadata:', updateError);
      }
    } catch (e) {
      console.warn('Exception while updating local metadata:', e);
    }

    return true;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    console.error('Error updating profile:', error);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('API Request Timeout');
    }
    throw error;
  }
}

export async function getCurrentUser(alreadyFetchedUser?: SupabaseUser | null): Promise<User | null> {
  // 関数全体（getUser + user_roles取得）が10秒を超えたら強制的にタイムアウトさせる
  const timeoutPromise = new Promise<null>((_, reject) => {
    setTimeout(() => reject(new Error('getCurrentUser overall timeout')), 10000);
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

      const isExportAdmin = user.email?.toLowerCase() === 'admin@jogalibre.com';

      // キャッシュの不整合を防ぐためDB(user_roles)から最新情報を取得する
      const controller = new AbortController();
      const dbTimeoutId = setTimeout(() => controller.abort(), 5000);

      let roleData = null;
      let fetchError = null;

      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role, full_name, whatsapp, customer_id, address, zip_code, country, agent_customer_id, deposit_amount, deposit_confirmed_at, terms_accepted_at, cpf, state, city')
          .eq('id', user.id)
          .abortSignal(controller.signal)
          .single();

        roleData = data;
        fetchError = error;
      } catch (e: unknown) {
        fetchError = e as { code?: string };
      } finally {
        clearTimeout(dbTimeoutId);
      }

      const errObj = fetchError as { code?: string } | null;
      if (errObj && errObj.code !== 'PGRST116') {
        console.warn('Could not fetch user_roles from DB, falling back to metadata:', fetchError);
      }

      // エージェントIDが設定されている場合は、エージェント氏名の取得も試みる
      let agentFullName = undefined;
      if (roleData?.agent_customer_id) {
        try {
          const cleanAgentId = roleData.agent_customer_id.trim().toUpperCase();
          const { data: agentData } = await supabase
            .from('user_roles')
            .select('full_name')
            .eq('customer_id', cleanAgentId)
            .eq('role', 'agent')
            .maybeSingle();
          if (agentData) {
            agentFullName = agentData.full_name;
          }
        } catch (e) {
          console.warn('Could not fetch agent full name due to RLS or other error:', e);
        }
      }

      const metadata = user.user_metadata || {};

      const userData: User = {
        id: user.id,
        email: user.email!,
        role: isExportAdmin ? 'admin' : (roleData?.role || metadata.user_role || metadata.role || 'customer'),
        fullName: roleData?.full_name || metadata.full_name || undefined,
        whatsapp: roleData?.whatsapp || metadata.whatsapp || undefined,
        customerId: roleData?.customer_id || undefined,
        address: roleData?.address || metadata.address || undefined,
        zipCode: roleData?.zip_code || metadata.zip_code || undefined,
        country: roleData?.country || metadata.country || undefined,
        agentCustomerId: roleData?.agent_customer_id || metadata.agent_customer_id || undefined,
        agentFullName: agentFullName || metadata.agent_full_name || undefined,
        depositAmount: roleData?.deposit_amount !== undefined ? Number(roleData.deposit_amount) : (metadata.deposit_amount !== undefined ? Number(metadata.deposit_amount) : undefined),
        depositConfirmedAt: roleData?.deposit_confirmed_at || metadata.deposit_confirmed_at || undefined,
        termsAcceptedAt: roleData?.terms_accepted_at || metadata.terms_accepted_at || undefined,
        cpf: roleData?.cpf || metadata.cpf || undefined,
        state: roleData?.state || metadata.state || undefined,
        city: roleData?.city || metadata.city || undefined,
      };

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('joga_user_cache', JSON.stringify({
          id: userData.id,
          role: userData.role,
          fullName: userData.fullName,
          whatsapp: userData.whatsapp,
          customerId: userData.customerId,
          address: userData.address,
          zipCode: userData.zipCode,
          country: userData.country,
          agentCustomerId: userData.agentCustomerId,
          agentFullName: userData.agentFullName,
          depositAmount: userData.depositAmount,
          depositConfirmedAt: userData.depositConfirmedAt,
          termsAcceptedAt: userData.termsAcceptedAt,
          cpf: userData.cpf,
          state: userData.state,
          city: userData.city,
        }));
      }

      return userData;
    } catch (error) {
      console.error('Error inside fetchUserLogic:', error);
      return null;
    }
  };

  try {
    const result = await Promise.race([fetchUserLogic(), timeoutPromise]);
    
    // 正常に取得できた場合はそれを返す
    if (result) return result as User;

    // 未ログイン（result=null）でも、既にセッションがあるならキャッシュを試す
    if (alreadyFetchedUser && typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem('joga_user_cache');
      if (cached) {
        try {
          const cacheData = JSON.parse(cached);
          if (cacheData.id === alreadyFetchedUser.id) {
             return {
               id: alreadyFetchedUser.id,
               email: alreadyFetchedUser.email!,
               ...cacheData
             };
          }
        } catch (e) {
          console.warn('Failed to parse user cache:', e);
        }
      }
    }
    
    return result as User | null;
  } catch (error) {
    console.error('getCurrentUser timed out or crashed completely:', error);
    
    // タイムアウトや例外時、キャッシュからの復旧を試みる
    if (alreadyFetchedUser && typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem('joga_user_cache');
      if (cached) {
        try {
          const cacheData = JSON.parse(cached);
          if (cacheData.id === alreadyFetchedUser.id) {
            return {
              id: alreadyFetchedUser.id,
              email: alreadyFetchedUser.email!,
              ...cacheData
            };
          }
        } catch (e) {
          console.warn('Failed to parse user cache in error handler:', e);
        }
      }
    }

    // 最終手段として最低限の情報を返す
    if (alreadyFetchedUser) {
      const metadata = alreadyFetchedUser.user_metadata || {};
      return {
        id: alreadyFetchedUser.id,
        email: alreadyFetchedUser.email!,
        role: alreadyFetchedUser.email?.toLowerCase() === 'admin@jogalibre.com' ? 'admin' : (metadata.user_role || metadata.role || 'customer'),
        fullName: metadata.full_name,
        whatsapp: metadata.whatsapp,
        address: metadata.address,
        zipCode: metadata.zip_code,
        country: metadata.country,
        agentCustomerId: metadata.agent_customer_id,
        agentFullName: metadata.agent_full_name,
        depositAmount: metadata.deposit_amount !== undefined ? Number(metadata.deposit_amount) : undefined,
        depositConfirmedAt: metadata.deposit_confirmed_at,
        termsAcceptedAt: metadata.terms_accepted_at,
        cpf: metadata.cpf,
        state: metadata.state,
        city: metadata.city,
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