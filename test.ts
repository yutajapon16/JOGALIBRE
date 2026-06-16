import { calculateDefaultFobCost, calculateDefaultShippingCost } from './lib/utils.ts';
console.log('FOB for supra URL:', calculateDefaultFobCost("some title", "https://example.com?jcat=supra"));
console.log('Shipping for motor URL:', calculateDefaultShippingCost("some title", "https://example.com?jcat=motor"));

// --- 新しいテストケース ---
console.log('--- Shipping Cost Tests ---');
// 1. タイヤホイールセットカテゴリ (ヤフオクカテゴリID 2084226162)
console.log('1. タイヤホイールセットカテゴリ (auccat含む):', calculateDefaultShippingCost("ホイールセット 4本", "https://page.auctions.yahoo.co.jp/jp/auction/f12345?auccat=26318,2084055276,2084226162")); // 8000のはず
// 2. タイトルに「タイヤ」が含まれる場合 (ヤフオクカテゴリIDはホイール単体 2084005140)
console.log('2. タイトルに「タイヤ」が含まれる場合 (厳密なID優先):', calculateDefaultShippingCost("18インチアルミホイール タイヤ付き 4本セット", "https://page.auctions.yahoo.co.jp/jp/auction/f12345?auccat=2084005140")); // 6000のはず
// 3. ヤフオクのタイヤカテゴリ (ヤフオクカテゴリID 2084200183)
console.log('3. ヤフオクのタイヤカテゴリ (auccat=2084200183):', calculateDefaultShippingCost("中古サマータイヤ 4本", "https://page.auctions.yahoo.co.jp/jp/auction/f12345?auccat=2084200183")); // 8000のはず

// 新しく追加した厳密判定テストケース
// 4. エンジンカテゴリID (2084200282)
console.log('4. エンジンカテゴリ (auccat=2084200282):', calculateDefaultShippingCost("テストタイトル", "https://page.auctions.yahoo.co.jp/jp/auction/f12345?auccat=2084200282")); // 10000のはず
// 5. サスペンションカテゴリID (2084005257)
console.log('5. サスペンションカテゴリ (auccat=2084005257):', calculateDefaultShippingCost("テストタイトル", "https://page.auctions.yahoo.co.jp/jp/auction/f12345?auccat=2084005257")); // 2000のはず
// 6. アンプカテゴリID (2084005294)
console.log('6. アンプカテゴリ (auccat=2084005294):', calculateDefaultShippingCost("テストタイトル", "https://page.auctions.yahoo.co.jp/jp/auction/f12345?auccat=2084005294")); // 3000のはず
// 7. フォールバック判定 (URLにIDがなくタイトルに「シート」が含まれる場合)
console.log('7. シートフォールバック (タイトル検知):', calculateDefaultShippingCost("レカロシート左右セット", "https://page.auctions.yahoo.co.jp/jp/auction/f12345")); // 9000のはず

// 自動車部品以外の一般カテゴリ、および大型車両本体のテストケース
// 8. 自動車部品以外の一般カテゴリ（時計、洋服など）
console.log('8. 一般カテゴリ (時計・洋服など):', calculateDefaultShippingCost("セイコー 腕時計", "https://page.auctions.yahoo.co.jp/jp/auction/f12345?auccat=2084024503")); // 1000のはず
// 9. 自動車車体本体 (ヤフオクカテゴリID 26360)
console.log('9. 自動車車体 (auccat=26360):', calculateDefaultShippingCost("トヨタ スープラ 車体本体", "https://page.auctions.yahoo.co.jp/jp/auction/f12345?auccat=26360")); // 0のはず (要見積もり)
// 10. バイク車体本体 (ヤフオクカテゴリID 26316)
console.log('10. バイク車体 (auccat=26316):', calculateDefaultShippingCost("ホンダ CB400SF", "https://page.auctions.yahoo.co.jp/jp/auction/f12345?auccat=26316")); // 0のはず (要見積もり)
// 11. 自転車本体 (ヤフオクカテゴリID 26246)
console.log('11. 自転車本体 (auccat=26246):', calculateDefaultShippingCost("ロードバイク 完成車", "https://page.auctions.yahoo.co.jp/jp/auction/f12345?auccat=26246")); // 0のはず (要見積もり)

// 指摘された実際の商品 (u1233507172) のシミュレーション
// 12. u1233507172 のカテゴリID (2084200183) を含むURL
console.log('12. u1233507172 実際の商品 (auccat含む):', calculateDefaultShippingCost("SPEEDLINE 17インチ タイヤホイール4本セット", "https://auctions.yahoo.co.jp/jp/auction/u1233507172?auccat=26318,2084300257,2084200183,2084200189,2084231104,2084231106")); // 8000のはず


console.log('--- FOB Cost Tests ---');
// 12. 部品取り車カテゴリ (ヤフオクカテゴリID 2084061280)
console.log('12. 部品取り車カテゴリ (auccat=2084061280):', calculateDefaultFobCost("テストタイトル", "https://page.auctions.yahoo.co.jp/jp/auction/f12345?auccat=2084061280")); // 65000のはず
// 13. バイクカテゴリ (ヤフオクカテゴリID 26316)
console.log('13. バイクカテゴリ (auccat=26316):', calculateDefaultFobCost("テストタイトル", "https://page.auctions.yahoo.co.jp/jp/auction/f12345?auccat=26316")); // 10000のはず
// 14. 車種別タイトル検知 (スープラ)
console.log('14. 車種タイトル判定 (スープラ):', calculateDefaultFobCost("スープラ JZA80 6MT", "https://page.auctions.yahoo.co.jp/jp/auction/f12345")); // 54000のはず
// 15. デフォルトFOB (該当なし)
console.log('15. デフォルトFOB (一般商品):', calculateDefaultFobCost("一般の自動車部品", "https://page.auctions.yahoo.co.jp/jp/auction/f12345")); // 1500のはず


console.log('--- Profit Rate Tests ---');
const simulateProfitRate = (customerId: string, agentCustomerId?: string | null) => {
  let profitRate = 0.4;
  if (customerId === 'B001') {
    profitRate = 0.1;
  } else if (agentCustomerId === 'B001') {
    profitRate = 0.4; // B001紐づき顧客は通常顧客と同様に40%
  } else if (customerId.startsWith('A')) {
    profitRate = 0.2; // 通常・ブラジルエージェント共通で20%
  }
  return profitRate;
};

console.log('1. B001本人 (customerId=B001):', simulateProfitRate('B001')); // 0.1 のはず
console.log('2. B001紐づき顧客 (customerId=C123, agentCustomerId=B001):', simulateProfitRate('C123', 'B001')); // 0.4 のはず
console.log('3. ブラジルエージェント (customerId=A001):', simulateProfitRate('A001')); // 0.2 のはず
console.log('4. 通常エージェント (customerId=A002):', simulateProfitRate('A002')); // 0.2 のはず
console.log('5. 一般顧客 (customerId=C456):', simulateProfitRate('C456')); // 0.4 のはず




