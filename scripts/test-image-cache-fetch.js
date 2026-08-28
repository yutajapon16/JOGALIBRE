/**
 * 画像キャッシュ動作テストスクリプト
 */
require('dotenv').config({ path: '.env.local' });
const { Storage } = require('@google-cloud/storage');
const crypto = require('crypto');

const bucketName = process.env.GCS_IMAGE_CACHE_BUCKET_NAME || 'jogalibre-image-cache';
const sampleYahooImageUrl = 'https://auctions.c.yimg.jp/images.auctions.yahoo.co.jp/users/2/1/7/8/jogainc-img1200x900-1698292839abc.jpg';

function getImageCacheKey(originalUrl) {
  const hash = crypto.createHash('md5').update(originalUrl).digest('hex');
  return `cached-images/${hash.substring(0, 2)}/${hash}.jpg`;
}

async function testImageCache() {
  console.log('🖼️ 画像キャッシュ機能のテストを開始します...');

  const keyJson = process.env.GCP_SERVICE_ACCOUNT_KEY;
  const credentials = JSON.parse(keyJson);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  const storage = new Storage({
    projectId: credentials.project_id,
    credentials,
  });

  const cacheKey = getImageCacheKey(sampleYahooImageUrl);
  console.log(`- キャッシュキー: ${cacheKey}`);

  // ダミー画像データ（テスト用）
  const testBuffer = Buffer.from('test-image-binary-data');

  console.log(`- GCS バケット [${bucketName}] へキャッシュ保存中...`);
  const file = storage.bucket(bucketName).file(cacheKey);
  await file.save(testBuffer, {
    contentType: 'image/jpeg',
    metadata: {
      cacheControl: 'public, max-age=31536000, immutable'
    }
  });

  console.log(`✅ GCS への画像キャッシュ保存に成功しました！`);

  // キャッシュの存在確認
  const [exists] = await file.exists();
  console.log(`✅ キャッシュ存在確認: ${exists ? 'HIT (存在)' : 'MISS'}`);

  // キャッシュの削除（テストクリーンアップ）
  await file.delete();
  console.log(`✅ テスト用キャッシュの削除完了。`);
}

testImageCache().catch(console.error);
