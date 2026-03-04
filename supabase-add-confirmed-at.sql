-- bid_requestsテーブルに customer_confirmed_at カラムを追加
-- 顧客が「確認」ボタンを押した日時を記録するためのカラム
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS customer_confirmed_at TIMESTAMPTZ;

-- 既存の確認済みレコード（customer_confirmed = true）に対して、
-- created_atを初期値として設定する（過去データの互換性のため）
UPDATE bid_requests
SET customer_confirmed_at = created_at
WHERE customer_confirmed = true AND customer_confirmed_at IS NULL;
