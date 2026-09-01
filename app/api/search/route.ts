import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { parseYahooTimeRaw, parseJstDateTime } from '@/lib/utils';
import { batchTranslateTitles, translateText } from '@/lib/translate';
import { notifyAdminError, ErrorUserInfo } from '@/lib/error-notifier';
import { getUserFromRequest, getUserInfoByEmail } from '@/lib/auth-helpers';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const lang = searchParams.get('lang') || 'es';
  const urlParam = searchParams.get('url');
  const page = parseInt(searchParams.get('page') || '1');
  const cond = searchParams.get('cond') || 'all';
  const sort = searchParams.get('sort') || 'featured';

  // ソートパラメータの決定 (Yahooオークション標準)
  // featured: おすすめ順 (s1=score&o1=d)
  // price_asc: 価格が安い順 (s1=cbids&o1=a)
  // price_desc: 価格が高い順 (s1=cbids&o1=d)
  // bids_desc: 入札数が多い順 (s1=bids&o1=d)
  // new: 新着順 (s1=new&o1=d)
  let s1 = 'score';
  let o1 = 'd';
  if (sort === 'price_asc') {
    s1 = 'cbids';
    o1 = 'a';
  } else if (sort === 'price_desc') {
    s1 = 'cbids';
    o1 = 'd';
  } else if (sort === 'bids_desc') {
    s1 = 'bids';
    o1 = 'd';
  } else if (sort === 'new') {
    s1 = 'new';
    o1 = 'd';
  }

  // 操作ユーザー情報の取得（エラー通知連携用）
  let userInfo: ErrorUserInfo | undefined = undefined;
  try {
    const authUser = await getUserFromRequest(request);
    if (authUser && authUser.email) {
      const details = await getUserInfoByEmail(authUser.email);
      userInfo = {
        id: authUser.id,
        email: authUser.email,
        customerId: details?.customer_id || undefined,
        name: details?.full_name || undefined,
        role: details?.role || undefined
      };
    }
  } catch {}


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

      // ソートパラメータの適用
      if (searchUrl.includes('s1=')) {
        searchUrl = searchUrl.replace(/[?&]s1=[^&]+/, (m) => m[0] + `s1=${s1}`);
      } else {
        searchUrl += `&s1=${s1}`;
      }
      if (searchUrl.includes('o1=')) {
        searchUrl = searchUrl.replace(/[?&]o1=[^&]+/, (m) => m[0] + `o1=${o1}`);
      } else {
        searchUrl += `&o1=${o1}`;
      }
    } else if (q) {
      if (lang === 'ja') {
        translatedKeyword = q;
      } else {
        try {
          translatedKeyword = await translateText(q, 'ja', lang);
        } catch (e) {
          console.warn('Search query translation error:', e);
          translatedKeyword = q;
          notifyAdminError({
            category: 'translation',
            title: `検索クエリ翻訳失敗 (${lang.toUpperCase()})`,
            message: `検索クエリ「${q}」の日本語への翻訳中にエラーが発生しました。`,
            details: { query: q, lang, error: String(e) },
            severity: 'warning',
            throttleKey: `search-query-trans:${q}`
          }).catch(err => console.error('Admin notify error:', err));
        }
      }

      const start = (page - 1) * itemsPerPage + 1;
      let condParam = '';
      if (cond === 'new') {
        condParam = '&istatus=1';
      } else if (cond === 'used') {
        condParam = '&istatus=2';
      }

      searchUrl = `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(translatedKeyword)}&va=${encodeURIComponent(translatedKeyword)}&exflg=1&b=${start}&n=${itemsPerPage}&s1=${s1}&o1=${o1}${condParam}`;
    }

    // 検索URLからカテゴリIDを抽出
    let searchCategoryId = '';
    const auccatMatch = searchUrl.match(/[&?]auccat=([0-9]+)/);
    if (auccatMatch) {
      searchCategoryId = auccatMatch[1];
    } else {
      const listMatch = searchUrl.match(/\/category\/list\/([0-9]+)/);
      if (listMatch) {
        searchCategoryId = listMatch[1];
      }
    }

    const controllerSearch = new AbortController();
    const timeoutSearch = setTimeout(() => controllerSearch.abort(), 8000);
    const response = await fetch(searchUrl, {
      signal: controllerSearch.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(timeoutSearch);

    const html = await response.text();
    const $ = cheerio.load(html);
    let nextPage = false;
    let hasParsedNextData = false;
    const items: Record<string, unknown>[] = [];

    // パターン0: Next.js製のページ（車体カテゴリ等）で __NEXT_DATA__ がある場合
    const nextDataHtml = $('#__NEXT_DATA__').html();
    if (nextDataHtml) {
      try {
        const nextData = JSON.parse(nextDataHtml);
        const pageProps = nextData.props?.pageProps || {};
        const initialState = pageProps.initialState || nextData.props?.initialState || {};
        const searchState = initialState.search || {};
        const listing = searchState.items?.listing || {};
        const listingItems = listing.items || [];

        if (Array.isArray(listingItems) && listingItems.length > 0) {
          listingItems.forEach((item: any) => {
            const id = item.auctionId || '';
            const title = item.title || '';
            const imageUrl = item.imageUrl || '';
            const price = item.price || 0;
            const bids = item.bidCount || 0;
            const endTimeStr = item.endTime || '';
            
            let timeLeft = '-';
            let endTimeISO = '';
            if (endTimeStr) {
              const parsedDate = parseJstDateTime(endTimeStr);
              if (parsedDate) {
                endTimeISO = parsedDate.toISOString();
                const diff = Math.max(0, parsedDate.getTime() - Date.now());
                const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
                const m = Math.floor((diff / 1000 / 60) % 60);
                timeLeft = `${d}d ${h}h ${m}m`;
              }
            }

            if (title && id) {
              items.push({
                id,
                title,
                titleJa: title,
                url: `https://page.auctions.yahoo.co.jp/auction/${id}`,
                imageUrl,
                images: [imageUrl],
                currentPrice: price,
                bids,
                timeLeft,
                endTime: endTimeISO,
                categoryId: searchCategoryId || undefined,
                source: 'yahoo_car_next_data'
              });
            }
          });

          // nextPageの判定
          const total = listing.totalResultsAvailable || 0;
          nextPage = (page * itemsPerPage) < total;
          hasParsedNextData = true;
        }
      } catch (err) {
        console.error('Failed to parse __NEXT_DATA__:', err);
      }
    }


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
      let price = parseInt(priceText) || 0;
      // 税込価格がある場合は優先
      const taxMatch = $el.text().match(/(?:税込|\(税込\)|税込み)\s*[：:\s]*¥?([\d,]+)\s*円?/);
      if (taxMatch) {
        const taxPrice = parseInt(taxMatch[1].replace(/,/g, ''));
        if (taxPrice > price) price = taxPrice;
      }
      // data-cl-params からの価格抽出フォールバック
      if (!price && dataClParams) {
        const priceParamMatch = dataClParams.match(/(?:price|cur_bid_price|taxin_price):(\d+);/);
        if (priceParamMatch) {
          price = parseInt(priceParamMatch[1], 10) || 0;
        }
      }
      const bids = parseInt($el.find('.Product__bid, .item__bid').text()) || 0;
      const timeLeftRaw = $el.find('.Product__time, .item__time, .time, .date').text().trim();
      let timeLeft = parseYahooTimeRaw(timeLeftRaw);

      let endTimeISO = '';
      // UnixTimeからの正確な時間計算 (data-cl-params内 end:1772115843; 等)
      const endMatch = dataClParams.match(/end:(\d+);/);
      if (endMatch) {
        const endTimeUnix = parseInt(endMatch[1], 10) * 1000;
        endTimeISO = new Date(endTimeUnix).toISOString();
        const diff = Math.max(0, endTimeUnix - Date.now());
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / 1000 / 60) % 60);
        timeLeft = `${d}d ${h}h ${m}m`;
      }

      const productIdMatch = url?.match(/\/auction\/([a-z0-9]+)/);
      const id = productIdMatch ? productIdMatch[1] : `search-${page}-${i}`;

      if (title && url) {
        items.push({ id, title, titleJa: title, url, imageUrl, images: [imageUrl], currentPrice: price, bids, timeLeft, endTime: endTimeISO, categoryId: searchCategoryId || undefined, source: 'yahoo_search' });
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
        let price = parseInt(priceText) || 0;
        // 税込価格がある場合は優先
        const taxMatch = $el.text().match(/(?:税込|\(税込\)|税込み)\s*[：:\s]*¥?([\d,]+)\s*円?/);
        if (taxMatch) {
          const taxPrice = parseInt(taxMatch[1].replace(/,/g, ''));
          // 誤取得を防ぐため現在の価格より大きい場合のみ適用
          if (taxPrice > price) price = taxPrice;
        }
        // data-cl-params からの価格抽出フォールバック
        if (!price && dataClParams) {
          const priceParamMatch = dataClParams.match(/(?:price|cur_bid_price|taxin_price):(\d+);/);
          if (priceParamMatch) {
            price = parseInt(priceParamMatch[1], 10) || 0;
          }
        }
        const bids = parseInt($el.find('.item__bid, .s_item__bid, .Product__bid, .sdc__bid, .bid, .lb-item__bid').text()) || 0;

        // 残り時間の抽出
        const timeLeftRaw = $el.find('.Product__time, .item__time, .sdc-time, .time, .date, .lb-item__time').text().trim();
        let timeLeft = parseYahooTimeRaw(timeLeftRaw);

        let endTimeISO = '';
        // UnixTimeからの正確な時間計算 (data-cl-params内 end:1772115843; 等)
        const endMatch = dataClParams.match(/end:(\d+);/);
        if (endMatch) {
          const endTimeUnix = parseInt(endMatch[1], 10) * 1000;
          endTimeISO = new Date(endTimeUnix).toISOString();
          const diff = Math.max(0, endTimeUnix - Date.now());
          const d = Math.floor(diff / (1000 * 60 * 60 * 24));
          const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
          const m = Math.floor((diff / 1000 / 60) % 60);
          timeLeft = `${d}d ${h}h ${m}m`;
        }

        const productIdMatch = url?.match(/\/auction\/([a-z0-9]+)/);
        const id = productIdMatch ? productIdMatch[1] : `search-${page}-${i}`;

        if (title && url) {
          items.push({ id, title, titleJa: title, url, imageUrl, images: [imageUrl], currentPrice: price, bids, timeLeft, endTime: endTimeISO, categoryId: searchCategoryId || undefined, source: 'yahoo_category' });
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

        const imgNodes = $el.find('img[src*="auction"], .i img, img');
        const containerImages: string[] = [];
        imgNodes.each((idx, node) => {
          let src = $(node).attr('src');
          if (!src || src.includes('blank.gif')) {
            src = $(node).attr('data-original') || $(node).attr('data-src');
          }
          if (src && (src.includes('auctions.c.yimg.jp') || src.includes('img.auctions.yahoo.co.jp'))) {
            containerImages.push(src);
          }
        });

        if (containerImages.length > 0) {
          if (!item.imageUrl) item.imageUrl = containerImages[0];
          item.images = containerImages;
        }

        if (item.currentPrice === 0) {
          let priceText = $el.find('.pr + dd, .pri1 dd, [class*="price"]').text().replace(/[^\d]/g, '');
          if (!priceText) {
            priceText = $el.find('span, dd, dt, p, div').filter((idx, ele) => $(ele).text().includes('円')).first().text().replace(/[^\d]/g, '');
          }
          let price = parseInt(priceText) || 0;
          
          // 税込価格がある場合は優先
          const taxMatch = $el.text().match(/税込.*?([\d,]+)\s*円/);
          if (taxMatch) {
            const taxPrice = parseInt(taxMatch[1].replace(/,/g, ''));
            if (taxPrice > price) price = taxPrice;
          }
          item.currentPrice = price;
        }

        const bidsText = $el.find('dt.bi + dd, .Product__bid').text().replace(/[^\d]/g, '');
        if (bidsText) item.bids = parseInt(bidsText) || 0;

        const dataClParams = $el.find('a[data-cl-params]').attr('data-cl-params') || aTag.attr('data-cl-params') || '';
        const endMatch = dataClParams.match(/end:(\d+);/);
        if (endMatch) {
          const endTime = parseInt(endMatch[1], 10) * 1000;
          const diff = Math.max(0, endTime - Date.now());
          const d = Math.floor(diff / (1000 * 60 * 60 * 24));
          const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
          const m = Math.floor((diff / 1000 / 60) % 60);
          item.timeLeft = `${d}d ${h}h ${m}m`;
        } else {
          let timeText = $el.find('dt.rem + dd').text().trim();
          if (!timeText) {
            timeText = $el.find('span, dd, dt, p, div').filter((idx, ele) => $(ele).text().includes('日') || $(ele).text().includes('時間') || $(ele).text().includes('分')).first().text().trim();
          }
          if (timeText) item.timeLeft = parseYahooTimeRaw(timeText) || '-';
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
            images: item.images || [item.imageUrl], // ギャラリー対応
            currentPrice: item.currentPrice as number,
            bids: item.bids as number,
            timeLeft: item.timeLeft as string,
            categoryId: searchCategoryId || undefined,
            source: 'yahoo_car_category'
          });
        }
      });
    }

    // 次のページがあるか判定 (DOMでの確実な判定 + ベースの取得件数による確実な足切り + 先読み判定)
    // パターン0 (NEXT_DATA) で既に解析済みの場合はスキップ
    if (!hasParsedNextData) {
      const hasNextPageDom = $('.Pager__list--next, .Pager__next, li.next a, a:contains("次のページ"), a:contains("次へ")').length > 0;

      let hasNextPageByCount = typeof rawContainerCount !== 'undefined' ? rawContainerCount >= 50 : items.length >= (Math.min(itemsPerPage, 50) * 0.7);

      // 中古車カテゴリ等(パターン3)で、1ページに限界数(50枠近く)が返ってきている場合、
      // 次のページが本当に存在するかどうかはヤフオクの仕様上「実際に取得してみないと分からない」ため、裏で先読みする
      if (!hasNextPageDom && hasNextPageByCount && typeof rawContainerCount !== 'undefined') {
        const controllerNext = new AbortController();
        const timeoutNext = setTimeout(() => controllerNext.abort(), 2000);
        try {
          const nextBValue = (page * itemsPerPage) + 1; // 次ページの先頭インデックス
          const connector = searchUrl.includes('?') ? '&' : '?';
          const nextTargetUrl = searchUrl.replace(/&b=\d+/, '') + `${connector}b=${nextBValue}`;
          const nextRes = await fetch(nextTargetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: controllerNext.signal
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
        } finally {
          clearTimeout(timeoutNext);
        }
      }

      // itemsが0件なら絶対に次は無い
      nextPage = items.length > 0 ? (hasNextPageDom || hasNextPageByCount) : false;
    }


    // --- タイトル一括自動翻訳 (Gemini API + 多重フォールバック) ---
    if (items.length > 0 && lang !== 'ja') {
      try {
        const rawTitles = items.map(item => (typeof item.title === 'string' ? item.title : '') || '');
        const translatedTitles = await batchTranslateTitles(rawTitles, lang, userInfo);
        if (translatedTitles && translatedTitles.length === items.length) {
          items.forEach((item, idx) => {
            if (translatedTitles[idx]) {
              item.title = translatedTitles[idx];
            }
          });
        }
      } catch (translateError) {
        console.error('Batch title translation error in search route:', translateError);
        // 翻訳に失敗した場合はそのまま日本語のタイトルで続行する（フェールセーフ）
      }
    }


    return NextResponse.json({ items, translatedKeyword, nextPage });
  } catch (error) {
    console.error('Search error:', error);
    notifyAdminError({
      category: 'scraping',
      title: 'ヤフオク検索スクレイピング・データ解析エラー',
      message: `検索リクエストの処理中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: {
        error: error instanceof Error ? error.stack : String(error),
        query: q,
        urlParam
      },
      severity: 'error',
      throttleKey: `search-error:${q || urlParam || 'unknown'}`
    }).catch(e => console.error('Admin notify error:', e));

    return NextResponse.json({ error: 'Failed to search' }, { status: 500 });
  }
}