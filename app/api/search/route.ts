import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const lang = searchParams.get('lang') || 'es';
  const urlParam = searchParams.get('url');
  const page = parseInt(searchParams.get('page') || '1');

  // デフォルトは50件。URLパラメータに n= があればそれを優先する
  let itemsPerPage = 50;
  if (urlParam) {
    const matchN = urlParam.match(/[?&]n=(\d+)/);
    if (matchN) {
      itemsPerPage = parseInt(matchN[1], 10) || 50;
    }
  }
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

      return formattedTime || raw.replace(/残り|あと|残り時間|まで/g, '').trim();
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
        items.push({ id, title, titleJa: title, url, imageUrl, images: [imageUrl], currentPrice: price, bids, timeLeft, source: 'yahoo_search' });
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
          items.push({ id, title, titleJa: title, url, imageUrl, images: [imageUrl], currentPrice: price, bids, timeLeft, source: 'yahoo_category' });
        }
      });
    }

    // パターン3: 中古車カテゴリ等、特殊な構造の場合 (.Product等がない)
    let rawContainerCount = 0;
    if (items.length === 0) {
      const itemsMap = new Map();

      const processContainer = ($el: cheerio.Cheerio) => {
        const aTag = $el.find('a[href*="/auction/"]').first();
        if (aTag.length === 0) return;
        const href = aTag.attr('href');
        if (!href) return;

        const idMatch = href.match(/\/auction\/([a-zA-Z0-9]+)/);
        if (!idMatch) return;
        const id = idMatch[1];

        // PRチェックの修正: class="pr" は価格ラベルなので [class*="pr"] は使わない
        const rawHtml = $el.html() || '';
        if (
          rawHtml.includes('ストアPR') ||
          $el.find('span.Product__label--pr').length > 0 ||
          $el.find('.item--pr, .Product--pr, .s_item--pr').length > 0
        ) {
          return; // skip true PR
        }

        if (!itemsMap.has(id)) {
          itemsMap.set(id, { id, title: '', url: href, imageUrl: '', currentPrice: 0, bids: 0, timeLeft: '-' });
        }
        const item = itemsMap.get(id);

        const titleText = $el.find('h3 a, h2 a, .a__title a, a[title]').text().replace(/\s+/g, ' ').trim() || aTag.text().replace(/\s+/g, ' ').trim() || $el.find('img').attr('alt');
        if (titleText && titleText.length > 5 && !item.title) {
          item.title = titleText;
        }

        const imgNode = $el.find('img[src*="auction"], .i img, img').first();
        if (imgNode.length > 0 && !item.imageUrl) {
          let src = imgNode.attr('src');
          if (!src || src.includes('blank.gif')) {
            src = imgNode.attr('data-original') || imgNode.attr('data-src');
          }
          if (src) item.imageUrl = src;
        }

        if (item.currentPrice === 0) {
          let priceText = $el.find('.pr + dd, .pri1 dd, [class*="price"]').text().replace(/[^\d]/g, '');
          if (!priceText) {
            priceText = $el.find('span, dd, dt, p, div').filter((idx, ele) => $(ele).text().includes('円')).first().text().replace(/[^\d]/g, '');
          }
          if (priceText) item.currentPrice = parseInt(priceText) || 0;
        }

        const bidsText = $el.find('dt.bi + dd, .Product__bid').text().replace(/[^\d]/g, '');
        if (bidsText) item.bids = parseInt(bidsText) || 0;

        const dataClParams = $el.find('a[data-cl-params]').attr('data-cl-params') || aTag.attr('data-cl-params') || '';
        const endMatch = dataClParams.match(/end:(\d+);/);
        if (endMatch && item.timeLeft === '-') {
          const endTime = parseInt(endMatch[1], 10) * 1000;
          const diff = Math.max(0, endTime - Date.now());
          const d = Math.floor(diff / (1000 * 60 * 60 * 24));
          const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
          const m = Math.floor((diff / 1000 / 60) % 60);
          item.timeLeft = `${d}d ${h}h ${m}m`;
        }

        if (item.timeLeft === '-') {
          let timeText = $el.find('dt.rem + dd').text().trim();
          if (!timeText) {
            timeText = $el.find('span, dd, dt, p, div').filter((idx, ele) => $(ele).text().includes('日') || $(ele).text().includes('時間') || $(ele).text().includes('分')).first().text().trim();
          }
          if (timeText) item.timeLeft = parseTimeLeft(timeText) || '-';
        }
      };

      // Vercel環境対策: .bd があれば確実、なければフォールバック
      if ($('.bd').length > 0) {
        rawContainerCount = $('.bd').length;
        $('.bd').each((i, el) => processContainer($(el)));
      } else {
        const fallbackEls = $('tr, li, div.i, div.Product, div.BaseItem');
        rawContainerCount = fallbackEls.length;
        fallbackEls.each((i, el) => processContainer($(el)));
      }

      // Filter and push valid items
      Array.from(itemsMap.values()).forEach((item) => {
        if (item.title && item.title.length > 5) {
          items.push({
            id: item.id as string,
            title: item.title as string,
            titleJa: item.title as string,
            url: item.url as string,
            imageUrl: item.imageUrl as string,
            images: [item.imageUrl], // ギャラリー対応のためのフォールバック
            currentPrice: item.currentPrice as number,
            bids: item.bids as number,
            timeLeft: item.timeLeft as string,
            source: 'yahoo_car_category'
          });
        }
      });
    }

    // 次のページがあるか判定 (DOMでの確実な判定 + ベースの取得件数による確実な足切り + 先読み判定)
    // パターン1/2の場合、ページャーの次へリンクがあれば確実
    const hasNextPageDom = $('.Pager__list--next, .Pager__next, li.next a, a:contains("次のページ"), a:contains("次へ")').length > 0;

    let hasNextPageByCount = typeof rawContainerCount !== 'undefined' ? rawContainerCount >= 50 : items.length >= (Math.min(itemsPerPage, 50) * 0.7);

    // 中古車カテゴリ等(パターン3)で、1ページに限界数(50枠近く)が返ってきている場合、
    // 次のページが本当に存在するかどうかはヤフオクの仕様上「実際に取得してみないと分からない」ため、裏で先読みする
    if (!hasNextPageDom && hasNextPageByCount && typeof rawContainerCount !== 'undefined') {
      try {
        const nextBValue = (page * itemsPerPage) + 1; // 次ページの先頭インデックス
        const connector = searchUrl.includes('?') ? '&' : '?';
        const nextTargetUrl = searchUrl.replace(/&b=\d+/, '') + `${connector}b=${nextBValue}`;
        const nextRes = await fetch(nextTargetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        const nextHtml = await nextRes.text();
        const $next = cheerio.load(nextHtml);

        let validNextItems = 0;
        $next('.bd').each((i, el) => {
          const rawH = $next(el).html() || '';
          if (!rawH.includes('ストアPR') && $next(el).find('[class*="--pr"]').length === 0) {
            validNextItems++;
          }
        });

        // フォールバック
        if (validNextItems === 0 && $next('.bd').length === 0) {
          $next('tr, li, div.i').each((i, el) => {
            const rawH = $next(el).html() || '';
            if (!rawH.includes('ストアPR') && $next(el).find('[class*="--pr"]').length === 0) {
              validNextItems++;
            }
          });
        }

        hasNextPageByCount = validNextItems > 0;
      } catch (e) {
        console.error('Prefetch error:', e);
        // エラー時はフェールセーフで元の判定（true）を残す
      }
    }

    // itemsが0件なら絶対に次は無い
    let nextPage = items.length > 0 ? (hasNextPageDom || hasNextPageByCount) : false;

    // --- タイトル一括自動翻訳 (無料Google Translate API) ---
    if (items.length > 0 && lang !== 'ja') {
      try {
        // 全タイトルをユニークな文字列 " ||| " で結合して1リクエストで送信
        const DELIMITER = ' ||| ';
        const titlesToTranslate = items.map(item => item.title).join(DELIMITER);

        // Google Translate API (gtx) を呼び出し (GETだとURL長制限に引っかかるためPOSTに変更)
        const translateRes = await fetch(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=${lang}&dt=t`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ q: titlesToTranslate }).toString()
          }
        );
        const translateData = await translateRes.json();

        // 翻訳結果は配列の配列で返ってくる
        if (translateData && translateData[0]) {
          let fullTranslatedText = '';
          for (let i = 0; i < translateData[0].length; i++) {
            fullTranslatedText += translateData[0][i][0];
          }

          // Google翻訳がパイプ周りのスペースを勝手に詰める/開けることがあるため、正規表現で柔軟にスプリットする
          const translatedTitles = fullTranslatedText.split(/\s*\|\|\|\s*/);

          // 元の items 配列に翻訳後のタイトルを適用
          items.forEach((item, index) => {
            if (translatedTitles[index] && translatedTitles[index].trim()) {
              item.title = translatedTitles[index].trim();
            }
          });
        }
      } catch (translateError) {
        console.error('Batch title translation error:', translateError);
        // 翻訳に失敗した場合はそのまま日本語のタイトルで続行する（フェールセーフ）
      }
    }

    return NextResponse.json({ items, translatedKeyword, nextPage });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Failed to search', message: String(error), stack: error instanceof Error ? error.stack : undefined }, { status: 500 });
  }
}