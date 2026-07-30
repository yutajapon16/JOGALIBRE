/**
 * 簡易CSV文字列パーサー。
 * ダブルクォーテーションで囲まれたカンマや改行を安全にパースします。
 * @param csvContent CSVファイルの文字列コンテンツ
 * @returns 行ごとの文字列配列の二次元配列。
 */
export function parseCsvContent(csvContent: string): string[][] {
  try {
    const result: string[][] = [];
    let row: string[] = [];
    let entry = '';
    let insideQuote = false;

    for (let i = 0; i < csvContent.length; i++) {
      const char = csvContent[i];
      const nextChar = csvContent[i + 1];

      if (char === '"') {
        if (insideQuote && nextChar === '"') {
          entry += '"';
          i++;
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        row.push(entry.trim());
        entry = '';
      } else if ((char === '\r' || char === '\n') && !insideQuote) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        row.push(entry.trim());
        if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
          result.push(row);
        }
        row = [];
        entry = '';
      } else {
        entry += char;
      }
    }

    if (entry !== '' || row.length > 0) {
      row.push(entry.trim());
      if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
        result.push(row);
      }
    }

    return result;
  } catch (error) {
    console.error('Error parsing CSV content:', error);
    return [];
  }
}

// 既存のシグネチャ互換用（使われません）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function parseCsv(_filePath: string): string[][] {
  return [];
}
