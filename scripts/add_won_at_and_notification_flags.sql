-- プッシュ通知とタイマー用のカラム追加

-- 落札確定日時
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS won_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_bid_requests_won_at ON bid_requests(won_at);

-- 顧客への未確認リマインド通知日時
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS unconfirmed_notified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_bid_requests_unconfirmed_notified_at ON bid_requests(unconfirmed_notified_at);

-- 顧客への未払いリマインド通知日時
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS unpaid_notified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_bid_requests_unpaid_notified_at ON bid_requests(unpaid_notified_at);
