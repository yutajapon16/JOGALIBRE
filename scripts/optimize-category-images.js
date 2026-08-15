/**
 * カテゴリカード画像の自動最適化スクリプト
 * 
 * 機能:
 * - 全画像を統一サイズにリサイズ（カード内に収まるように）
 * - 白背景を維持・追加
 * - JPEG品質を最適化してファイルサイズを軽量化
 * 
 * 使い方: node scripts/optimize-category-images.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// 設定
const CATEGORIES_DIR = path.join(__dirname, '..', 'public', 'images', 'categories');
const MAX_WIDTH = 400;   // カード内で使用する最大幅
const MAX_HEIGHT = 200;  // カード内で使用する最大高さ
const JPEG_QUALITY = 90; // JPEG品質（1-100）
const BACKGROUND_COLOR = { r: 255, g: 255, b: 255, alpha: 1 }; // 純白背景

async function optimizeImage(filePath) {
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();
  
  // JPG/PNG/WEBP のみ処理
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return { file: fileName, status: 'skip' };
  }

  try {
    // ファイルサイズチェック（壊れたファイルを検出）
    const stats = fs.statSync(filePath);
    if (stats.size < 100) {
      return { file: fileName, status: 'broken', size: stats.size };
    }

    // 元画像のメタデータを取得
    const metadata = await sharp(filePath).metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;

    // 一時ファイルパスを作成（上書き用）
    const tempPath = filePath + '.tmp';

    // リサイズ＆白背景処理
    await sharp(filePath)
      .flatten({ background: BACKGROUND_COLOR })
      .resize(MAX_WIDTH, MAX_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: false,
        background: BACKGROUND_COLOR
      })
      .jpeg({
        quality: JPEG_QUALITY,
        mozjpeg: true
      })
      .toFile(tempPath);

    // 一時ファイルで上書き
    fs.renameSync(tempPath, filePath);

    const newMetadata = await sharp(filePath).metadata();
    const newStats = fs.statSync(filePath);

    return {
      file: fileName,
      status: 'ok',
      before: `${originalWidth}x${originalHeight} (${(stats.size / 1024).toFixed(1)}KB)`,
      after: `${newMetadata.width}x${newMetadata.height} (${(newStats.size / 1024).toFixed(1)}KB)`
    };
  } catch (err) {
    return { file: fileName, status: 'error', message: err.message };
  }
}

async function main() {
  console.log('');
  console.log('カテゴリカード画像の最適化を開始...');
  console.log('対象: ' + CATEGORIES_DIR);
  console.log('最大サイズ: ' + MAX_WIDTH + 'x' + MAX_HEIGHT + 'px / 背景: 白');
  console.log('---');

  const files = fs.readdirSync(CATEGORIES_DIR)
    .filter(f => !f.startsWith('.'))
    .sort();

  console.log('対象ファイル数: ' + files.length + '\n');

  let success = 0, errors = 0, warnings = 0, skipped = 0;

  for (const file of files) {
    const filePath = path.join(CATEGORIES_DIR, file);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    const result = await optimizeImage(filePath);
    
    if (result.status === 'ok') {
      success++;
      console.log('OK ' + result.file + ': ' + result.before + ' -> ' + result.after);
    } else if (result.status === 'broken') {
      warnings++;
      console.log('WARN ' + result.file + ': broken (' + result.size + 'B)');
    } else if (result.status === 'error') {
      errors++;
      console.log('ERR ' + result.file + ': ' + result.message);
    } else {
      skipped++;
    }
  }

  console.log('\n--- 結果 ---');
  console.log('成功: ' + success + ' / エラー: ' + errors + ' / 警告: ' + warnings + ' / スキップ: ' + skipped);
  console.log('完了!');
}

main().catch(console.error);
