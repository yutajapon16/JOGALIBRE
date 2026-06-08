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
    "account_email": "admin@jogalibre.com",
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
UPDATE user_roles SET deposit_amount = 500 WHERE role = 'agent' AND (deposit_amount = 0 OR deposit_amount IS NULL);
UPDATE user_roles SET deposit_amount = 100 WHERE role = 'customer' AND (deposit_amount = 0 OR deposit_amount IS NULL);

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

-- 13. 請求書番号を保存するカラムを追加
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS invoice_number TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_bid_requests_invoice_number ON bid_requests(invoice_number);

-- 14. Storage バケットの自動作成と公開読み取りポリシーの設定
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bid-images', 'bid-images', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- すべてのユーザーが bid-images バケット内の画像を参照できるポリシー
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'bid-images');

-- 認証されたユーザーが bid-images バケットに画像をアップロードできるポリシー
DROP POLICY IF EXISTS "Allow upload for authenticated users" ON storage.objects;
CREATE POLICY "Allow upload for authenticated users" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'bid-images');

-- 15. お気に入りテーブルに終了日時(end_time)カラムを追加
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 16. B001紐づき顧客のためのブラジル国内支払いとパラグアイ現地支払いの分割管理用カラムを追加
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS paid_brazil BOOLEAN DEFAULT FALSE;
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS paid_brazil_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS paid_paraguay BOOLEAN DEFAULT FALSE;
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS paid_paraguay_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_bid_requests_paid_brazil ON bid_requests(paid_brazil);
CREATE INDEX IF NOT EXISTS idx_bid_requests_paid_paraguay ON bid_requests(paid_paraguay);

-- 17. B001紐づき顧客の日本支払（日本送金）管理用カラムを追加
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS paid_japan BOOLEAN DEFAULT FALSE;
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS paid_japan_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_bid_requests_paid_japan ON bid_requests(paid_japan);

-- 18. user_roles テーブルに CPF 保存用カラムを追加
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS cpf TEXT DEFAULT NULL;

-- 19. user_roles テーブルにブラジルの州コード（省略コード）保存用カラムを追加
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS state TEXT DEFAULT NULL;

-- 20. user_roles テーブルに市名保存用カラムを追加
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS city TEXT DEFAULT NULL;



