async function run() {
  const url = 'https://auctions.yahoo.co.jp/jp/auction/1230853321';
  try {
    console.log("Fetching URL:", url);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await response.text();
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
    if (!nextDataMatch) {
      console.log("NEXT_DATA not found");
      return;
    }
    const jsonData = JSON.parse(nextDataMatch[1]);
    const itemData = jsonData.props?.pageProps?.initialState?.item?.detail?.item || {};
    console.log("itemData.endTime type:", typeof itemData.endTime);
    console.log("itemData.endTime value:", itemData.endTime);

    // parseJstDateTime と同様のパーステスト
    const endTimeVal = itemData.endTime;
    let endTimeISO = '';
    let parsedDate = null;
    if (typeof endTimeVal === 'number') {
      parsedDate = new Date(endTimeVal * 1000);
    } else if (typeof endTimeVal === 'string') {
      // parseJstDateTime 簡易版
      let cleanStr = endTimeVal.trim().replace(/\//g, '-');
      const hasTimeZone = cleanStr.includes('Z') || cleanStr.includes('+') || cleanStr.includes('-', 10);
      if (!hasTimeZone) {
        cleanStr = cleanStr.replace(' ', 'T') + '+09:00';
      } else {
        cleanStr = cleanStr.replace(' ', 'T');
      }
      parsedDate = new Date(cleanStr);
    }

    if (parsedDate) {
      console.log("Parsed Date Object:", parsedDate.toString());
      console.log("Parsed ISO String:", parsedDate.toISOString());
      console.log("Parsed Unix Time:", parsedDate.getTime());
      console.log("Date.now():", Date.now());
      const diff = parsedDate.getTime() - Date.now();
      console.log("Difference (ms):", diff);
      const hours = diff / (1000 * 60 * 60);
      console.log("Difference (hours):", hours);
    } else {
      console.log("Failed to parse date");
    }

  } catch (e) {
    console.error("Error fetching or parsing:", e);
  }
}

run();
