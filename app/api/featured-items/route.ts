import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { parseYahooTimeRaw } from '@/lib/utils';

// 日本の多様な人気・注目商品の検索キーワードプール
const FEATURED_SEARCH_KEYWORDS = [
  'BBS 18インチ ホイール',
  'SEIKO プロスペックス',
  'シマノ ステラ',
  'G-SHOCK CASIO',
  'ポケモンカード SAR',
  'PG ガンプラ 1/60',
  'マキタ 18V インパクト',
  'Gibson レスポール',
  'Fender Japan ストラトキャスター',
  'Canon EOS R',
  'SONY α7',
  'ダイワ イグジスト',
  'ONE PIECE フィギュア コレクション',
  'ブレンボ キャリパー',
  'RECARO セミバケ',
  'WORK エモーション 18',
  'RAYS TE37',
  'CITIZEN プロマスター',
  'タミヤ 1/10 ラジコン',
  'Nikon Z マウント'
];

// 万が一Yahooオークション側へのアクセスが遮断・遅延した際のフォールバック用実商品データ
const FALLBACK_FEATURED_ITEMS = [
  {
    id: 'bbs_lm_fallback',
    titleJa: 'BBS LM 18インチ 鍛造2ピース PCD114.3 8.5J/9.5J 4本セット',
    title: 'BBS LM 18" Rodas Forjadas 2 Peças PCD114.3',
    url: 'https://auctions.yahoo.co.jp/search/search?p=BBS+LM+18%E3%82%A4%E3%83%B3%E3%83%81',
    imageUrl: 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=500&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=500&auto=format&fit=crop&q=80'],
    currentPrice: 135000,
    bids: 18,
    timeLeft: '2d 5h',
    badge: 'JDM'
  },
  {
    id: 'seiko_prospex_fallback',
    titleJa: 'SEIKO PROSPEX ダイバースキューバ SBDC101 自動巻き',
    title: 'Seiko Prospex Diver Scuba Automático SBDC101',
    url: 'https://auctions.yahoo.co.jp/search/search?p=SEIKO+PROSPEX',
    imageUrl: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=500&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=500&auto=format&fit=crop&q=80'],
    currentPrice: 62000,
    bids: 9,
    timeLeft: '1d 12h',
    badge: 'Watch'
  },
  {
    id: 'shimano_stella_fallback',
    titleJa: 'シマノ 22 ステラ C3000XG スピニングリール 極美品',
    title: 'Shimano Stella C3000XG Molinete Premium',
    url: 'https://auctions.yahoo.co.jp/search/search?p=SHIMANO+STELLA',
    imageUrl: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=500&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=500&auto=format&fit=crop&q=80'],
    currentPrice: 78000,
    bids: 14,
    timeLeft: '3d 8h',
    badge: 'Fishing'
  },
  {
    id: 'fender_strat_fallback',
    titleJa: 'Fender Japan Traditional 60s Stratocaster 3TS 美品',
    title: 'Fender Japan Traditional 60s Stratocaster Guitar',
    url: 'https://auctions.yahoo.co.jp/search/search?p=Fender+Japan+Stratocaster',
    imageUrl: 'https://images.unsplash.com/photo-1525994886773-080587e161c2?w=500&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1525994886773-080587e161c2?w=500&auto=format&fit=crop&q=80'],
    currentPrice: 95000,
    bids: 7,
    timeLeft: '4d 2h',
    badge: 'Music'
  },
  {
    id: 'pg_gundam_fallback',
    titleJa: 'バンダイ PG 1/60 UNLEASHED RX-78-2 ガンダム 未組立',
    title: 'Bandai PG 1/60 Perfect Grade Unleashed Gundam',
    url: 'https://auctions.yahoo.co.jp/search/search?p=PG+%E3%82%AC%E3%83%B3%E3%83%80%E3%83%A0',
    imageUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=500&auto=format&fit=crop&q=80',
    images: ['https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=500&auto=format&fit=crop&q=80'],
    currentPrice: 28500,
    bids: 21,
    timeLeft: '1d 4h',
    badge: 'Hobby'
  }
];

