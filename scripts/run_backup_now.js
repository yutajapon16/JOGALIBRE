/**
 * 即時バックアップ実行テストスクリプト
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { Storage } = require('@google-cloud/storage');
const zlib = require('zlib');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.GCS_BACKUP_BUCKET_NAME || 'jogalibre-db-backups';

const supabase = createClient(supabaseUrl, supabaseKey);

const BACKUP_TABLES = [
  'user_roles',
  'bid_requests',
  'deposits',
  'receipts',
  'shipping_containers',
  'system_settings',
  'favorites',
  'app_notifications',
  'push_subscriptions',
  'asaas_webhook_logs',
];

async function runBackup() {
  console.log('🚀 Supabase データベースのバックアップを開始します...');

  const keyJson = process.env.GCP_SERVICE_ACCOUNT_KEY;
  const credentials = JSON.parse(keyJson);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  const storage = new Storage({
    projectId: credentials.project_id,
    credentials,
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupData = {
    _metadata: [{
      createdAt: new Date().toISOString(),
      version: '1.0',
      tablesCount: BACKUP_TABLES.length
    }]
  };

  let totalRecords = 0;

  for (const table of BACKUP_TABLES) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.warn(`Table [${table}] query error:`, error.message);
      backupData[table] = [];
    } else {
      backupData[table] = data || [];
      totalRecords += (data || []).length;
      console.log(`- テーブル [${table}]: ${data?.length || 0} 件取得`);
    }
  }

  const jsonString = JSON.stringify(backupData, null, 2);
  const compressedBuffer = zlib.gzipSync(Buffer.from(jsonString, 'utf-8'));

  const destinationPath = `db-backups/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/backup-${timestamp}.json.gz`;

  console.log(`📦 GCS へアップロード中 (容量: ${Math.round(compressedBuffer.length / 1024)} KB)...`);
  const file = storage.bucket(bucketName).file(destinationPath);
  await file.save(compressedBuffer, {
    contentType: 'application/gzip',
    resumable: false,
  });

  console.log(`✅ バックアップが正常に保存されました！`);
  console.log(`📍 GCS パス: gs://${bucketName}/${destinationPath}`);
  console.log(`📊 合計レコード数: ${totalRecords} 件`);
}

runBackup().catch(console.error);
