-- ====================================================================
-- JOGALIBRE 機能追加に伴うデータベーススキーマ変更 SQL
-- このSQLをSupabaseの SQL Editor に貼り付けて実行してください。
-- ====================================================================

-- 1. 利用規約の同意日時を記録するカラムを追加
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 2. 顧客に紐づくエージェントID（エージェントのcustomer_id、例: 'A001'）を記録するカラムを追加
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS agent_customer_id TEXT DEFAULT NULL;

-- 3. 保証金金額を記録するカラムを追加（デフォルト0）
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC DEFAULT 0;

-- 4. 保証金の入金確認日を記録するカラムを追加
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS deposit_confirmed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 5. 在庫番号を保存するカラムを追加
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS stock_number TEXT DEFAULT NULL;

-- 6. 在庫番号検索用のインデックスを作成してパフォーマンスを最適化
CREATE INDEX IF NOT EXISTS idx_bid_requests_stock_number ON bid_requests(stock_number);

-- 7. 管理者設定テーブル（銀行口座、USDTアドレス、QRコードURLなどの動的変更用）を作成
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- 8. 支払い情報の初期データを挿入（口座情報［スペイン語/ポルトガル語多言語対応］・USDTアドレス・PayPalリンク）
INSERT INTO system_settings (key, value) VALUES
('payment_methods', '{
  "bank": {
    "es": {
      "name": "RAKUTEN BANK, LTD.",
      "sucursal": "HEAD OFFICE",
      "swift": "RAKTJPJT",
      "address_bank": "2-16-5 KONAN, MINATO-KU,\nTOKYO, JAPAN",
      "account_number": "252-7951120",
      "account_name": "JOGA INC.",
      "address_joga": "NINOMIYA CUBE 2-A,\n2-17-4 NINOMIYA, TSUKUBA,\nIBARAKI, JAPAN",
      "telefono": "+81-298286721",
      "intermediary_bank": "SUMITOMO MITSUI BANKING CORPORATION, TOKYO, JAPAN",
      "intermediary_swift": "SMBCJPJT"
    },
    "pt": {
      "name": "RAKUTEN BANK, LTD.",
      "sucursal": "HEAD OFFICE",
      "swift": "RAKTJPJT",
      "address_bank": "2-16-5 KONAN, MINATO-KU,\nTOKYO, JAPAN",
      "account_number": "252-7951120",
      "account_name": "JOGA INC.",
      "address_joga": "NINOMIYA CUBE 2-A,\n2-17-4 NINOMIYA, TSUKUBA,\nIBARAKI, JAPAN",
      "telefono": "+81-298286721",
      "intermediary_bank": "SUMITOMO MITSUI BANKING CORPORATION, TOKYO, JAPAN",
      "intermediary_swift": "SMBCJPJT"
    }
  },
  "usdt": {
    "address": "TAgk4wvd5rYQFU9EdwPipBwb7pzUDX52Gc",
    "qr_url": "/images/usdt_qr.png"
  },
  "paypal": {
    "account_email": "export@joga.ltd",
    "link": "https://paypal.me/joga1225",
    "fee_multiplier": 1.08
  }
}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 9. user_roles テーブルの RLS（Row Level Security）ポリシー設定
-- ログイン済みのユーザー自身が、規約同意前であっても自身のロール情報をSELECTできるようにします。
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select for own user_roles" ON user_roles;
CREATE POLICY "Allow select for own user_roles"
ON user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- 10. エージェント情報の SELECT を全認証ユーザーに許可する RLS ポリシー
-- 顧客が自分自身に紐づくエージェントの氏名（full_name）を安全に取得できるようにするためのポリシーです。
DROP POLICY IF EXISTS "Allow select agent profiles for all authenticated users" ON user_roles;
CREATE POLICY "Allow select agent profiles for all authenticated users"
ON user_roles
FOR SELECT
TO authenticated
USING (role = 'agent');

-- 11. 既存の保証金データが未設定（または0）のユーザーに対し、ロールに応じたデフォルト保証金を設定
UPDATE user_roles SET deposit_amount = 1000 WHERE role = 'agent' AND (deposit_amount = 0 OR deposit_amount IS NULL);
UPDATE user_roles SET deposit_amount = 300 WHERE role = 'customer' AND (deposit_amount = 0 OR deposit_amount IS NULL);

-- 12. 入金履歴を管理するテーブルを追加
CREATE TABLE IF NOT EXISTS deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id TEXT NOT NULL,                                       -- 顧客またはエージェントの customer_id (例: C001, A001)
  deposit_date DATE NOT NULL,                                      -- 入金確認日 (カレンダーから選択)
  amount NUMERIC NOT NULL,                                         -- 入金額 (USD)
  payment_method TEXT NOT NULL,                                    -- 入金方法 ('bank', 'paypal', 'usdt')
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- パフォーマンス向上のためのインデックス作成
CREATE INDEX IF NOT EXISTS idx_deposits_customer_id ON deposits(customer_id);
CREATE INDEX IF NOT EXISTS idx_deposits_deposit_date ON deposits(deposit_date);
