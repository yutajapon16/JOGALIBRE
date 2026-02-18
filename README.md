# JOGALIBRE - Yahoo Auction Proxy Service

ヤフオク代理入札サービス（スペイン語・ポルトガル語対応）

## 🎯 機能

### 顧客機能
- ユーザー登録（氏名・WhatsApp・メール・パスワード）
- Yahoo!オークション商品インポート
- 入札リクエスト送信（最大10件制限）
- カウンターオファー対応（承諾・却下・再カウンター）
- 落札・落札できず確認
- 購入履歴表示
- スペイン語・ポルトガル語切り替え
- WhatsApp通知（管理者への更新通知 - 自動番号正規化機能付き）
- 端末のタイムゾーンに基づく一貫した時刻表示

### 管理者機能
- 入札リクエスト管理
- リクエスト承認・却下・カウンターオファー
- 顧客カウンターオファー対応
- 落札・落札できず設定
- 購入履歴表示（顧客別・期間別フィルター）
- WhatsApp通知（顧客への更新通知 - 自動番号正規化機能付き）
- 自動価格計算（FOB費用込み・利益率20%）
- 落札時の最終確定金額（Precio final）の適正算出ロジック

## 🚀 技術スタック

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Notifications**: Twilio WhatsApp API
- **Deployment**: Vercel
- **UI Design**: Tailwind CSS (Optimized for mobile & compact desktop view)

## 📦 環境変数

### Supabase
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Twilio (WhatsApp通知)
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
ADMIN_WHATSAPP_NUMBER=+817013476721
```

## 🛠️ セットアップ

### 1. リポジトリクローン
```bash
git clone https://github.com/your-username/jogalibre.git
cd jogalibre
```

### 2. 依存関係インストール
```bash
npm install
```

### 3. 環境変数設定
`.env.local` ファイルを作成し、上記の環境変数を設定

### 4. 開発サーバー起動
```bash
npm run dev
```

### 5. ブラウザでアクセス
- 顧客画面: http://localhost:3000
- 管理画面: http://localhost:3000/admin

## 📱 WhatsApp通知設定

### Twilio Sandbox参加手順
1. WhatsAppを開く
2. `+1 415 523 8886` に新規チャット
3. `join [your-sandbox-code]` を送信
4. "You are all set!" と返信が来たら完了

### トライアルアカウントの場合
Twilio Console → Phone Numbers → Verified Caller IDs で受信者番号を認証

## 🗄️ データベース構造

### user_roles テーブル
- id (UUID, Primary Key)
- role (customer | admin)
- full_name (氏名)
- whatsapp (WhatsApp番号)

### bid_requests テーブル
- id (String, Primary Key)
- customer_email (顧客メール)
- product_* (商品情報)
- max_bid (最高入札額)
- status (pending | approved | rejected | counter_offer)
- counter_offer (管理者カウンターオファー)
- customer_counter_offer (顧客カウンターオファー)
- final_status (won | lost)
- customer_confirmed (確認済みフラグ)
- admin_needs_confirm (管理者確認待ちフラグ)

## 🌐 デプロイ

### Vercel
```bash
git push origin main
```
自動的にVercelがデプロイします

### 環境変数の設定
Vercel Dashboard → Settings → Environment Variables で全ての環境変数を設定し、Redeployしてください

## 📝 使い方

### 顧客側
1. アカウント登録（氏名・WhatsApp必須）
2. Yahoo!オークションURLをインポート
3. オファーを送信
4. カウンターオファーに対応
5. 落札後、確認ボタンをクリック
6. 更新完了後、WhatsAppボタンで管理者に通知

### 管理者側
1. リクエストを確認
2. 承認・カウンターオファー・却下のいずれかを選択
3. 落札・落札できずを設定
4. 対応完了後、WhatsAppボタンで顧客に通知

## 🎉 完成日
2025年2月16日

## 📄 ライセンス
Private Project

## 👤 開発者
Yuta