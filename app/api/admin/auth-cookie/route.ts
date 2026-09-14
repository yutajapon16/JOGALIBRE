import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, getUserInfoByEmail } from '@/lib/auth-helpers';
import { createAdminSessionToken, COOKIE_NAME } from '@/lib/admin-auth-cookie';

// 30日間の秒数
const COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60;

/**
 * 管理者セッションCookie発行API
 * POST: 管理者認証が確認できたブラウザに署名付きCookieを付与
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user || !user.email) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const email = user.email.toLowerCase();
    const isAdminEmail = email === (process.env.ADMIN_EMAIL || 'admin@jogalibre.com').toLowerCase();

    let isAdmin = isAdminEmail;
    if (!isAdmin) {
      const userInfo = await getUserInfoByEmail(email);
      isAdmin = userInfo?.role === 'admin';
    }

    if (!isAdmin) {
      return NextResponse.json({ error: '管理者権限がありません' }, { status: 403 });
    }

    const token = await createAdminSessionToken();

    const response = NextResponse.json({ success: true, message: '管理者Cookieを発行しました' });

    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE_SEC,
    });

    return response;
  } catch (error) {
    console.error('Error in POST /api/admin/auth-cookie:', error);
    return NextResponse.json({ error: 'Cookie発行中にエラーが発生しました' }, { status: 500 });
  }
}

/**
 * 管理者セッションCookie削除API
 * DELETE: ログアウト時にCookieを破棄
 */
export async function DELETE() {
  const response = NextResponse.json({ success: true, message: '管理者Cookieを削除しました' });

  response.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
