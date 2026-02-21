import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const lang = searchParams.get('lang') || 'es';
  const urlParam = searchParams.get('url');
  const page = parseInt(searchParams.get('page') || '1');
  const itemsPerPage = 20;

  if (!q && !urlParam) {
    return NextResponse.json({ items: [], nextPage: false });
  }

  try {
    let searchUrl = '';
    let translatedKeyword = '';

    if (urlParam) {
      searchUrl = urlParam;
      // ページネーション対応: URLに既にパラメータがあるか確認
      const connector = searchUrl.includes('?') ? '&' : '?';
      // Yahooのページネーションは 'b' (開始番号) を使う
      const start = (page - 1) * itemsPerPage + 1;
      if (!searchUrl.includes('b=')) {
        searchUrl += `${connector}b=${start}&n=${itemsPerPage}`;
      } else {
        // 既存のbを置換
        searchUrl = searchUrl.replace(/b=\d+/, `b=${start}`);
      }
    } else if (q) {
      const translateRes = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${lang}&tl=ja&dt=t&q=${encodeURIComponent(q)}`
      );
      const translateData = await translateRes.json();
      translatedKeyword = translateData?.[0]?.[0]?.[0] || q;

      const start = (page - 1) * itemsPerPage + 1;
      searchUrl = `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(translatedKeyword)}&va=${encodeURIComponent(translatedKeyword)}&exflg=1&b=${start}&n=${itemsPerPage}&s1=score&o1=d`;
    }

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const html = await response.text();
    const $ = cheerio.load(html);
    const items: any[] = [];

    // 時間パース用のヘルパー関数 (より詳細に抽出するように改善)
    const parseTimeLeft = (raw: string) => {
      if (!raw) return '';
      // 全角半角、空白を許容
      const cleanRaw = raw.replace(/\s+/g, '');
      const daysMatch = cleanRaw.match(/(\d+)日/);
      const hoursMatch = cleanRaw.match(/(\d+)時間/);
      const minutesMatch = cleanRaw.match(/(\d+)分/);

      const parts = [];
      if (daysMatch) parts.push(`${daysMatch[1]}d`);
      if (hoursMatch) parts.push(`${hoursMatch[1]}h`);
      if (minutesMatch) parts.push(`${minutesMatch[1]}m`);

      // "あと11時間" や "11h" などの形式にも対応
      if (parts.length === 0) {
        const hMatch = cleanRaw.match(/(\d+)h/i) || cleanRaw.match(/あと(\d+)時間/);
        const mMatch = cleanRaw.match(/(\d+)m/i) || cleanRaw.match(/あと(\d+)分/);
        if (hMatch) parts.push(`${hMatch[1]}h`);
        if (mMatch) parts.push(`${mMatch[1]}m`);
      }

      // 「d h m」表記を強制する (例: 1d 0h 0m)
      const partsStr = parts.join(' ');
      let d = '0d', h = '0h', m = '0m';
      if (partsStr.includes('d')) d = partsStr.match(/(\d+)d/)?.[0] || '0d';
      if (partsStr.includes('h')) h = partsStr.match(/(\d+)h/)?.[0] || '0h';
      if (partsStr.includes('m')) m = partsStr.match(/(\d+)m/)?.[0] || '0m';

      let formattedTime = '';
      if (parts.length > 0) {
        formattedTime = `${d} ${h} ${m}`;
      }

      return formattedTime || raw.replace(/残り|あと|残り時間/g, '').trim();
    };

    // パターン1: 検索結果ページ (.Product)
    $('.Product, .Product__item').each((i, el) => {
      const $el = $(el);

      // PR広告商品（一番目に固定される商品）を除外
      if (
        $el.hasClass('Product--pr') ||
        $el.find('span.Product__label--pr').length > 0 ||
        $el.find('[class*="--pr"]').length > 0 ||
        $el.text().includes('ストアPR') ||
        $el.find('span:contains("PR")').length > 0
      ) {
        return; // skip
      }

      const title = $el.find('.Product__titleLink, .item__titleLink').text().trim();
      const url = $el.find('.Product__titleLink, .item__titleLink').attr('href');
      const dataClParams = $el.find('.Product__titleLink, .item__titleLink').attr('data-cl-params') || '';
      const imageUrl = $el.find('.Product__imageData, .item__imageData').attr('src') || $el.find('img').attr('src');
      const priceText = $el.find('.Product__priceValue, .item__priceValue').first().text().replace(/[^\d]/g, '');
      const price = parseInt(priceText) || 0;
      const bids = parseInt($el.find('.Product__bid, .item__bid').text()) || 0;
      const timeLeftRaw = $el.find('.Product__time, .item__time, .time, .date').text().trim();
      let timeLeft = parseTimeLeft(timeLeftRaw);

      // UnixTimeからの正確な時間計算 (data-cl-params内 end:1772115843; 等)
      const endMatch = dataClParams.match(/end:(\d+);/);
      if (endMatch) {
        const endTime = parseInt(endMatch[1], 10) * 1000;
        const diff = Math.max(0, endTime - Date.now());
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / 1000 / 60) % 60);
        timeLeft = `${d}d ${h}h ${m}m`;
      }

      const productIdMatch = url?.match(/\/auction\/([a-z0-9]+)/);
      const id = productIdMatch ? productIdMatch[1] : `search-${page}-${i}`;

      if (title && url) {
        items.push({ id, title, url, imageUrl, currentPrice: price, bids, timeLeft, source: 'yahoo_search' });
      }
    });

    // パターン2: カテゴリページ (.item, .s_item, .Product__item, .sdc, .lb-item, .lb-item-border)
    if (items.length === 0) {
      $('.item, .s_item, .Product__item, .sdc, .lb-item, .lb-item-border, .lb-item-container').each((i, el) => {
        const $el = $(el);

        // PR広告商品（上部に固定される商品等）を除外
        if (
          $el.hasClass('item--pr') ||
          $el.hasClass('s_item--pr') ||
          $el.hasClass('Product--pr') ||
          $el.find('[class*="--pr"]').length > 0 ||
          $el.text().includes('ストアPR') ||
          $el.find('span:contains("PR")').length > 0
        ) {
          return; // skip
        }

        const title = $el.find('.item__titleLink, .s_item__titleLink, .Product__titleLink, .sdc__title, .title a, .lb-item__title').text().trim() || $el.find('h3').text().trim();
        const url = $el.find('.item__titleLink, .s_item__titleLink, .Product__titleLink, .sdc__link, .title a, .lb-item__link').attr('href') || $el.find('a').attr('href');
        const dataClParams = $el.find('.item__titleLink, .s_item__titleLink, .Product__titleLink, .sdc__link, .title a, .lb-item__link').attr('data-cl-params') || $el.find('a').attr('data-cl-params') || '';
        let imageUrl = $el.find('.item__imageData, .s_item__imageData, .Product__imageData, .sdc__image, .image img, .thumb img, .lb-item__image').attr('src') || $el.find('img').attr('src');

        // Lazy load や data-original, data-src への対応
        if (!imageUrl || imageUrl.includes('blank.gif')) {
          imageUrl = $el.find('img').attr('data-original') || $el.find('img').attr('data-src') || $el.find('img').attr('src');
        }

        const priceText = $el.find('.item__priceValue, .s_item__priceValue, .Product__priceValue, .sdc__price, .price, .bid, .lb-item__price').first().text().replace(/[^\d]/g, '') || $el.find('.price').text().replace(/[^\d]/g, '');
        const price = parseInt(priceText) || 0;
        const bids = parseInt($el.find('.item__bid, .s_item__bid, .Product__bid, .sdc__bid, .bid, .lb-item__bid').text()) || 0;

        // 残り時間の抽出
        const timeLeftRaw = $el.find('.Product__time, .item__time, .sdc-time, .time, .date, .lb-item__time').text().trim();
        let timeLeft = parseTimeLeft(timeLeftRaw);

        // UnixTimeからの正確な時間計算 (data-cl-params内 end:1772115843; 等)
        const endMatch = dataClParams.match(/end:(\d+);/);
        if (endMatch) {
          const endTime = parseInt(endMatch[1], 10) * 1000;
          const diff = Math.max(0, endTime - Date.now());
          const d = Math.floor(diff / (1000 * 60 * 60 * 24));
          const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
          const m = Math.floor((diff / 1000 / 60) % 60);
          timeLeft = `${d}d ${h}h ${m}m`;
        }

        const productIdMatch = url?.match(/\/auction\/([a-z0-9]+)/);
        const id = productIdMatch ? productIdMatch[1] : `search-${page}-${i}`;

        if (title && url) {
          items.push({ id, title, url, imageUrl, currentPrice: price, bids, timeLeft, source: 'yahoo_category' });
        }
      });
    }

    // パターン3: 中古車カテゴリ等、特殊な構造の場合 (.Product等がない)
    if (items.length === 0) {
      const itemsMap = new Map();

      $('a').each((i, el) => {
        const href = $(el).attr('href');
        if (!href || !href.match(/\/auction\/([a-zA-Z0-9]+)$/)) return;

        const idMatch = href.match(/\/auction\/([a-zA-Z0-9]+)/);
        const id = idMatch ? idMatch[1] : null;
        if (!id) return;

        const parentHtml = $(el).parent().html() || '';
        if (parentHtml.includes('ストアPR') || parentHtml.includes('PR ') || $(el).closest('[class*="pr"], [class*="PR"]').length > 0) {
          return; // skip PR
        }

        const $el = $(el);
        let title = $el.text().replace(/\s+/g, ' ').trim() || $el.attr('title') || $el.find('img').attr('alt');

        if (!itemsMap.has(id)) {
          itemsMap.set(id, { id, title: title || '', url: href, imageUrl: '', currentPrice: 0, bids: 0, timeLeft: '-' });
        }

        const currentItem = itemsMap.get(id);

        if (!currentItem.title && title && title.length > 5) {
          currentItem.title = title;
        }

        const imgNode = $el.find('img');
        if (imgNode.length > 0 && !currentItem.imageUrl) {
          let src = imgNode.attr('src');
          if (!src || src.includes('blank.gif')) {
            src = imgNode.attr('data-original') || imgNode.attr('data-src');
          }
          if (src) currentItem.imageUrl = src;
        }

        const container = $el.closest('tr, table, li, div.i, div.a, div');
        if (container.length > 0 && currentItem.currentPrice === 0) {
          const priceTags = container.find('[class*="price"], [class*="Price"], span, dd, dt, p, div').filter((idx, ele) => $(ele).text().includes('円'));
          if (priceTags.length > 0) {
            const priceText = priceTags.first().text().replace(/[^\d]/g, '');
            if (priceText) currentItem.currentPrice = parseInt(priceText) || 0;
          }

          const timeTags = container.find('span, dd, dt, p, div').filter((idx, ele) => $(ele).text().includes('日') || $(ele).text().includes('時間') || $(ele).text().includes('分'));
          if (timeTags.length > 0) {
            const dt = timeTags.first().text().trim();
            let parsedTime = parseTimeLeft(dt || '-');
            if (parsedTime && currentItem.timeLeft === '-') currentItem.timeLeft = parsedTime;
          }

          const bidsText = container.find('dt.bi + dd, [class*="bid"], [class*="Bid"]').text().replace(/[^\d]/g, '');
          if (bidsText) currentItem.bids = parseInt(bidsText) || 0;
        }
      });

      // Filter and push valid items
      Array.from(itemsMap.values()).forEach((item, index) => {
        if (item.title && item.title.length > 5) {
          items.push({
            id: item.id,
            title: item.title,
            url: item.url,
            imageUrl: item.imageUrl,
            currentPrice: item.currentPrice,
            bids: item.bids,
            timeLeft: item.timeLeft,
            source: 'yahoo_car_category'
          });
        }
      });
    }

    // 次のページがあるか判定 (簡易版: 件数がnと同じなら次があると仮定)
    const nextPage = items.length >= itemsPerPage;

    return NextResponse.json({ items, translatedKeyword, nextPage });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Failed to search' }, { status: 500 });
  }
}