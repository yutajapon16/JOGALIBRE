const cheerio = require('cheerio');

async function run() {
  const query = 'MacBook';
  const url = `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(query)}&va=${encodeURIComponent(query)}&exflg=1`;
  console.log(`Searching: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await response.text();
  const $ = cheerio.load(html);
  
  let found = false;
  $('.Product, .Product__item').each((i, el) => {
    const $el = $(el);
    const prices = $el.find('.Product__priceValue').map((i, e) => $(e).text().trim()).get();
    const labels = $el.find('.Product__priceLabel').map((i, e) => $(e).text().trim()).get();
    
    if (prices.length > 1) {
      console.log('--- Found Item with Multiple Prices ---');
      console.log('Title:', $el.find('.Product__titleLink').text().trim());
      console.log('URL:', $el.find('.Product__titleLink').attr('href'));
      labels.forEach((label, idx) => {
        console.log(`  Label: ${label}, Value: ${prices[idx]}`);
      });
      found = true;
      return false; // Stop after finding one
    }
  });
  
  if (!found) {
    console.log('No dual-price items found in the first page of results.');
  }
}

run().catch(console.error);
