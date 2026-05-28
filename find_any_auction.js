const cheerio = require('cheerio');
async function run() {
  const url = 'https://auctions.yahoo.co.jp/search/search?p=macbook&va=macbook&exflg=1';
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await response.text();
  const $ = cheerio.load(html);
  
  $('.Product, .Product__item').each((i, el) => {
    const $el = $(el);
    const href = $el.find('a[href*="/auction/"]').attr('href');
    if (href) {
      console.log(href);
      return false; // found one
    }
  });
}
run();
