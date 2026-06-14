const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// 接続情報チェック
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("エラー: .env.local に接続情報が設定されていません。");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const targetCustomerIds = ['B001', 'C001', 'A003'];

async function run() {
  console.log(`テストデータ削除スクリプトを開始します。対象: ${targetCustomerIds.join(', ')}`);

  try {
    // 1. user_roles から対象のメールアドレスと UUID を特定
    const { data: users, error: userError } = await supabase
      .from('user_roles')
      .select('id, customer_id, email, role')
      .in('customer_id', targetCustomerIds);

    if (userError) {
      console.error("user_rolesの取得エラー:", userError);
      return;
    }

    if (!users || users.length === 0) {
      console.log("対象のユーザーが user_roles に見つかりませんでした。");
      return;
    }

    const userUuids = users.map(u => u.id).filter(Boolean);
    const userEmails = users.map(u => u.email).filter(Boolean);
    console.log(`特定されたユーザーUUID: ${userUuids.join(', ')}`);
    console.log(`特定されたユーザーメールアドレス: ${userEmails.join(', ')}`);

    // 2. お気に入り (favorites) の削除
    if (userUuids.length > 0) {
      const { data: favsBefore, error: favSelectError } = await supabase
        .from('favorites')
        .select('id')
        .in('user_id', userUuids);

      if (!favSelectError && favsBefore && favsBefore.length > 0) {
        const { error: favDeleteError } = await supabase
          .from('favorites')
          .delete()
          .in('user_id', userUuids);

        if (favDeleteError) {
          console.error("お気に入りの削除エラー:", favDeleteError);
        } else {
          console.log(`お気に入りデータを削除しました: ${favsBefore.length} 件`);
        }
      } else {
        console.log("削除対象のお気に入りデータはありませんでした。");
      }
    }

    // 3. 入金履歴 (deposits) の削除
    const { data: depositsBefore, error: depSelectError } = await supabase
      .from('deposits')
      .select('id')
      .in('customer_id', targetCustomerIds);

    if (!depSelectError && depositsBefore && depositsBefore.length > 0) {
      const { error: depDeleteError } = await supabase
        .from('deposits')
        .delete()
        .in('customer_id', targetCustomerIds);

      if (depDeleteError) {
        console.error("入金履歴の削除エラー:", depDeleteError);
      } else {
        console.log(`入金履歴データを削除しました: ${depositsBefore.length} 件`);
      }
    } else {
      console.log("削除対象の入金履歴はありませんでした。");
    }

    // 4. オファー・商品購入履歴 (bid_requests) の削除
    // customer_email が特定されたメールアドレス一覧に含まれるものを削除
    if (userEmails.length > 0) {
      const { data: bidsBefore, error: bidSelectError } = await supabase
        .from('bid_requests')
        .select('id, customer_email, product_title')
        .in('customer_email', userEmails);

      if (!bidSelectError && bidsBefore && bidsBefore.length > 0) {
        console.log("削除対象のオファー:", bidsBefore.map(b => `[${b.customer_email}] ${b.product_title}`).join(', '));
        
        const { error: bidDeleteError } = await supabase
          .from('bid_requests')
          .delete()
          .in('customer_email', userEmails);

        if (bidDeleteError) {
          console.error("オファー・商品購入履歴の削除エラー:", bidDeleteError);
        } else {
          console.log(`オファー・商品購入履歴データを削除しました: ${bidsBefore.length} 件`);
        }
      } else {
        console.log("削除対象のオファー・商品購入履歴はありませんでした。");
      }
    } else {
      console.log("削除対象のメールアドレスがありません。");
    }

    console.log("テストデータのクリーンアップが完了しました。");

  } catch (e) {
    console.error("スクリプト実行時例外エラー:", e);
  }
}

run();
