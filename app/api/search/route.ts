import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const lang = searchParams.get('lang') || 'es';

  if (!q) {
    return NextResponse.json({ items: [] });
  }

  try {
    // 1. 翻訳 (スペイン語/ポルトガル語 -> 日本語)
    // 無料の翻訳サービス用URL (簡易版)
    const translateRes = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${lang}&tl=ja&dt=t&q=${encodeURIComponent(q)}`
    );
    const translateData = await translateRes.json();
    const JapaneseKeyword = translateData?.[0]?.[0]?.[0] || q;

    console.log(`Original: ${q}, Translated: ${JapaneseKeyword}`);

    // 2. Yahoo!オークション検索
    const searchUrl = `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(JapaneseKeyword)}&va=${encodeURIComponent(JapaneseKeyword)}&exflg=1&b=1&n=20&s1=score&o1=d`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const html = await response.text();
    const $ = cheerio.load(html);
    const items: any[] = [];

    $('.Product').each((i, el) => {
      if (items.length >= 20) return;

      const $el = $(el);
      const title = $el.find('.Product__titleLink').text().trim();
      const url = $el.find('.Product__titleLink').attr('href');
      const imageUrl = $el.find('.Product__imageData').attr('src');
      const priceText = $el.find('.Product__priceValue').first().text().replace(/[^\d]/g, '');
      const price = parseInt(priceText) || 0;
      const bids = parseInt($el.find('.Product__bid').text()) || 0;

      // 商品ID抽出
      const productIdMatch = url?.match(/\/auction\/([a-z0-9]+)/);
      const id = productIdMatch ? productIdMatch[1] : `search-${i}`;

      if (title && url) {
        items.push({
          id,
          title,
          url,
          imageUrl,
          currentPrice: price,
          bids,
          source: 'yahoo_search'
        });
      }
    });

    return NextResponse.json({ items, translatedKeyword: JapaneseKeyword });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Failed to search' }, { status: 500 });
  }
}