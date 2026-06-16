const fs = require('fs');
const path = require('path');

// 簡易CSVパーサー
function parseCsv(filePath) {
  try {
    const absolutePath = path.resolve(__dirname, '..', filePath);
    if (!fs.existsSync(absolutePath)) {
      console.warn(`CSV file not found at ${absolutePath}`);
      return [];
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    const result = [];
    let row = [];
    let entry = '';
    let insideQuote = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const nextChar = content[i + 1];

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
    console.error(`Error parsing CSV at ${filePath}:`, error);
    return [];
  }
}

function compile() {
  console.log('Compiling cost CSVs into JSON cache...');
  
  let shippingCosts = [];
  let fobCosts = [];
  let localCosts = {};

  // 1. 送料
  const shippingRows = parseCsv('data/shipping-costs.csv');
  if (shippingRows.length > 1) {
    shippingCosts = shippingRows.slice(1).map(row => {
      const categoryIds = row[2] ? row[2].split(',').map(id => id.trim()).filter(Boolean) : [];
      const keywords = row[3] ? row[3].split('|').map(k => k.trim()).filter(Boolean) : [];
      return {
        key: row[0],
        shipping: parseInt(row[1] || '0', 10),
        categoryIds,
        keywords
      };
    });
  }

  // 2. FOB費用
  const fobRows = parseCsv('data/fob-costs.csv');
  if (fobRows.length > 1) {
    fobCosts = fobRows.slice(1).map(row => {
      const categoryIds = row[2] ? row[2].split(',').map(id => id.trim()).filter(Boolean) : [];
      const keywords = row[3] ? row[3].split('|').map(k => k.trim()).filter(Boolean) : [];
      return {
        key: row[0],
        fob: parseInt(row[1] || '0', 10),
        categoryIds,
        keywords
      };
    });
  }

  // 3. 現地費用
  const localRows = parseCsv('data/local-costs.csv');
  if (localRows.length > 1) {
    localRows.slice(1).forEach(row => {
      localCosts[row[0]] = {
        key: row[0],
        asu_sea: parseFloat(row[1] || '0'),
        enc_sea: parseFloat(row[2] || '0'),
        pjc_sea: parseFloat(row[3] || '0'),
        asu_air: parseFloat(row[4] || '0'),
        enc_air: parseFloat(row[5] || '0'),
        pjc_air: parseFloat(row[6] || '0')
      };
    });
  }

  const outputCache = {
    shippingCosts,
    fobCosts,
    localCosts
  };

  const outputPath = path.resolve(__dirname, '../lib/costs-cache.json');
  fs.writeFileSync(outputPath, JSON.stringify(outputCache, null, 2), 'utf-8');
  console.log(`Successfully compiled and wrote cache to ${outputPath}`);
}

compile();
