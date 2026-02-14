import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const lang = searchParams.get('lang') || 'es';
  
  if (!query) {
    return NextResponse.json({ error: 'Search query required' }, { status: 400 });
  }

  try {
    // Yahoo!オークションの検索URL（スクレイピング用）
    // 注：実際の運用では、より適切な方法を使用する必要があります
    const yahooUrl = `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(query)}&n=50`;
    
    // デモ用のサンプルデータ
    const sampleProducts = [
      {
        id: '1001',
        title: query.includes('カメラ') || query.includes('camera') 
          ? 'Canon EOS R6 ボディ' 
          : `${query} - サンプル商品 1`,
        currentPrice: 150000,
        bids: 12,
        endTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        imageUrl: 'https://via.placeholder.com/300x200?text=Product+1',
        url: 'https://auctions.yahoo.co.jp/item/1001'
      },
      {
        id: '1002',
        title: query.includes('カメラ') || query.includes('camera')
          ? 'Nikon Z6 II レンズキット'
          : `${query} - サンプル商品 2`,
        currentPrice: 180000,
        bids: 8,
        endTime: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
        imageUrl: 'https://via.placeholder.com/300x200?text=Product+2',
        url: 'https://auctions.yahoo.co.jp/item/1002'
      },
      {
        id: '1003',
        title: query.includes('カメラ') || query.includes('camera')
          ? 'Sony α7 IV ボディ'
          : `${query} - サンプル商品 3`,
        currentPrice: 220000,
        bids: 15,
        endTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        imageUrl: 'https://via.placeholder.com/300x200?text=Product+3',
        url: 'https://auctions.yahoo.co.jp/item/1003'
      }
    ];

    return NextResponse.json({
      products: sampleProducts,
      query,
      language: lang
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}