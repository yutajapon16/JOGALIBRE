-- ASAAS Webhookイベントログテーブル
-- 冪等性の確保（同一イベントの重複処理防止）とイベント監査に使用
CREATE TABLE IF NOT EXISTS asaas_webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id TEXT NOT NULL,
  event TEXT NOT NULL,
  status TEXT,
  value NUMERIC(12, 2),
  billing_type TEXT,
  external_reference TEXT,
  raw_payload JSONB,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- 同一payment_id + eventの組み合わせを一意にすることで冪等性を保証
  UNIQUE(payment_id, event)
);

-- 検索パフォーマンス向上のためのインデックス
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_logs_payment_id ON asaas_webhook_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_logs_event ON asaas_webhook_logs(event);
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_logs_external_reference ON asaas_webhook_logs(external_reference);
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_logs_created_at ON asaas_webhook_logs(created_at);

-- RLSポリシー（サービスロールキーのみアクセス可能）
ALTER TABLE asaas_webhook_logs ENABLE ROW LEVEL SECURITY;

-- サービスロールは全操作可能
CREATE POLICY "service_role_full_access" ON asaas_webhook_logs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
