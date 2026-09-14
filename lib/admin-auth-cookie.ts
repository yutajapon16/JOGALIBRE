// 管理者セッション検証用ユーティリティ（Edge Runtime / Node.js 双方で動作）

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'joga-admin-secret-salt-2026';
const COOKIE_NAME = 'joga_admin_auth';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30日間有効

export { COOKIE_NAME };

/**
 * Web Crypto API を用いた HMAC-SHA256 署名生成
 */
async function generateHmac(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 管理者セッショントークンを発行
 * 形式: "admin:<タイムスタンプ>:<HMAC署名>"
 */
export async function createAdminSessionToken(): Promise<string> {
  const timestamp = Date.now().toString();
  const payload = `admin:${timestamp}`;
  const signature = await generateHmac(payload);
  return `${payload}:${signature}`;
}

/**
 * 管理者セッショントークンの検証
 * 署名の正当性および有効期限（30日）を判定
 */
export async function verifyAdminSessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;

  const parts = token.split(':');
  if (parts.length !== 3) return false;

  const [role, timestampStr, signature] = parts;
  if (role !== 'admin') return false;

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  // 有効期限の確認（未来すぎない、かつ30日以内）
  const now = Date.now();
  if (now < timestamp - 60000 || now > timestamp + SESSION_MAX_AGE_MS) {
    return false;
  }

  const payload = `${role}:${timestampStr}`;
  const expectedSignature = await generateHmac(payload);

  return signature === expectedSignature;
}
