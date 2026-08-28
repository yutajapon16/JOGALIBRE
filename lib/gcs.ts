import { Storage } from '@google-cloud/storage';

let storageInstance: Storage | null = null;

/**
 * Google Cloud Storage クライアントのシングルトンインスタンスを取得
 * 環境変数から柔軟に認証情報を取得（JSON文字列、Base64、個別キーに対応）
 */
export function getStorageClient(): Storage | null {
  if (storageInstance) return storageInstance;

  try {
    // 1. JSON文字列 または Base64 エンコードされたサービスアカウントキー
    if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
      let credentialsJson = process.env.GCP_SERVICE_ACCOUNT_KEY.trim();
      let credentials: any;
      if (credentialsJson.startsWith('{')) {
        credentials = JSON.parse(credentialsJson);
      } else {
        // Base64デコード
        const decoded = Buffer.from(credentialsJson, 'base64').toString('utf-8');
        credentials = JSON.parse(decoded);
      }

      if (credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }

      storageInstance = new Storage({
        projectId: credentials.project_id || process.env.GCP_PROJECT_ID,
        credentials,
      });
      return storageInstance;
    }

    // 2. 個別環境変数（PROJECT_ID, CLIENT_EMAIL, PRIVATE_KEY）
    if (process.env.GCP_PROJECT_ID && process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
      storageInstance = new Storage({
        projectId: process.env.GCP_PROJECT_ID,
        credentials: {
          client_email: process.env.GCP_CLIENT_EMAIL,
          private_key: process.env.GCP_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
      });
      return storageInstance;
    }

    // 3. ローカル開発環境のデフォルト認証情報（ADC）
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      storageInstance = new Storage();
      return storageInstance;
    }

    return null;
  } catch (error) {
    console.error('Failed to initialize Google Cloud Storage client:', error);
    return null;
  }
}

/**
 * GCS バケットへのファイルアップロード
 */
export async function uploadToGcs(
  bucketName: string,
  destinationPath: string,
  buffer: Buffer | string,
  contentType: string = 'application/octet-stream',
  isPublic: boolean = false
): Promise<{ success: boolean; url?: string; publicUrl?: string; error?: string }> {
  try {
    const storage = getStorageClient();
    if (!storage) {
      return { success: false, error: 'Google Cloud Storage credentials are not configured.' };
    }

    const bucket = storage.bucket(bucketName);
    const file = bucket.file(destinationPath);

    const fileBuffer = typeof buffer === 'string' ? Buffer.from(buffer, 'utf-8') : buffer;

    await file.save(fileBuffer, {
      contentType,
      resumable: false,
      metadata: {
        cacheControl: isPublic ? 'public, max-age=31536000, immutable' : 'no-cache',
      },
    });

    if (isPublic) {
      try {
        await file.makePublic();
      } catch {
        // バケット全体が公開（allUsers読み取り）設定の場合は makePublic が不要な場合がある
      }
    }

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${destinationPath}`;

    return {
      success: true,
      url: `gs://${bucketName}/${destinationPath}`,
      publicUrl,
    };
  } catch (error: any) {
    console.error(`Error uploading to GCS (${bucketName}/${destinationPath}):`, error);
    return { success: false, error: error.message || String(error) };
  }
}

/**
 * GCS からファイルが存在するか確認
 */
export async function fileExistsInGcs(bucketName: string, filePath: string): Promise<boolean> {
  try {
    const storage = getStorageClient();
    if (!storage) return false;
    const [exists] = await storage.bucket(bucketName).file(filePath).exists();
    return exists;
  } catch {
    return false;
  }
}

/**
 * GCS バケット内のバックアップ世代管理（指定日数より古いファイルを削除）
 */
export async function rotateBackups(bucketName: string, retentionDays: number = 30): Promise<number> {
  try {
    const storage = getStorageClient();
    if (!storage) return 0;

    const bucket = storage.bucket(bucketName);
    const [files] = await bucket.getFiles({ prefix: 'db-backups/' });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let deletedCount = 0;

    for (const file of files) {
      if (file.metadata.timeCreated) {
        const createdDate = new Date(file.metadata.timeCreated);
        if (createdDate < cutoffDate) {
          await file.delete();
          deletedCount++;
        }
      }
    }

    return deletedCount;
  } catch (error) {
    console.error(`Error rotating backups in ${bucketName}:`, error);
    return 0;
  }
}
