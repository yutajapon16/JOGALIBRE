const cheerio = require('cheerio');

async function run() {
  const url = 'https://auctions.yahoo.co.jp/search/search?p=macbook&va=macbook&exflg=1';
  console.log('Fetching search results...');
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } });
  const html = await response.text();
  const $ = cheerio.load(html);
  
  let tested = 0;
  $('.Product, .Product__item').each((i, el) => {
    if (tested >= 10) return false;
    const $el = $(el);
    const title = $el.find('.Product__titleLink').text().trim();
    if (!title) return;

    const prices = [];
    $el.find('.Product__price').each((j, pEl) => {
      const label = $(pEl).find('.Product__priceLabel').text().trim();
      const value = $(pEl).find('.Product__priceValue').text().trim();
      if(label || value) {
        prices.push({ label, value });
      }
    });

    if (prices.length > 1) {
      console.log(`--- [FIND!] ${title.substring(0, 30)} ---`);
      prices.forEach(p => console.log(`  ${p.label}: ${p.value}`));
      tested++;
    }
  });
  if (tested === 0) console.log('No products with multiple prices found.');
}

run();
