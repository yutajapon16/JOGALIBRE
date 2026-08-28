/**
 * Supabase データベース復旧スクリプト
 * 
 * 使用方法:
 *   node scripts/restore_db_from_backup.js [backup_file_path_in_gcs_or_local]
 * 
 * 例:
 *   node scripts/restore_db_from_backup.js db-backups/2026/08/backup-2026-08-27T23-00-00-000Z.json.gz
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const zlib = require('zlib');
const { createClient } = require('@supabase/supabase-js');
const { Storage } = require('@google-cloud/storage');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.GCS_BACKUP_BUCKET_NAME || 'jogalibre-db-backups';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const targetPath = process.argv[2];
  if (!targetPath) {
    console.log('Usage: node scripts/restore_db_from_backup.js <gcs_path_or_local_file>');
    process.exit(1);
  }

  let jsonData;

  if (fs.existsSync(targetPath)) {
    console.log(`Reading local backup file: ${targetPath}`);
    const fileBuffer = fs.readFileSync(targetPath);
    const uncompressed = targetPath.endsWith('.gz') ? zlib.gunzipSync(fileBuffer) : fileBuffer;
    jsonData = JSON.parse(uncompressed.toString('utf-8'));
  } else {
    console.log(`Downloading backup from GCS: gs://${bucketName}/${targetPath}`);
    const storage = new Storage({
      credentials: JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY || '{}')
    });
    const [fileBuffer] = await storage.bucket(bucketName).file(targetPath).download();
    const uncompressed = targetPath.endsWith('.gz') ? zlib.gunzipSync(fileBuffer) : fileBuffer;
    jsonData = JSON.parse(uncompressed.toString('utf-8'));
  }

  console.log('Backup metadata:', jsonData._metadata);

  const tables = Object.keys(jsonData).filter(k => k !== '_metadata');

  for (const table of tables) {
    const rows = jsonData[table];
    if (!rows || rows.length === 0) {
      console.log(`Table [${table}]: No records to restore.`);
      continue;
    }

    console.log(`Restoring Table [${table}]: ${rows.length} records...`);
    const { error } = await supabase.from(table).upsert(rows);
    if (error) {
      console.error(`Error restoring table [${table}]:`, error.message);
    } else {
      console.log(`Table [${table}] restored successfully.`);
    }
  }

  console.log('Database restore completed.');
}

main().catch(console.error);
