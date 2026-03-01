import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Next.js Middleware: リクエストごとにSupabaseセッションをリフレッシュ
// cookieにセッショントークンを保持し、期限切れ時に自動更新する
export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    // リクエストにcookieを設定
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    // レスポンスを再作成してcookieを反映
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    // レスポンスにもcookieを設定
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // セッションをリフレッシュ（期限切れのアクセストークンを自動更新）
    // getUser() を使用することで、サーバーサイドでのトークン検証が行われる
    await supabase.auth.getUser();

    return supabaseResponse;
}

// 静的ファイル、画像、favicon を除外
export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    ],
};
