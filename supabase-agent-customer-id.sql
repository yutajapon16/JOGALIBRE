-- エージェント・顧客ID自動付与スクリプト
-- Supabase SQL Editorで実行してください

-- 1. customer_id カラムの追加（まだ無い場合）
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS customer_id TEXT UNIQUE;

-- 2. シーケンス作成
CREATE SEQUENCE IF NOT EXISTS agent_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS customer_seq START WITH 1;

-- 3. トリガー関数：INSERT時に自動でcustomer_idを付与
CREATE OR REPLACE FUNCTION assign_customer_id()
RETURNS TRIGGER AS $$
BEGIN
  -- 既にcustomer_idが設定されている場合はスキップ
  IF NEW.customer_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'agent' THEN
    NEW.customer_id := 'A' || LPAD(nextval('agent_seq')::TEXT, 3, '0');
  ELSIF NEW.role = 'customer' THEN
    NEW.customer_id := 'C' || LPAD(nextval('customer_seq')::TEXT, 3, '0');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. トリガー設定
DROP TRIGGER IF EXISTS trigger_assign_customer_id ON user_roles;
CREATE TRIGGER trigger_assign_customer_id
  BEFORE INSERT ON user_roles
  FOR EACH ROW
  EXECUTE FUNCTION assign_customer_id();

-- 5. 既存ユーザーへのID割り当て
UPDATE user_roles SET customer_id = 'A001'
WHERE email = 'gusfigue84@gmail.com' AND customer_id IS NULL;

UPDATE user_roles SET customer_id = 'C001'
WHERE email = 'y-fujii@joga.ltd' AND customer_id IS NULL;

-- 6. シーケンスを既存IDの次から開始するようにリセット
-- A001が手動設定済みなので次はA002
SELECT setval('agent_seq', 1);
-- C001が手動設定済みなので次はC002
SELECT setval('customer_seq', 1);
