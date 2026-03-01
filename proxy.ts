import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Next.js 16 proxy: リクエストごとにSupabaseセッションをリフレッシュ
// cookieにセッショントークンを保持し、期限切れ時に自動更新する
export async function proxy(req: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: req.headers,
        },
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return req.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        req.cookies.set(name, value)
                    );
                    response = NextResponse.next({
                        request: {
                            headers: req.headers,
                        },
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // セッションをリフレッシュ（期限切れのアクセストークンを自動更新）
    // getUser() を使用してサーバーサイドでトークン検証を行う
    await supabase.auth.getUser();

    return response;
}

export const config = {
    matcher: [
        /*
         * 次のパスを除くすべてのリクエストパスにマッチします:
         * - _next/static (静的ファイル)
         * - _next/image (画像最適化ファイル)
         * - favicon.ico (ファビコン)
         * - icons/ (アイコンファイル)
         * - 画像拡張子
         */
        '/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    ],
};
