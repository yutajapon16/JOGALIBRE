import { NextResponse } from 'next/server';
import { notifyAdminError, ErrorUserInfo } from '@/lib/error-notifier';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, stack, url, userAgent, digest, userId, email, customerId, userName } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    let userInfo: ErrorUserInfo | undefined = undefined;

    // ユーザー情報の特定と補完
    if (userId || email) {
      try {
        let query = supabaseAdmin.from('user_roles').select('id, email, customer_id, full_name, role');
        if (userId) {
          query = query.eq('id', userId);
        } else if (email) {
          query = query.ilike('email', email.trim().toLowerCase());
        }

        const { data: userData } = await query.maybeSingle();
        if (userData) {
          userInfo = {
            id: userData.id,
            customerId: userData.customer_id || undefined,
            name: userData.full_name || undefined,
            email: userData.email || undefined,
            role: userData.role || undefined
          };
        }
      } catch (e) {
        console.warn('[ClientError API] Failed to lookup user:', e);
      }
    }

    // フロントエンドから直接送られた情報をフォールバック使用
    if (!userInfo && (customerId || userName || email)) {
      userInfo = {
        customerId,
        name: userName,
        email,
      };
    }

    await notifyAdminError({
      category: 'client',
      title: 'クライアント画面クラッシュ / React エラー検知',
      message: `フロントエンドで予期せぬ例外が発生しました: ${message}`,
      url: url || undefined,
      user: userInfo,
      details: {
        stack: stack || undefined,
        digest: digest || undefined,
        userAgent: userAgent || undefined,
      },
      severity: 'error',
      throttleKey: `client-error:${message.substring(0, 50)}:${userInfo?.customerId || userInfo?.email || 'guest'}`
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[ClientError API] エラー:', err);
    return NextResponse.json({ error: 'Failed to record error' }, { status: 500 });
  }
}

