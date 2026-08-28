/**
 * 画像キャッシュ＆最適化ユーティリティ
 * ヤフオク画像を Google Cloud Storage (GCS) の分散キャッシュ経由で高速配信
 */

import crypto from 'crypto';

/**
 * 元の画像URLからキャッシュ用のキー（ファイル名）を生成
 */
export function getImageCacheKey(originalUrl: string): string {
  const hash = crypto.createHash('md5').update(originalUrl).digest('hex');
  // 拡張子の推定
  let ext = 'jpg';
  if (originalUrl.includes('.png')) ext = 'png';
  else if (originalUrl.includes('.webp')) ext = 'webp';
  return `cached-images/${hash.substring(0, 2)}/${hash}.${ext}`;
}

/**
 * ヤフオク画像を最適化キャッシュURLに変換
 * @param originalUrl ヤフオク等のオリジナル画像URL
 * @returns キャッシュプロキシURL（または元URL）
 */
export function getOptimizedImageUrl(originalUrl?: string | null): string {
  if (!originalUrl || typeof originalUrl !== 'string') {
    return '/images/placeholder.png';
  }

  // 既にローカル画像やData URIの場合はそのまま
  if (originalUrl.startsWith('/') || originalUrl.startsWith('data:')) {
    return originalUrl;
  }

  // ヤフオク画像（yimg.jp）の場合、キャッシュプロキシを経由
  if (originalUrl.includes('yimg.jp') || originalUrl.includes('yahoo.co.jp')) {
    return `/api/image-cache?url=${encodeURIComponent(originalUrl)}`;
  }

  return originalUrl;
}
