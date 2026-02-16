import { supabase } from './supabase';

export type UserRole = 'admin' | 'customer';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  fullName?: string;
  whatsapp?: string;
}

// サインアップ
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

  // ロールとユーザー情報を設定
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

// ログイン
export async function signIn(email: string, password: string) {
  console.log('=== SIGNIN DEBUG ===');
  console.log('Email:', email);
  console.log('Password length:', password.length);
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  console.log('SignIn result:', { data, error });

  if (error) {
    console.error('SignIn error details:', error);
    throw error;
  }
  return data;
}

// ログアウト
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// 現在のユーザー情報とロールを取得
export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return null;

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role, full_name, whatsapp')
    .eq('id', user.id)
    .single();

  if (!roleData) return null;

  return {
    id: user.id,
    email: user.email!,
    role: roleData.role as UserRole,
    fullName: roleData.full_name || undefined,
    whatsapp: roleData.whatsapp || undefined,
  };
}

// セッション監視
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