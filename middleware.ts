import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSessionToken, COOKIE_NAME } from '@/lib/admin-auth-cookie';

// 403 Forbidden（シンプルなアクセス拒否画面）
const FORBIDDEN_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>403 Forbidden</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      background-color: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 36px 28px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
    }
    .icon {
      font-size: 42px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 12px 0;
      color: #ef4444;
      letter-spacing: 0.5px;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
      color: #94a3b8;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🚫</div>
    <h1>403 Forbidden</h1>
    <p>Access from your country or region is restricted.<br>この地域からのアクセスは制限されています。</p>
  </div>
</body>
</html>`;

/**
 * 国別アクセス制限（Geo-Blocking）Middleware
 * 
 * 仕様:
 * 1. 静的アセット、画像、CSS、JSなどは常に許可
 * 2. 外部連携・決済API・Cron（/api/）は常に許可
 * 3. 管理画面（/admin）は日本からも常にアクセス可能（ログインのため）
 * 4. 日本（JP）からのアクセスの場合:
 *    - 管理者セッションCookie（joga_admin_auth）を保持していれば全ページアクセス許可
 *    - それ以外は403 Forbiddenで遮断（/agent含む）
 * 5. 日本以外からのアクセスは通常通り許可
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. 外部連携・決済API・内部通信は常に許可
  if (pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // 2. 静的ファイル、Next.js内部通信、メタデータファイルは常に許可
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/images') ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon.png' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/manifest.json' ||
    pathname === '/manifest-admin.json' ||
    pathname === '/sw.js' ||
    /\.(png|jpg|jpeg|svg|webp|ico|gif|css|js|woff|woff2|ttf|eot)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  // 3. 管理画面（/admin）は日本からも常に許可（管理者がログインできるようにするため）
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return NextResponse.next();
  }

  // 4. アクセス元の国コードを取得（VercelのGeo-IPヘッダー）
  const countryHeader =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    ((request as unknown as { geo?: { country?: string } }).geo?.country);
  const country = countryHeader?.toUpperCase();

  // 日本（JP）からのアクセスの判定
  if (country === 'JP') {
    // 管理者セッションCookieの確認
    const adminCookie = request.cookies.get(COOKIE_NAME)?.value;
    const isValidAdmin = await verifyAdminSessionToken(adminCookie);

    if (isValidAdmin) {
      // 管理者としてログイン済みの場合は全ページ閲覧・操作を許可
      return NextResponse.next();
    }

    // 未ログインの日本からのアクセスは403で遮断
    return new NextResponse(FORBIDDEN_HTML, {
      status: 403,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  }

  // 日本以外からのアクセスは通常通り許可
  return NextResponse.next();
}

// 静的ファイルを効率的にスキップするmatcher設定
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