// 短時間のインメモリキャッシュ（60秒間有効）
interface CacheEntry {
  timestamp: number;
  items: any[];
}
const cache: Record<string, CacheEntry> = {};
const CACHE_DURATION_MS = 60 * 1000;

// Yahooオークションのキーワード検索からスクレイピングしてアイテム一覧を取得
async function fetchItemsForKeyword(keyword: string): Promise<any[]> {
  const searchUrl = `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(keyword)}&va=${encodeURIComponent(keyword)}&exflg=1&b=1&n=20&s1=score&o1=d`;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  
  try {
    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(timeout);
    
    if (!response.ok) return [];
    
    const html = await response.text();
    const $ = cheerio.load(html);
    const results: any[] = [];
    
    // パターン1: 検索結果ページ (.Product, .Product__item)
    $('.Product, .Product__item').each((i, el) => {
      const $el = $(el);
      
      // PR広告商品を除外
      if (
        $el.hasClass('Product--pr') ||
        $el.find('span.Product__label--pr').length > 0 ||
        $el.find('[class*="--pr"]').length > 0 ||
        $el.text().includes('ストアPR') ||
        $el.find('span:contains("PR")').length > 0
      ) {
        return;
      }
      
      const title = $el.find('.Product__titleLink, .item__titleLink').text().trim();
      const url = $el.find('.Product__titleLink, .item__titleLink').attr('href');
      const dataClParams = $el.find('.Product__titleLink, .item__titleLink').attr('data-cl-params') || '';
      let imageUrl = $el.find('.Product__imageData, .item__imageData').attr('src') || $el.find('img').attr('src');
      
      if (!imageUrl || imageUrl.includes('blank.gif')) {
        imageUrl = $el.find('img').attr('data-original') || $el.find('img').attr('data-src') || $el.find('img').attr('src');
      }
      
      const priceText = $el.find('.Product__priceValue, .item__priceValue').first().text().replace(/[^\d]/g, '');
      let price = parseInt(priceText) || 0;
      const taxMatch = $el.text().match(/税込.*?([\d,]+)\s*円/);
      if (taxMatch) {
        const taxPrice = parseInt(taxMatch[1].replace(/,/g, ''));
        if (taxPrice > price) price = taxPrice;
      }
      
      const bids = parseInt($el.find('.Product__bid, .item__bid').text()) || 0;
      const timeLeftRaw = $el.find('.Product__time, .item__time, .time, .date').text().trim();
      let timeLeft = parseYahooTimeRaw(timeLeftRaw);
      
      let endTimeISO = '';
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
      const id = productIdMatch ? productIdMatch[1] : '';
      
      if (id && title && url && imageUrl && price > 0) {
        results.push({
          id,
          title,
          titleJa: title,
          url,
          imageUrl,
          images: [imageUrl],
          currentPrice: price,
          bids,
          timeLeft,
          endTime: endTimeISO,
          source: 'yahoo_search'
        });
      }
    });
    
    // パターン2: カテゴリ型ページフォールバック
    if (results.length === 0) {
      $('.item, .s_item, .sdc, .lb-item').each((i, el) => {
        const $el = $(el);
        if ($el.hasClass('item--pr') || $el.text().includes('ストアPR')) return;
        
        const title = $el.find('.item__titleLink, .s_item__titleLink, .sdc__title').text().trim();
        const url = $el.find('.item__titleLink, .s_item__titleLink, .sdc__link').attr('href');
        let imageUrl = $el.find('.item__imageData, .s_item__imageData, .sdc__image, img').attr('src');
        if (!imageUrl || imageUrl.includes('blank.gif')) {
          imageUrl = $el.find('img').attr('data-original') || $el.find('img').attr('data-src');
        }
        const priceText = $el.find('.item__priceValue, .s_item__priceValue, .sdc__price').first().text().replace(/[^\d]/g, '');
        const price = parseInt(priceText) || 0;
        const bids = parseInt($el.find('.item__bid, .s_item__bid, .sdc__bid').text()) || 0;
        const timeLeftRaw = $el.find('.item__time, .sdc-time, .time').text().trim();
        const timeLeft = parseYahooTimeRaw(timeLeftRaw);
        
        const productIdMatch = url?.match(/\/auction\/([a-z0-9]+)/);
        const id = productIdMatch ? productIdMatch[1] : '';
        
        if (id && title && url && imageUrl && price > 0) {
          results.push({
            id,
            title,
            titleJa: title,
            url,
            imageUrl,
            images: [imageUrl],
            currentPrice: price,
            bids,
            timeLeft,
            source: 'yahoo_category'
          });
        }
      });
    }
    
    return results;
  } catch (err) {
    clearTimeout(timeout);
    console.error(`Failed to fetch items for keyword "${keyword}":`, err);
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lang = searchParams.get('lang') || 'es';
  const count = parseInt(searchParams.get('count') || '10', 10);
  
  const cacheKey = `${lang}_${count}`;
  const now = Date.now();
  
  if (cache[cacheKey] && now - cache[cacheKey].timestamp < CACHE_DURATION_MS) {
    return NextResponse.json({ items: cache[cacheKey].items });
  }
  
  try {
    // ランダムに3〜4つの異なるジャンルのキーワードを選択
    const shuffledKeywords = [...FEATURED_SEARCH_KEYWORDS].sort(() => 0.5 - Math.random());
    const selectedKeywords = shuffledKeywords.slice(0, 4);
    
    // 並列でYahoo!オークションから実際に出品されている商品を検索
    const fetchedResults = await Promise.all(
      selectedKeywords.map((kw) => fetchItemsForKeyword(kw))
    );
    
    let combinedItems: any[] = [];
    fetchedResults.forEach((itemList) => {
      // 各キーワードから先頭4〜5件を抽出
      combinedItems.push(...itemList.slice(0, 5));
    });
    
    // IDの重複排除
    const seenIds = new Set<string>();
    combinedItems = combinedItems.filter((item) => {
      if (!item.id || seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      return true;
    });
    
    // ランダムにシャッフル
    combinedItems = combinedItems.sort(() => 0.5 - Math.random());
    
    // 指定件数（デフォルト10件）に絞り込み
    let finalItems = combinedItems.slice(0, count);
    
    // 万一スクレイピング結果が極端に少なかった場合はフォールバックを追加
    if (finalItems.length < 5) {
      const fallbackShuffled = [...FALLBACK_FEATURED_ITEMS].sort(() => 0.5 - Math.random());
      finalItems.push(...fallbackShuffled.slice(0, count - finalItems.length));
    }
    
    // タイトルの自動翻訳（日本語以外の言語の場合）
    if (finalItems.length > 0 && lang !== 'ja') {
      const controllerTranslate = new AbortController();
      const timeoutTranslate = setTimeout(() => controllerTranslate.abort(), 5000);
      try {
        const titlesToTranslate = finalItems.map((item, idx) => `=== ${idx} ===\n${item.titleJa || item.title}`).join('\n');
        const translateRes = await fetch(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=${lang}&dt=t`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ q: titlesToTranslate }).toString(),
            signal: controllerTranslate.signal
          }
        );
        const translateData = await translateRes.json();
        
        if (translateData && translateData[0]) {
          let fullTranslatedText = '';
          for (let i = 0; i < translateData[0].length; i++) {
            fullTranslatedText += translateData[0][i][0];
          }
          
          const regex = /===\s*(\d+)\s*===([^=]+)/g;
          let match;
          while ((match = regex.exec(fullTranslatedText)) !== null) {
            const index = parseInt(match[1], 10);
            const text = match[2].replace(/^[\s\n]+/, '').trim();
            if (index >= 0 && index < finalItems.length && text) {
              finalItems[index].title = text;
            }
          }
        }
      } catch (transErr) {
        console.warn('Featured items translation error:', transErr);
      } finally {
        clearTimeout(timeoutTranslate);
      }
    }
    
    // キャッシュ保存
    cache[cacheKey] = {
      timestamp: now,
      items: finalItems
    };
    
    return NextResponse.json({ items: finalItems });
  } catch (error) {
    console.error('Featured items fetch error:', error);
    return NextResponse.json({ items: FALLBACK_FEATURED_ITEMS });
  }
}
