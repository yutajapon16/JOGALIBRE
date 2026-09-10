'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { signIn as apiSignIn, signOut as apiSignOut, getCurrentUser, type User } from '@/lib/auth';

interface AuthContextType {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  isAuthChecking: boolean;
  login: (email: string, password: string) => Promise<User | null>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ローカルストレージから同期的にキャッシュを読み出す関数（0ms復元）
const readUserCacheFromStorage = (): User | null => {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem('jogalibre_user_cache') || localStorage.getItem('joga_user_cache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.id && typeof parsed === 'object') {
        return {
          id: parsed.id,
          email: parsed.email || '',
          role: parsed.role || 'customer',
          fullName: parsed.fullName,
          whatsapp: parsed.whatsapp,
          customerId: parsed.customerId,
          address: parsed.address,
          zipCode: parsed.zipCode,
          country: parsed.country || '',
          agentCustomerId: parsed.agentCustomerId,
          agentFullName: parsed.agentFullName,
          depositAmount: parsed.depositAmount,
          depositConfirmedAt: parsed.depositConfirmedAt,
          termsAcceptedAt: parsed.termsAcceptedAt,
          cpf: parsed.cpf,
          state: parsed.state,
          city: parsed.city,
          language: parsed.language || 'es'
        } as User;
      }
    }
  } catch (e) {
    console.warn('Failed to read user cache from storage:', e);
  }
  return null;
};

// ローカルストレージにユーザーキャッシュを書き込む関数
const writeUserCacheToStorage = (user: User | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (user) {
      localStorage.setItem('jogalibre_user_cache', JSON.stringify({
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        whatsapp: user.whatsapp,
        customerId: user.customerId,
        address: user.address,
        zipCode: user.zipCode,
        country: user.country,
        agentCustomerId: user.agentCustomerId,
        agentFullName: user.agentFullName,
        depositAmount: user.depositAmount,
        depositConfirmedAt: user.depositConfirmedAt,
        termsAcceptedAt: user.termsAcceptedAt,
        cpf: user.cpf,
        state: user.state,
        city: user.city,
        language: user.language
      }));
    } else {
      localStorage.removeItem('jogalibre_user_cache');
      localStorage.removeItem('joga_user_cache');
    }
  } catch (e) {
    console.warn('Failed to write user cache to storage:', e);
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 起動時にローカルストレージから同期的に即時ロード（0ms表示）
  const [user, setUserState] = useState<User | null>(() => readUserCacheFromStorage());
  // 初期キャッシュがある場合はチェック中画面を一瞬も挟まない（初期値 false）
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(() => !readUserCacheFromStorage());

  // ユーザー状態更新ラッパー（メモリ更新＋LocalStorage即時同期）
  const setUser = useCallback((userOrUpdater: React.SetStateAction<User | null>) => {
    setUserState(prev => {
      const nextUser = typeof userOrUpdater === 'function' ? userOrUpdater(prev) : userOrUpdater;
      writeUserCacheToStorage(nextUser);
      return nextUser;
    });
  }, []);

  // 最新ユーザー情報のバックグラウンド取得・同期関数
  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const freshUser = await getCurrentUser();
      if (freshUser) {
        setUser(freshUser);
        return freshUser;
      }
    } catch (err) {
      console.warn('refreshUser warning:', err);
    }
    return null;
  }, [setUser]);

  // 高速ログイン処理（待機スリープなしで即座にユーザー情報を設定・表示）
  const login = useCallback(async (email: string, password: string): Promise<User | null> => {
    setIsAuthChecking(true);
    try {
      const authResult = await apiSignIn(email, password);
      const authUser = authResult?.user;
      
      if (!authUser) {
        throw new Error('No user returned from signIn');
      }

      // 500msの人工待機を挟まず、即座にユーザー詳細（顧客ID/氏名/ロール等）を取得
      const fullUser = await getCurrentUser(authUser);
      if (fullUser) {
        setUser(fullUser);
        setIsAuthChecking(false);
        return fullUser;
      } else {
        // 万が一DBクエリに時間がかかる場合でも最低限の情報を即座にセットして画面を起動
        const fallbackUser: User = {
          id: authUser.id,
          email: authUser.email || email,
          role: (authUser.user_metadata?.role as any) || 'customer',
          fullName: authUser.user_metadata?.full_name || authUser.user_metadata?.name || '',
          customerId: authUser.user_metadata?.customer_id,
          language: authUser.user_metadata?.language || 'es'
        };
        setUser(fallbackUser);
        setIsAuthChecking(false);
        // バックグラウンドで完全なユーザー情報を取得・補完
        refreshUser().catch(() => {});
        return fallbackUser;
      }
    } catch (error) {
      setIsAuthChecking(false);
      throw error;
    }
  }, [setUser, refreshUser]);

  // 高速ログアウト処理
  const logout = useCallback(async () => {
    setUser(null);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('jogalibre_my_requests_cache');
      localStorage.removeItem('jogalibre_purchased_items_cache');
      localStorage.removeItem('jogalibre_search_nav_state');
    }
    await apiSignOut();
  }, [setUser]);

  // マウント時のセッション初期検証およびリアルタイム変更監視
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const loadedUser = await getCurrentUser(session.user);
          if (isMounted && loadedUser) {
            setUser(loadedUser);
          }
        } else {
          // セッションが存在しない場合のみユーザーをnullに設定
          if (isMounted && !readUserCacheFromStorage()) {
            setUser(null);
          }
        }
      } catch (e) {
        console.warn('Initial session validation error:', e);
      } finally {
        if (isMounted) {
          setIsAuthChecking(false);
        }
      }
    };

    initAuth();

    // Supabase Auth のセッション変更イベント監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsAuthChecking(false);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session?.user) {
          const freshUser = await getCurrentUser(session.user);
          if (isMounted && freshUser) {
            setUser(freshUser);
          }
        }
        setIsAuthChecking(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [setUser]);

  return (
    <AuthContext.Provider value={{ user, setUser, isAuthChecking, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
