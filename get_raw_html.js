async function run() {
  const url = 'https://auctions.yahoo.co.jp/search/search?p=macbook&va=macbook&exflg=1';
  console.log(`Searching: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });
  const html = await response.text();
  console.log('HTML length:', html.length);
  console.log('Snippet:', html.substring(0, 1000));
}

run().catch(console.error);
