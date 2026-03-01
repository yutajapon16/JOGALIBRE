import { createBrowserClient } from '@supabase/ssr';

// クライアントサイド用Supabaseクライアント
// @supabase/ssr を使用してcookieベースのセッション管理に対応
export const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);