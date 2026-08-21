-- ====================================================================
-- Foxbit 入出金管理・送金指示用 データベーススキーマ変更 SQL
-- ====================================================================

-- 1. bid_requests テーブルに Foxbit 送金ステータス管理カラムを追加
ALTER TABLE bid_requests 
ADD COLUMN IF NOT EXISTS foxbit_remittance_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS foxbit_remitted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS foxbit_remitted_by TEXT DEFAULT NULL;

-- 2. パフォーマンス向上のためのインデックス作成
CREATE INDEX IF NOT EXISTS idx_bid_requests_foxbit_remittance 
ON bid_requests(final_status, foxbit_remittance_status);

-- 3. system_settings テーブルに Foxbit 設定用のレコードを初期化（存在しない場合）
INSERT INTO system_settings (key, value) VALUES
('foxbit_settings', '{
  "pix_key": "",
  "joga_usdt_address": "TAgk4wvd5rYQFU9EdwPipBwb7pzUDX52Gc"
}') ON CONFLICT (key) DO NOTHING;

-- 4. 過去にすでに完了している古い注文で、今回の送金対象から除外したい場合は以下を実行
-- （必要に応じて過去データを remitted または not_applicable に設定）
-- UPDATE bid_requests 
-- SET foxbit_remittance_status = 'remitted', foxbit_remitted_at = NOW() 
-- WHERE final_status = 'won' AND (paid = true OR paid_brazil = true) AND created_at < '2026-08-01';
