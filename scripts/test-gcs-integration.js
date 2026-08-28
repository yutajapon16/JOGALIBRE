/**
 * Google Cloud 連携（DBバックアップ & 画像キャッシュ）テストスクリプト
 * 
 * 実行方法:
 *   node scripts/test-gcs-integration.js
 */

require('dotenv').config({ path: '.env.local' });
const { Storage } = require('@google-cloud/storage');

async function testGcs() {
  console.log('--- Google Cloud Storage (GCS) 連携テスト ---');

  const keyJson = process.env.GCP_SERVICE_ACCOUNT_KEY;
  const backupBucket = process.env.GCS_BACKUP_BUCKET_NAME || 'jogalibre-db-backups';
  const imageBucket = process.env.GCS_IMAGE_CACHE_BUCKET_NAME || 'jogalibre-image-cache';

  if (!keyJson) {
    console.error('❌ GCP_SERVICE_ACCOUNT_KEY が .env.local に設定されていません。');
    process.exit(1);
  }

  let credentials;
  try {
    credentials = keyJson.trim().startsWith('{')
      ? JSON.parse(keyJson)
      : JSON.parse(Buffer.from(keyJson, 'base64').toString('utf-8'));
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
    console.log(`✅ サービスアカウントキーを正常に読み込みました: ${credentials.client_email}`);
  } catch (e) {
    console.error('❌ サービスアカウントキーのJSONパースに失敗しました:', e.message);
    process.exit(1);
  }

  const storage = new Storage({
    projectId: credentials.project_id,
    credentials,
  });

  // 1. バックアップバケットのテスト
  console.log(`\n1. バックアップ用バケット [${backupBucket}] の疎通テスト中...`);
  try {
    const testFile = storage.bucket(backupBucket).file('test-connection.txt');
    await testFile.save(`JOGALIBRE connection test: ${new Date().toISOString()}`);
    console.log(`✅ バケット [${backupBucket}] への書き込みに成功しました！`);
    const [downloaded] = await testFile.download();
    console.log(`✅ バケット [${backupBucket}] からの読み出しに成功しました: ${downloaded.toString()}`);
    await testFile.delete();
    console.log(`✅ テストファイルの削除に成功しました。`);
  } catch (err) {
    console.error(`❌ バケット [${backupBucket}] のテスト失敗:`, err.message);
  }

  // 2. 画像キャッシュバケットのテスト
  console.log(`\n2. 画像キャッシュ用バケット [${imageBucket}] の疎通テスト中...`);
  try {
    const testImage = storage.bucket(imageBucket).file('test-image.txt');
    await testImage.save('Image cache test');
    console.log(`✅ バケット [${imageBucket}] への書き込みに成功しました！`);
    await testImage.delete();
    console.log(`✅ テストファイルの削除に成功しました。`);
  } catch (err) {
    console.error(`❌ バケット [${imageBucket}] のテスト失敗:`, err.message);
  }

  console.log('\n--- テスト完了 ---');
}

testGcs().catch(console.error);
