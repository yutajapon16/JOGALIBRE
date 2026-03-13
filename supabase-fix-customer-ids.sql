-- 修正版：既存ユーザーへのID割り当て
-- signUp()がuser_rolesにemailを保存しないため、auth.usersテーブルからUUIDを参照して更新する

-- gusfigue84@gmail.com → A001
UPDATE user_roles
SET customer_id = 'A001'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'gusfigue84@gmail.com' LIMIT 1
)
AND (customer_id IS NULL OR customer_id != 'A001');

-- y-fujii@joga.ltd → C001
UPDATE user_roles
SET customer_id = 'C001'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'y-fujii@joga.ltd' LIMIT 1
)
AND (customer_id IS NULL OR customer_id != 'C001');

-- 確認クエリ
SELECT ur.id, au.email, ur.role, ur.customer_id, ur.full_name
FROM user_roles ur
JOIN auth.users au ON ur.id = au.id
ORDER BY ur.customer_id;
