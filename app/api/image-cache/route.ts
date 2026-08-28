import { NextRequest, NextResponse } from 'next/server';
import { getStorageClient, uploadToGcs, fileExistsInGcs } from '@/lib/gcs';
import { getImageCacheKey } from '@/lib/image-cache';

// 許可するホスト名（SSRF対策）
const ALLOWED_HOSTS = ['yimg.jp', 'yahoo.co.jp', 'afimg.jp'];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  // URLがない場合は400
  if (!imageUrl) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  // ドメイン検証
  try {
    const parsedUrl = new URL(imageUrl);
    const isAllowed = ALLOWED_HOSTS.some(host => parsedUrl.hostname.endsWith(host));
    if (!isAllowed) {
      return NextResponse.redirect(imageUrl, 302);
    }
  } catch {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  const bucketName = process.env.GCS_IMAGE_CACHE_BUCKET_NAME || 'jogalibre-image-cache';
  const cacheKey = getImageCacheKey(imageUrl);

  try {
    const storage = getStorageClient();

    // 1. GCS が設定されている場合、キャッシュを確認
    if (storage) {
      const exists = await fileExistsInGcs(bucketName, cacheKey);
      if (exists) {
        // GCS キャッシュヒット: GCS からストリーム取得して配信
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(cacheKey);
        const [metadata] = await file.getMetadata();
        const [buffer] = await file.download();

        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            'Content-Type': metadata.contentType || 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Cache-Status': 'HIT',
          },
        });
      }
    }

    // 2. キャッシュミス: ヤフオクから画像を取得
    const fetchController = new AbortController();
    const timeout = setTimeout(() => fetchController.abort(), 6000);

    const imageRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://auctions.yahoo.co.jp/',
      },
      signal: fetchController.signal,
    });
    clearTimeout(timeout);

    if (!imageRes.ok) {
      // 取得失敗時は元URLへリダイレクト
      return NextResponse.redirect(imageUrl, 302);
    }

    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    const imageArrayBuffer = await imageRes.arrayBuffer();
    const imageBuffer = Buffer.from(imageArrayBuffer);

    // 3. GCS へ非同期にキャッシュ保存
    if (storage) {
      uploadToGcs(bucketName, cacheKey, imageBuffer, contentType, true).catch(err => {
        console.warn('Background GCS image cache upload failed:', err);
      });
    }

    // クライアントへレスポンス
    return new NextResponse(new Uint8Array(imageArrayBuffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Cache-Status': 'MISS',
      },
    });

  } catch (error) {
    console.warn('Image cache proxy fallback error:', error);
    // 万が一のエラー時は 100% 元URLへ安全にリダイレクト
    return NextResponse.redirect(imageUrl, 302);
  }
}
