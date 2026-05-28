const cheerio = require('cheerio');
async function run() {
  const url = 'https://auctions.yahoo.co.jp/search/search?p=macbook&va=macbook&exflg=1';
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } });
  const html = await response.text();
  const $ = cheerio.load(html);
  
  $('.Product, .Product__item').each((i, el) => {
    const $el = $(el);
    const title = $el.find('.Product__titleLink').text().trim();
    const href = $el.find('.Product__titleLink').attr('href');
    const values = $el.find('.Product__priceValue').map((i, e) => $(e).text().trim()).get();
    
    if (values.length > 1 && values[0] !== values[1]) {
      console.log(`Title: ${title}`);
      console.log(`URL: ${href}`);
      console.log(`Prices: ${values.join(', ')}`);
      return false; // stop
    }
  });
}
run();
