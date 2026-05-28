async function run() {
  const url = 'https://auctions.yahoo.co.jp/search/search?p=macbook&va=macbook&exflg=1';
  console.log(`Searching: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await response.text();
  console.log('HTML length:', html.length);
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  
  console.log('Product items count:', $('.Product, .Product__item').length);
  
  $('.Product, .Product__item').each((i, el) => {
    if (i >= 3) return false;
    const title = $(el).find('.Product__titleLink, .item__titleLink').text().trim();
    console.log(`Product ${i + 1}: ${title}`);
    $(el).find('.Product__price, .item__price').each((j, p) => {
       console.log('Price block:', $(p).text().trim());
       console.log('  Label:', $(p).find('.Product__priceLabel, .item__priceLabel').text().trim());
       console.log('  Value:', $(p).find('.Product__priceValue, .item__priceValue').text().trim());
    });
  });
}

run().catch(console.error);
