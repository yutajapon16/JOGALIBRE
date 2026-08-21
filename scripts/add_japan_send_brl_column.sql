-- 1. bid_requests テーブルに決済時に確定した日本支払額(BRL)および実効レートを保存するカラムを追加
ALTER TABLE bid_requests 
ADD COLUMN IF NOT EXISTS japan_send_brl NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS paid_effective_rate NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS paid_customer_brl NUMERIC DEFAULT NULL;

-- 2. 過去の決済完了済み注文で japan_send_brl が未設定のものに概算値を補完
UPDATE bid_requests
SET japan_send_brl = CEIL((COALESCE(japan_send_usd, 0) * 5.20) / 10) * 10
WHERE (paid = true OR paid_brazil = true) 
  AND japan_send_usd IS NOT NULL 
  AND japan_send_brl IS NULL;
