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

      return parts.join(' ') || raw.replace(/残り|あと|残り時間/g, '').trim();
    };

    // パターン1: 検索結果ページ (.Product)
    $('.Product, .Product__item').each((i, el) => {
      const $el = $(el);
      const title = $el.find('.Product__titleLink, .item__titleLink').text().trim();
      const url = $el.find('.Product__titleLink, .item__titleLink').attr('href');
      const imageUrl = $el.find('.Product__imageData, .item__imageData').attr('src') || $el.find('img').attr('src');
      const priceText = $el.find('.Product__priceValue, .item__priceValue').first().text().replace(/[^\d]/g, '');
      const price = parseInt(priceText) || 0;
      const bids = parseInt($el.find('.Product__bid, .item__bid').text()) || 0;
      const timeLeftRaw = $el.find('.Product__time, .item__time, .time, .date').text().trim();
      const timeLeft = parseTimeLeft(timeLeftRaw);
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
        const title = $el.find('.item__titleLink, .s_item__titleLink, .Product__titleLink, .sdc__title, .title a, .lb-item__title').text().trim() || $el.find('h3').text().trim();
        const url = $el.find('.item__titleLink, .s_item__titleLink, .Product__titleLink, .sdc__link, .title a, .lb-item__link').attr('href') || $el.find('a').attr('href');
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
        const timeLeft = parseTimeLeft(timeLeftRaw);

        const productIdMatch = url?.match(/\/auction\/([a-z0-9]+)/);
        const id = productIdMatch ? productIdMatch[1] : `cat-${page}-${i}`;

        if (title && url) {
          items.push({ id, title, url, imageUrl, currentPrice: price, bids, timeLeft, source: 'yahoo_search' });
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