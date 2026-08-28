import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendSystemAlertEmail, SystemAlertEmailOptions } from '@/lib/resend';
import { VAPID_PUBLIC_KEY } from '@/lib/constants';

// Web Push 設定初期化
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
if (VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      'mailto:admin@jogalibre.com',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
  } catch (e) {
    console.warn('[ErrorNotifier] VAPID details initialization warning:', e);
  }
}

/**
 * 日本語文字（ひらがな・カタカナ・漢字）が含まれているか判定するユーティリティ
 */
export function hasJapaneseCharacters(text: string): boolean {
  if (!text) return false;
  // ひらがな (\u3040-\u309F)、カタカナ (\u30A0-\u30FF)、漢字 (\u4E00-\u9FAF)
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

export type ErrorSeverity = 'warning' | 'error' | 'critical';

export type ErrorCategory =
  | 'translation'       // タイトル翻訳
  | 'ai_summary'        // AI要約
  | 'scraping'          // ヤフオクスクレイピング
  | 'payment'           // Asaas等の決済
  | 'exchange_rate'     // 為替レート取得
  | 'cron'              // Cron定期実行
  | 'system'            // サーバーサイド全般
  | 'client';           // フロントエンドクラッシュ

export interface ErrorUserInfo {
  id?: string;
  customerId?: string;
  name?: string;
  email?: string;
  role?: string;
}

export interface NotifyAdminErrorOptions {
  category: ErrorCategory;
  title: string;
  message: string;
  details?: string | Record<string, any>;
  url?: string;
  productId?: string;
  severity?: ErrorSeverity;
  user?: ErrorUserInfo;      // 操作していた顧客・ユーザー情報
  throttleKey?: string;      // 重複抑制用キー（省略時は category + title を使用）
  throttleMinutes?: number;  // クールダウン時間（デフォルト10分）
}

// 直近送信されたエラー通知のメモリキャッシュ（スロットリング・アラートストーム防止）
const alertCooldownMap = new Map<string, { lastSent: number; count: number }>();

/**
 * 管理者（Web Push & メール: admin@jogalibre.com）へシステムエラーを通知
 */
export async function notifyAdminError(options: NotifyAdminErrorOptions): Promise<{ notified: boolean; throttled: boolean }> {
  const {
    category,
    title,
    message,
    details,
    url,
    productId,
    severity = 'error',
    user,
    throttleKey,
    throttleMinutes = 10
  } = options;

  const key = throttleKey || `${category}:${title}:${productId || ''}:${user?.customerId || user?.email || ''}`;
  const now = Date.now();
  const cooldownMs = throttleMinutes * 60 * 1000;
  const existing = alertCooldownMap.get(key);

  if (existing && (now - existing.lastSent < cooldownMs)) {
    existing.count += 1;
    console.warn(`[ErrorNotifier Throttled] ${key} (発生回数: ${existing.count}回目)`);
    return { notified: false, throttled: true };
  }

  // クールダウンキャッシュを更新
  alertCooldownMap.set(key, { lastSent: now, count: 1 });

  const jstTimeString = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const logPrefix = `[ErrorNotifier][${category.toUpperCase()}][${severity.toUpperCase()}]`;
  console.error(`${logPrefix} ${title}: ${message}`, details || '', user ? `[User: ${user.customerId || user.email || 'guest'}]` : '');

  // 顧客情報の要約ラベル（プッシュ通知等で使用）
  let userLabel = '';
  if (user) {
    if (user.customerId && user.name) {
      userLabel = ` (顧客: ${user.customerId} / ${user.name} 様)`;
    } else if (user.customerId) {
      userLabel = ` (顧客: ${user.customerId})`;
    } else if (user.email) {
      userLabel = ` (顧客: ${user.email})`;
    }
  }

  // 1. メール送信（admin@jogalibre.com）
  const emailPromise = (async () => {
    try {
      const emailOpts: SystemAlertEmailOptions = {
        to: 'admin@jogalibre.com',
        type: category,
        title,
        message,
        details,
        url: url || (productId ? `https://page.auctions.yahoo.co.jp/auction/${productId}` : undefined),
        timestamp: jstTimeString,
        severity,
        user: user ? {
          customerId: user.customerId,
          name: user.name,
          email: user.email,
          role: user.role
        } : undefined
      };
      await sendSystemAlertEmail(emailOpts);
    } catch (err) {
      console.error('[ErrorNotifier] Failed to send alert email:', err);
    }
  })();

  // 2. 管理者への Web Push 通知 & アプリ内通知保存
  const pushPromise = (async () => {
    try {
      // role = 'admin' の管理者ユーザーを取得
      const { data: adminUsers, error: adminErr } = await supabaseAdmin
        .from('user_roles')
        .select('id, email')
        .eq('role', 'admin');

      if (adminErr || !adminUsers || adminUsers.length === 0) {
        return;
      }

      const adminUserIds = adminUsers.map(u => u.id);

      const notificationTitle = `⚠️ [エラー検知] ${title}${userLabel}`;
      const notificationBody = message.length > 120 ? message.substring(0, 117) + '...' : message;

      // アプリ内通知テーブルに記録
      try {
        const notifications = adminUserIds.map(uid => ({
          user_id: uid,
          title: notificationTitle,
          body: notificationBody,
          url: url || '/admin',
          is_read: false
        }));

        await supabaseAdmin.from('app_notifications').insert(notifications);
      } catch (dbErr) {
        console.error('[ErrorNotifier] DB app_notifications insert error:', dbErr);
      }

      // Web Push 送信
      if (VAPID_PRIVATE_KEY) {
        const { data: subs } = await supabaseAdmin
          .from('push_subscriptions')
          .select('id, user_id, subscription')
          .in('user_id', adminUserIds);

        if (subs && subs.length > 0) {
          const pushPayload = JSON.stringify({
            title: `⚠️ [システム警告] ${title}`,
            body: `${notificationBody}${userLabel}`,
            icon: '/icons/logo-mark.png',
            url: url || '/admin'
          });

          await Promise.allSettled(
            subs.map(async (sub) => {
              try {
                const subObj = JSON.parse(sub.subscription);
                await webpush.sendNotification(subObj, pushPayload);
              } catch (subErr: any) {
                if (subErr?.statusCode === 410 || subErr?.statusCode === 404) {
                  if (sub.id) {
                    await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
                  } else {
                    await supabaseAdmin.from('push_subscriptions').delete().eq('subscription', sub.subscription);
                  }
                }
              }
            })
          );
        }
      }
    } catch (pushErr) {
      console.error('[ErrorNotifier] Failed to send push notification:', pushErr);
    }
  })();

  // バックグラウンドで両方の通知を実行（リクエストを極力ブロックしない）
  await Promise.allSettled([emailPromise, pushPromise]);

  return { notified: true, throttled: false };
}

