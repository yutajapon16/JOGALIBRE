import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { uploadToGcs, rotateBackups } from '@/lib/gcs';
import { notifyAdminError } from '@/lib/error-notifier';
import zlib from 'zlib';

// バックアップ対象テーブル一覧
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

export async function GET(request: Request) {
  // 1. Vercel Cron 認証チェック
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.warn('Unauthorized cron backup attempt');
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const bucketName = process.env.GCS_BACKUP_BUCKET_NAME || 'jogalibre-db-backups';

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupData: Record<string, any[]> = {
      _metadata: [{
        createdAt: new Date().toISOString(),
        version: '1.0',
        tablesCount: BACKUP_TABLES.length
      }]
    };

    let totalRecords = 0;

    // 2. 全テーブルのデータを並列抽出
    for (const table of BACKUP_TABLES) {
      try {
        const { data, error } = await supabaseAdmin.from(table).select('*');
        if (error) {
          console.warn(`Table [${table}] backup query error:`, error.message);
          backupData[table] = [];
        } else {
          backupData[table] = data || [];
          totalRecords += (data || []).length;
        }
      } catch (err: any) {
        console.warn(`Exception reading table [${table}]:`, err.message);
        backupData[table] = [];
      }
    }

    // 3. JSON文字列化 & gzip 圧縮
    const jsonString = JSON.stringify(backupData, null, 2);
    const compressedBuffer = zlib.gzipSync(Buffer.from(jsonString, 'utf-8'));

    const destinationPath = `db-backups/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/backup-${timestamp}.json.gz`;

    // 4. Google Cloud Storage へアップロード（非公開）
    const uploadResult = await uploadToGcs(
      bucketName,
      destinationPath,
      compressedBuffer,
      'application/gzip',
      false // 非公開
    );

    if (!uploadResult.success) {
      throw new Error(`GCS upload failed: ${uploadResult.error}`);
    }

    // 5. 30日以上前のバックアップを自動ローテーション削除
    const deletedCount = await rotateBackups(bucketName, 30);

    return NextResponse.json({
      success: true,
      message: 'Database backup completed successfully',
      destination: uploadResult.url,
      totalRecords,
      fileSizeBytes: compressedBuffer.length,
      rotatedOldFiles: deletedCount,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Database backup cron error:', error);

    // 管理者へ緊急エラー通知
    notifyAdminError({
      category: 'cron',
      title: 'Supabase DB 自動バックアップ失敗',
      message: `Google Cloud Storage へのDBバックアップ処理中にエラーが発生しました: ${error.message || 'Unknown error'}`,
      details: {
        bucketName,
        error: error.stack || String(error),
      },
      severity: 'critical',
      throttleKey: 'cron-db-backup-failure',
    }).catch(e => console.error('Failed to send backup error alert:', e));

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
