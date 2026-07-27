-- 1. deposits テーブルに receipt_url カラムを追加
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS receipt_url TEXT DEFAULT NULL;

-- 2. receipts バケットを作成 (Storage)
-- 注: 既に作成されている場合はエラーになりますが無視して構いません
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- 3. receipts バケットへのアクセス権限（ポリシー）を設定
-- 一般公開の読み取りアクセスを許可
CREATE POLICY "Public Access for receipts" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'receipts');

-- 認証済みユーザーまたはサービスロール（API）からのアップロードを許可
CREATE POLICY "Allow uploads to receipts" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'receipts');
