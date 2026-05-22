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
      "address_bank": "2-16-5 KONAN, MINATO-KU, TOKYO, JAPAN",
      "account_number": "252-7951120",
      "account_name": "JOGA INC.",
      "address_joga": "NINOMIYA CUBE 2A, 2-17-4 NINOMIYA, TSUKUBA, IBARAKI, JAPAN",
      "telefono": "+81-298286721",
      "intermediary_bank": "SUMITOMO MITSUI BANKING CORPORATION, TOKYO, JAPAN",
      "intermediary_swift": "SMBCJPJT"
    },
    "pt": {
      "name": "RAKUTEN BANK, LTD.",
      "sucursal": "HEAD OFFICE",
      "swift": "RAKTJPJT",
      "address_bank": "2-16-5 KONAN, MINATO-KU, TOKYO, JAPAN",
      "account_number": "252-7951120",
      "account_name": "JOGA INC.",
      "address_joga": "NINOMIYA CUBE 2A, 2-17-4 NINOMIYA, TSUKUBA, IBARAKI, JAPAN",
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

