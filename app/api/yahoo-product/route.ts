import { NextResponse } from 'next/server';
import { parseJstDateTime, parseDbDateTime } from '@/lib/utils';

// AI要約・翻訳データの高速キャッシュ (6時間TTL)
interface ProductCacheItem {
  aiSummaryEs?: string;
  aiSummaryPt?: string;
  translatedTitleEs?: string;
  translatedTitlePt?: string;
  translatedDescEs?: string;
  translatedDescPt?: string;
  description?: string;
  expiresAt: number;
}

const productAiCache = new Map<string, ProductCacheItem>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6時間

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = body.url;
    const lang = (body.lang || 'es').toLowerCase();
    const skipDescription = body.skipDescription || false;
    const skipAiSummary = body.skipAiSummary || false;

    if (!url || !url.includes('auctions.yahoo.co.jp')) {
      return NextResponse.json(
        { error: 'Invalid Yahoo Auctions URL' },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    clearTimeout(timeoutId);
    const html = await response.text();


    let title = '';
    let currentPrice = 0;
    let bids = 0;
    let imageUrl = 'https://via.placeholder.com/300x200?text=Yahoo+Auction';
    let endTime = null;
    let shippingCost = 0;
    let shippingUnknown = false;
    let allImages: string[] = [];
    let description = '';

    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);

    if (nextDataMatch) {
      try {
        const jsonData = JSON.parse(nextDataMatch[1]);

        const pageProps = jsonData.props?.pageProps;

        if (pageProps) {
          const initialState = pageProps.initialState;

          if (initialState) {

            const itemData = initialState.item?.detail?.item || {};

            // paymentとoptionの中身を確認

            currentPrice = itemData.taxinPrice ||
              itemData.taxinStartPrice ||
              itemData.price ||
              itemData.currentPrice ||
              itemData.currentBidPrice ||
              itemData.startPrice ||
              0;

            bids = itemData.bids ||
              itemData.bidCount ||
              itemData.numberOfBids ||
              itemData.bidders ||
              itemData.bidOrBuy ||
              0;

            title = itemData.title ||
              itemData.name ||
              itemData.productName ||
              '';

            // 全画像URLを取得
            if (Array.isArray(itemData.img)) {
              allImages = itemData.img.map((img: any) => img.image || img.url || img.thumbnail).filter(Boolean);
            } else if (itemData.images) {
              allImages = itemData.images.map((img: any) => img.url || img.image).filter(Boolean);
            } else if (itemData.imageDetail) {
              allImages = itemData.imageDetail.map((img: any) => img.url || img.image).filter(Boolean);
            } else if (itemData.gallery) {
              allImages = itemData.gallery.map((img: any) => img.url || img.image).filter(Boolean);
            } else {
              allImages = [];
            }

            imageUrl = allImages[0] ||
              (typeof itemData.img === 'string' ? itemData.img : '') ||
              itemData.image ||
              itemData.imageUrl ||
              itemData.thumbnail ||
              imageUrl;

            // 説明文の取得：完全な情報を持つ descriptionHtml を最優先で使用する
            if (itemData.descriptionHtml) {
              description = itemData.descriptionHtml
                .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            } else if (itemData.description) {
              if (Array.isArray(itemData.description)) {
                description = itemData.description.filter(Boolean).join('\n');
              } else if (typeof itemData.description === 'string') {
                description = itemData.description;
              }
            }

            // 終了時刻を取得（UNIXタイムスタンプまたはISO文字列）
            if (itemData.endTime) {
              // UNIXタイムスタンプの場合（秒単位）
              if (typeof itemData.endTime === 'number') {
                const parsedDate = new Date(itemData.endTime * 1000);
                if (!isNaN(parsedDate.getTime())) {
                  endTime = parsedDate.toISOString();
                }
              } else if (typeof itemData.endTime === 'string') {
                const parsedDate = parseJstDateTime(itemData.endTime);
                if (parsedDate) {
                  endTime = parsedDate.toISOString();
                } else {
                  endTime = itemData.endTime; // パースできない場合は文字列のまま保持（フォールバック）
                }
              }
            }



            // 送料を取得 - HTMLから直接抽出

            // HTMLから送料を抽出（複数のパターンを試す）
            const shippingPatterns = [
              // シンプルに数字+円を探す（送料の後500文字以内）
              />([\d,]+)円</,
              // カンマ区切りの数字と円
              /([\d,]+)円/,
              // 送料セクション内の金額を探す（最も一般的）
              /送料[^<]*?<[^>]*?>([\d,]+)円/,
              // gv-u-fontWeightBold クラスの中の金額
              /<span[^>]*gv-u-fontWeightBold[^>]*>([\d,]+)円<\/span>/,
              // 送料の後に続く金額（汎用）
              /送料[：:\s]*¥?([\d,]+)\s*円/,
              /配送料[：:\s]*¥?([\d,]+)\s*円/,
              // HTMLタグを含む場合
              /送料[^>]*?>\s*([\d,]+)\s*円/,
            ];

            for (const pattern of shippingPatterns) {
              const match = html.match(pattern);
              if (match && match[1]) {
                const extractedCost = parseInt(match[1].replace(/,/g, ''));
                if (!isNaN(extractedCost) && extractedCost > 0) {
                  shippingCost = extractedCost;
                  shippingUnknown = false;
                  break;
                }
              }
            }

            // 送料無料の場合
            if (itemData.chargeForShipping === 'free') {
              shippingCost = 0;
              shippingUnknown = false;
            }

            // 送料が見つからない場合で、送料無料でもない場合は不明フラグ
            if (shippingCost === 0 && itemData.chargeForShipping !== 'free') {
              shippingUnknown = true;
            }


          }

        }
      } catch {
      }
    }

    if (!title) {
      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (titleMatch) {
        title = titleMatch[1].trim();
      } else {
        const titleTag = html.match(/<title>([^<]+)<\/title>/i);
        if (titleTag) {
          title = titleTag[1].split('-')[0].trim();
        }
      }
    }

    if (imageUrl.includes('placeholder')) {
      const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
      if (ogImageMatch) {
        imageUrl = ogImageMatch[1];
      }
    }

    if (imageUrl && imageUrl.startsWith('/')) {
      imageUrl = 'https://auctions.yahoo.co.jp' + imageUrl;
    }

    const cleanUrl = url.split('?')[0];
    const match1 = cleanUrl.match(/\/([a-zA-Z0-9]+)$/);
    const match2 = cleanUrl.match(/\/item\/([a-zA-Z0-9]+)/);
    const match3 = cleanUrl.match(/auction\/([a-zA-Z0-9]+)/);
    const productId = (match1 && match1[1]) ||
      (match2 && match2[1]) ||
      (match3 && match3[1]) ||
      Date.now().toString();

    // iframeによる商品説明の取得（ヤフオクストア等の「もっと読む」対応）
    let iframeUrl = '';
    const iframeMatches = !skipDescription ? html.match(/<iframe[\s\S]*?>/gi) : null;
    if (iframeMatches) {
      for (const iframeTag of iframeMatches) {
        const srcMatch = iframeTag.match(/src\s*=\s*["']([^"']*)["']/i);
        if (srcMatch) {
          const src = srcMatch[1];
          if (
            src.includes('show/description') ||
            src.includes('auctions.yahoo.co.jp/html') ||
            src.includes('shopping.yahoo.co.jp') ||
            src.includes('auct-store.yahoo') ||
            src.includes('auctions.yahoo.co.jp/jp/show/description')
          ) {
            iframeUrl = src;
            break;
          }
        }
      }
    }

    if (iframeUrl) {
      if (iframeUrl.startsWith('//')) {
        iframeUrl = 'https:' + iframeUrl;
      } else if (iframeUrl.startsWith('/')) {
        iframeUrl = 'https://auctions.yahoo.co.jp' + iframeUrl;
      }
      try {
        const iframeRes = await fetch(iframeUrl, {
          cache: 'no-store',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        const iframeHtml = await iframeRes.text();
        const bodyMatch = iframeHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        let iframeDesc = bodyMatch ? bodyMatch[1] : iframeHtml;
        // スクリプトやスタイル、HTMLタグを除去してプレーンテキスト化
        iframeDesc = iframeDesc
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (iframeDesc && iframeDesc.length > 50) {
          description = iframeDesc;
        }
      } catch (e) {
        console.error('Failed to fetch explanation iframe:', e);
      }
    }

    // 商品の説明文を抽出
    if (!description && !skipDescription) {
      const descriptionMatch = html.match(/<div[^>]*class="ProductDescription__body"[^>]*>([\s\S]*?)<\/div>/i);
      if (descriptionMatch) {
        // タグを除去してテキストのみ抽出（または簡易HTMLとして保持）
        description = descriptionMatch[1].replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').trim();
      } else {
        // 別のパターン
        const descPart = html.match(/<!--\s*description\s*-->([\s\S]*?)<!--\s*\/description\s*-->/i);
        if (descPart) {
          description = descPart[1].trim();
        }
      }
    }

    // 商品IDから既存キャッシュを確認
    const cachedItem = productAiCache.get(productId);
    const now = Date.now();
    const isCacheValid = cachedItem && cachedItem.expiresAt > now;

    let translatedDescription = isCacheValid ? (lang === 'pt' ? cachedItem.translatedDescPt : cachedItem.translatedDescEs) || '' : '';
    let translatedTitle = isCacheValid ? (lang === 'pt' ? cachedItem.translatedTitlePt : cachedItem.translatedTitleEs) || title : title;
    let aiSummaryEs = isCacheValid ? cachedItem.aiSummaryEs || '' : '';
    let aiSummaryPt = isCacheValid ? cachedItem.aiSummaryPt || '' : '';

    // 1. タイトルと説明文の翻訳（キャッシュ未ヒット時のみ実行）
    if (lang !== 'ja') {
      const needTitleTrans = !translatedTitle || translatedTitle === title;
      const needDescTrans = !translatedDescription && description && !skipDescription;

      if (needTitleTrans || needDescTrans) {
        const translatePromises: Promise<void>[] = [];

        if (needDescTrans) {
          const translateDesc = async () => {
            const controllerTranslate = new AbortController();
            const timeoutTranslate = setTimeout(() => controllerTranslate.abort(), 4000);
            try {
              const cleanDesc = description.replace(/<[^>]*>/g, ' ').substring(0, 2000);
              const transRes = await fetch(
                `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=${lang}&dt=t&q=${encodeURIComponent(cleanDesc)}`,
                { signal: controllerTranslate.signal }
              );
              const transData = await transRes.json();
              translatedDescription = transData?.[0]?.map((x: string[]) => x[0]).join('') || '';
            } catch (e) {
              console.error('Description translation error:', e);
            } finally {
              clearTimeout(timeoutTranslate);
            }
          };
          translatePromises.push(translateDesc());
        }

        if (needTitleTrans && title) {
          const translateTitleFn = async () => {
            const controllerTranslate = new AbortController();
            const timeoutTranslate = setTimeout(() => controllerTranslate.abort(), 4000);
            try {
              const transRes = await fetch(
                `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=${lang}&dt=t&q=${encodeURIComponent(title)}`,
                { signal: controllerTranslate.signal }
              );
              const transData = await transRes.json();
              translatedTitle = transData?.[0]?.[0]?.[0] || title;
            } catch (e) {
              console.error('Title translation error:', e);
            } finally {
              clearTimeout(timeoutTranslate);
            }
          };
          translatePromises.push(translateTitleFn());
        }

        if (translatePromises.length > 0) {
          await Promise.all(translatePromises);
        }
      }
    }

    // 2. 顧客の指定言語に応じたAI要約の生成（要求言語のみ高速生成 & キャッシュ活用）
    const targetLangForAi: 'es' | 'pt' = lang === 'pt' ? 'pt' : 'es';
    const needAiEs = targetLangForAi === 'es' && !aiSummaryEs;
    const needAiPt = targetLangForAi === 'pt' && !aiSummaryPt;

    if (description && !skipAiSummary && (needAiEs || needAiPt)) {
      const controllerAi = new AbortController();
      const timeoutAi = setTimeout(() => controllerAi.abort(), 6000);
      try {
        const cleanDesc = description.replace(/<[^>]*>/g, ' ').substring(0, 2500);
        if (needAiEs) {
          aiSummaryEs = await generateAiSummary(cleanDesc, 'es', translatedDescription).catch(err => {
            console.error('Gemini ES Summary error:', err);
            return buildFallbackSummary(translatedDescription || cleanDesc, 'es');
          });
        }
        if (needAiPt) {
          aiSummaryPt = await generateAiSummary(cleanDesc, 'pt', translatedDescription).catch(err => {
            console.error('Gemini PT Summary error:', err);
            return buildFallbackSummary(translatedDescription || cleanDesc, 'pt');
          });
        }
      } catch (e) {
        console.error('AI Summary overall error:', e);
      } finally {
        clearTimeout(timeoutAi);
      }
    }

    // 3. キャッシュの更新
    productAiCache.set(productId, {
      aiSummaryEs: aiSummaryEs || cachedItem?.aiSummaryEs,
      aiSummaryPt: aiSummaryPt || cachedItem?.aiSummaryPt,
      translatedTitleEs: lang === 'es' ? translatedTitle : cachedItem?.translatedTitleEs,
      translatedTitlePt: lang === 'pt' ? translatedTitle : cachedItem?.translatedTitlePt,
      translatedDescEs: lang === 'es' ? translatedDescription : cachedItem?.translatedDescEs,
      translatedDescPt: lang === 'pt' ? translatedDescription : cachedItem?.translatedDescPt,
      description: description || cachedItem?.description,
      expiresAt: now + CACHE_TTL_MS
    });

    // 残り時間の計算 (詳細取得用)
    let timeLeft = '-';
    if (endTime) {
      const parsedEndTime = parseDbDateTime(endTime);
      if (parsedEndTime) {
        const diff = Math.max(0, parsedEndTime.getTime() - Date.now());
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / 1000 / 60) % 60);
        timeLeft = `${d}d ${h}h ${m}m`;
      }
    }

    // カテゴリIDの抽出（パンくずリストのURLからすべてのカテゴリIDを取得してカンマ区切りにする）
    // /category/list/(\d+) と /listX/(\d+)-category.html の両方のパターンに対応
    let categoryId = '';
    const breadcrumbMatches = Array.from(
      html.matchAll(/auctions\.yahoo\.co\.jp\/(?:category\/list\/(\d+)|list\d+\/(\d+)-category\.html)/g)
    );
    const ids = breadcrumbMatches.map(m => m[1] || m[2]).filter(Boolean);

    // 将来的なURLの変更やパンくずリストの構造変化に備え、HTML内の構造データ ("catidX": "xxxxx") からも補助的にカテゴリIDを抽出してマージする
    const catidMatches = Array.from(html.matchAll(/"catid\d+"\s*:\s*"(\d+)"/g));
    if (catidMatches.length > 0) {
      ids.push(...catidMatches.map(m => m[1]));
    }

    if (ids.length > 0) {
      // 重複を排除してカンマ区切りにする
      const uniqueIds = Array.from(new Set(ids));
      categoryId = uniqueIds.join(',');
    }

    const product = {
      id: productId,
      title: translatedTitle || 'タイトル取得失敗',
      currentPrice: currentPrice,
      bids: bids,
      endTime: endTime,
      timeLeft: timeLeft, // 追加
      imageUrl: imageUrl,
      url: url,
      categoryId: categoryId, // カテゴリIDを追加
      source: 'yahoo_url_import',
      shippingCost: shippingCost,
      shippingUnknown: shippingUnknown,
      description: description,
      translatedDescription: translatedDescription,
      titleJa: title,
      images: allImages.length > 0 ? allImages : [imageUrl],
      aiSummaryEs: aiSummaryEs,
      aiSummaryPt: aiSummaryPt
    };


    return NextResponse.json({ product });

  } catch (error) {
    console.error('Error fetching Yahoo product:', error);
    return NextResponse.json(
      { error: 'Failed to fetch product data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function generateAiSummary(description: string, targetLang: 'es' | 'pt', translatedDesc?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return buildFallbackSummary(translatedDesc || description, targetLang);
  }

  const promptEs = `Eres un asistente de compras experto. Tu tarea es traducir y resumir la siguiente descripción de producto en japonés al español.
Genera un resumen conciso usando viñetas (bullet points) en el siguiente formato, basándote únicamente en la información proporcionada (si un dato no está en el texto, escribe "No especificado"):

- **Especificaciones / Detalles**: (tamaño, color, modelo, etc.)
- **Estado del producto**: (daños, suciedad, desgaste, etc.)
- **Funcionamiento**: (si funciona, si no se ha probado, o si es considerado chatarra/junk)
- **Accesorios**: (lo que se incluye en el paquete)
- **Envío**: (empresa de envío o método de envío en Japón, si se indica)

No agregues conclusiones ni comentarios personales. Limítate a resumir los datos reales.

Descripción del producto:
${description}`;

  const promptPt = `Você é um assistente de compras especializado. Sua tarefa é traduzir e resumir a seguinte descrição de produto em japonês para o português.
Gere um resumo conciso usando marcadores (bullet points) no formato a seguir, baseando-se apenas nas informações fornecidas (se uma informação não estiver no texto, escreva "Não especificado"):

- **Especificações / Detalhes**: (tamanho, cor, modelo, etc.)
- **Estado do produto**: (danos, sujeira, desgaste, etc.)
- **Funcionamento**: (se funciona, se não foi testado, ou se é considerado sucata/junk)
- **Acessórios**: (o que está incluído no pacote)
- **Envío**: (empresa de envio ou método de envio no Japão, se indicado)

Não adicione conclusões ou comentários pessoais. Limite-se a resumir os dados reais.

Descrição do produto:
${description}`;

  const prompt = targetLang === 'es' ? promptEs : promptPt;
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.2
          }
        })
      });

      if (response.ok) {
        const resData = await response.json();
        const text = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && text.trim()) {
          return text.trim();
        }
      } else {
        const errBody = await response.text();
        console.warn(`Gemini model ${model} status ${response.status}:`, errBody.substring(0, 200));
      }
    } catch (e) {
      console.warn(`Gemini model ${model} fetch error:`, e);
    }
  }

  return buildFallbackSummary(translatedDesc || description, targetLang);
}

function buildFallbackSummary(text: string, targetLang: 'es' | 'pt'): string {
  const clean = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const snippet = clean.substring(0, 800);

  if (targetLang === 'pt') {
    return `- **Especificações / Detalhes**: Consulte a descrição do produto\n- **Estado do produto**: Verifique o texto e fotos\n- **Resumo da Descrição**: ${snippet}`;
  } else {
    return `- **Especificaciones / Detalles**: Consulte la descripción del producto\n- **Estado del producto**: Revise el texto y las fotos\n- **Resumen de la Descripción**: ${snippet}`;
  }
}