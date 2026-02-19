# JOGALIBRE - Yahoo Auction Proxy Service

ヤフオク代理入札サービス（スペイン語・ポルトガル語対応）

## 🎯 機能

### 顧客機能
- ユーザー登録（氏名・WhatsApp・メール・パスワード）
- Yahoo!オークション商品インポート（URLから自動取得）
- 入札リクエスト送信（最大10件制限）
- カウンターオファー対応（承諾・却下・再カウンター）
- 落札・落札できず確認
- 購入履歴表示（顧客別・期間別フィルター）
- スペイン語・ポルトガル語切り替え（ボタン文言含む完全対応）
- WhatsApp通知（管理者への更新通知 - 自動番号正規化機能付き）
- 端末のタイムゾーンに基づく一貫した時刻表示
- セッション永続化（スマホリロード時もログイン状態を維持）

### 管理者機能
- 入札リクエスト管理
- リクエスト承認・却下・カウンターオファー
- 顧客カウンターオファー対応
- 落札・落札できず設定
- 購入履歴表示（顧客別・期間別フィルター、画像内テキスト収まり最適化）
- 支払いステータス管理（支払い済み/未払いの切り替え）
- WhatsApp通知（顧客への更新通知 - スペイン語・ポルトガル語併記）
- 自動価格計算（FOB費用込み・利益率20%）
- 落札時の最終確定金額（Precio final）の適正算出ロジック
- セッション永続化（スマホリロード時もログイン状態を維持）

## 🚀 技術スタック

- **Frontend**: Next.js 16 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth（ハイブリッド認証: Cookie + Bearer Token）
- **Notifications**: Twilio WhatsApp API（Sandbox対応、エラー検知付き）
- **Deployment**: Vercel（自動デプロイ）
- **UI Design**: Tailwind CSS（モバイル最適化）

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
git clone https://github.com/yutajapon16/JOGALIBRE.git
cd JOGALIBRE
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

### Twilio Sandbox について
現在は Twilio Sandbox（テスト環境）を使用しています。Sandbox では以下の制約があります：

- **24時間ウィンドウ**: 受信者が最後にメッセージを送ってから24時間以内のみ送信可能
- **オプトイン必須**: 全ての受信者がSandboxに参加する必要あり
- **エラー検知**: 24時間ウィンドウ超過時は自動でエラーメッセージと再オプトイン手順を表示

### Sandbox 参加手順
1. WhatsAppを開く
2. `+1 415 523 8886` に新規チャット
3. `join [your-sandbox-code]` を送信
4. "You are all set!" と返信が来たら完了

### 24時間ウィンドウが切れた場合
上記の手順で再度メッセージを送信すれば、ウィンドウが再開されます。
アプリは自動でエラーを検知し、画面上で再オプトイン手順を案内します。

### 通知メッセージの言語
| 送信方向 | 言語 |
|---|---|
| 顧客 → 管理者 | 日本語 |
| 管理者 → 顧客 | スペイン語・ポルトガル語併記 |

### 将来的な改善（オプション）
Twilio WhatsApp Business Profile を設定すれば、24時間制限なしでメッセージ送信可能になります（月額 $2〜5 程度）。

## 🔐 認証

### ハイブリッド認証
APIルートでは以下の2つの方法で認証を処理します：
1. **Cookie認証**: ブラウザからの通常リクエスト
2. **Bearer Token認証**: APIクライアントからのリクエスト

全てのAPIエンドポイント（`/api/exchange-rate` を除く）で Bearer Token が必要です。

### セッション永続化
`onAuthStateChange` リスナーにより、トークンリフレッシュ時にセッションが自動復元されます。スマホでプルダウンリフレッシュしてもログアウトされません。

## 🗄️ データベース構造

### user_roles テーブル
| カラム | 型 | 説明 |
|---|---|---|
| id | UUID | Primary Key |
| role | String | customer / admin |
| full_name | String | 氏名 |
| whatsapp | String | WhatsApp番号 |

### bid_requests テーブル
| カラム | 型 | 説明 |
|---|---|---|
| id | String | Primary Key（手動生成） |
| customer_email | String | 顧客メール |
| customer_name | String | 顧客ユーザー名 |
| product_title | String | 商品名 |
| product_url | String | 商品URL |
| product_image | String | 商品画像URL |
| max_bid | Number | 最高入札額 |
| status | String | pending / approved / rejected / counter_offer |
| counter_offer | Number | 管理者カウンターオファー |
| customer_counter_offer | Number | 顧客カウンターオファー |
| final_status | String | won / lost |
| final_price | Number | 最終確定金額 |
| customer_confirmed | Boolean | 顧客確認済みフラグ |
| admin_needs_confirm | Boolean | 管理者確認待ちフラグ |
| paid | Boolean | 支払い済みフラグ |
| language | String | 顧客の言語設定 (es / pt) |
| shipping_cost_jpy | Number | 送料（日本円） |

## 🌐 デプロイ

### Vercel
```bash
git push origin main
```
自動的にVercelがデプロイします。

### 環境変数の設定
Vercel Dashboard → Settings → Environment Variables で全ての環境変数を設定し、Redeployしてください。

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
4. 購入履歴で支払いステータスを管理
5. 対応完了後、WhatsAppボタンで顧客に通知

## 🏷️ バージョン履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| v1.0.0 | 2025-02-16 | 初期リリース |
| v2.0.0 | 2026-02-19 | 認証強化、WhatsApp改善、セッション永続化、UI最適化 |

## 📄 ライセンス
Private Project

## 👤 開発者
Yuta