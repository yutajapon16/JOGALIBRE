import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
    const res = NextResponse.next();
    const supabase = createMiddlewareClient({ req, res });

    // セッションを検証・リフレッシュ
    // これにより、API呼び出し時にサーバー側で最新のセッションが取得可能になる
    await supabase.auth.getSession();

    return res;
}

export const config = {
    matcher: [
        /*
         * 次のパスを除くすべてのリクエストパスにマッチします:
         * - _next/static (静的ファイル)
         * - _next/image (画像最適化ファイル)
         * - favicon.ico (ファビコン)
         * - public (パブリックフォルダ内の静的資産)
         */
        '/((?!_next/static|_next/image|favicon.ico|public/).*)',
    ],
};
