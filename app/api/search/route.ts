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

    // パターン1: 検索結果ページ (.Product)
    $('.Product').each((i, el) => {
      const $el = $(el);
      const title = $el.find('.Product__titleLink').text().trim();
      const url = $el.find('.Product__titleLink').attr('href');
      const imageUrl = $el.find('.Product__imageData').attr('src') || $el.find('img').attr('src');
      const priceText = $el.find('.Product__priceValue').first().text().replace(/[^\d]/g, '');
      const price = parseInt(priceText) || 0;
      const bids = parseInt($el.find('.Product__bid').text()) || 0;
      const productIdMatch = url?.match(/\/auction\/([a-z0-9]+)/);
      const id = productIdMatch ? productIdMatch[1] : `search-${page}-${i}`;

      if (title && url) {
        items.push({ id, title, url, imageUrl, currentPrice: price, bids, source: 'yahoo_search' });
      }
    });

    // パターン2: カテゴリページ (.item) - もしパターン1で見つからなかった場合
    if (items.length === 0) {
      $('.item').each((i, el) => {
        const $el = $(el);
        const title = $el.find('.item__titleLink').text().trim() || $el.find('h3').text().trim();
        const url = $el.find('.item__titleLink').attr('href') || $el.find('a').attr('href');
        const imageUrl = $el.find('.item__imageData').attr('src') || $el.find('img').attr('src');
        const priceText = $el.find('.item__priceValue').first().text().replace(/[^\d]/g, '') || $el.find('.price').text().replace(/[^\d]/g, '');
        const price = parseInt(priceText) || 0;
        const bids = parseInt($el.find('.item__bid').text()) || 0;
        const productIdMatch = url?.match(/\/auction\/([a-z0-9]+)/);
        const id = productIdMatch ? productIdMatch[1] : `cat-${page}-${i}`;

        if (title && url) {
          items.push({ id, title, url, imageUrl, currentPrice: price, bids, source: 'yahoo_search' });
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