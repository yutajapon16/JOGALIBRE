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
- 端末のタイムゾーンに基づく一貫した時刻表示
- セッション永続化（スマホリロード時もログイン状態を維持）
- パスワードリセット（メールでリセットリンク送信）

### 管理者機能
- 入札リクエスト管理
- リクエスト承認・却下・カウンターオファー
- 顧客カウンターオファー対応
- 落札・落札できず設定
- 購入履歴表示（顧客別・期間別フィルター、画像内テキスト収まり最適化）
- 購入履歴CSVエクスポート（フィルター適用後のデータをダウンロード、Excel対応BOM付きUTF-8）
- 支払いステータス管理（支払い済み/未払いの切り替え）
- 自動価格計算（FOB費用込み・利益率20%）※FOB費用 1,500円
- 落札時の最終確定金額（Precio final）の適正算出ロジック
- セッション永続化（スマホリロード時もログイン状態を維持）

### PWA対応
- スマホのホーム画面にアプリアイコンを追加可能
- 顧客用・管理者用で異なるアイコンとアプリ名
- Service Workerによるオフラインフォールバック
- Pull-to-Refresh（下に引っ張って更新）によるシームレスなデータ再取得（画面フリーズ・フルリロード防止）

## 🚀 技術スタック

- **Frontend**: Next.js 16 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth（ハイブリッド認証: Cookie + Bearer Token）
- **Deployment**: Vercel（自動デプロイ）, Cloudflare (カスタムドメイン)
- **UI Design**: Tailwind CSS（モバイル最適化）

## 📦 環境変数

### Supabase
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
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
5. 購入履歴をCSVでダウンロード（帳簿用）
6. 対応完了後、WhatsAppボタンで顧客に通知

## 🏷️ バージョン履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| v1.0.0 | 2025-02-16 | 初期リリース |
| v2.0.0 | 2026-02-19 | 認証強化、WhatsApp改善、セッション永続化、UI最適化 |
| v2.1.0 | 2026-02-19 | CSVエクスポート機能追加 |
| v3.0.0 | 2026-02-19 | パスワードリセット、PWA対応 |
| v3.1.0 | 2026-02-20 | プッシュ通知改善（タイトル/本文構成変更）、アプリアイコン・名称統一 |
| v3.1.3 | 2026-02-21 | UI差し戻し、カテゴリ検索改修、FOB等の入力リセット |
| v3.1.4 | 2026-02-21 | スクロール位置の微調整、Ver en Yahooボタンデザイン統一 |
| v3.1.5 | 2026-02-22 | 検索PR広告の完全除外（sfdu判定）、PWA向けPull-to-Refresh実装、UI表示文言の言語別切り替え |
| v3.2.0 | 2026-02-23 | お気に入り商品の残り時間表示の修正（URL検索時）、プロジェクト一旦の完成版 |
| v3.2.1 | 2026-02-24 | 認証セッション維持の安定化（リロード対策）、ログインロジックの改善 |
| v3.3.0 | 2026-03-14 | コードベース全体のシステム監査実施、外部API通信タイムアウト追加、WhatsApp一斉送信ループのエラー抑制強化 |
| v4.0.0 | 2026-03-17 | 大規模リファクタリング（TypeScript型安全化、Next.js画像最適化、認証ロジック標準化、定数共通化）完了 |
| v4.1.0 | 2026-05-22 | システム堅牢性の向上（外部API/SDK通信タイムアウト追加、為替レートAPI障害時のDBキャッシュフォールバック）、ヤフオクID抽出のクエリパラメータ影響排除、一括タイトル翻訳のインデックスマッピング（翻訳ズレ・適用漏れ防止）、入札ID重複防止、WhatsApp通知時のN+1クエリ解消など |
| v4.2.0 | 2026-07-30 | カスタムドメイン(`jogalibre.com`)対応、Twilio(WhatsApp連携)完全削除、ESLintによる潜在バグの安全な抑制とゴミ変数のクリーンアップ完了 |
## 🔮 将来の予定

- **配送ステータスの可視化**: 注文後の配送状況を顧客・管理者画面で確認できる機能。
- **通知チャネルの拡充**: WhatsApp以外のSNS（Telegram, LINE等）への対応検討。

## 📄 ライセンス
Private Project

## 👤 開発者
Yuta