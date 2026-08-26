import { NextResponse } from 'next/server';
import { notifyAdminError } from '@/lib/error-notifier';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, stack, url, userAgent, digest } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    await notifyAdminError({
      category: 'client',
      title: 'クライアント画面クラッシュ / React エラー検知',
      message: `フロントエンドで予期せぬ例外が発生しました: ${message}`,
      url: url || undefined,
      details: {
        stack: stack || undefined,
        digest: digest || undefined,
        userAgent: userAgent || undefined,
      },
      severity: 'error',
      throttleKey: `client-error:${message.substring(0, 50)}`
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[ClientError API] エラー:', err);
    return NextResponse.json({ error: 'Failed to record error' }, { status: 500 });
  }
}
