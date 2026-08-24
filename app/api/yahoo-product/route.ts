export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { parseJstDateTime, parseDbDateTime, parseAnyDateTime } from '@/lib/utils';
import { translateTitle, translateText } from '@/lib/translate';

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
    const forceRefresh = body.forceRefresh || body.refresh || false;

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
    let isClosedItem = false;
    let isEndedHtml = html.includes('終了しました') ||
      html.includes('オークションは終了しました') ||
      html.includes('このオークションは終了しています') ||
      html.includes('即決価格で落札') ||
      html.includes('早期終了') ||
      html.includes('落札者あり');

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
              itemData.bidOrBuy ||
              itemData.buyPrice ||
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
                const parsedDate = parseJstDateTime(itemData.endTime) || parseDbDateTime(itemData.endTime);
                if (parsedDate) {
                  endTime = parsedDate.toISOString();
                } else {
                  endTime = itemData.endTime; // パースできない場合は文字列のまま保持（フォールバック）
                }
              }
            }

            // 終了判定
            isClosedItem = itemData.isClosed === true || itemData.status === 'closed' || itemData.status === 'ended';

            if (isClosedItem || isEndedHtml) {
              const parsedDate = endTime ? parseAnyDateTime(endTime) : null;
              if (!endTime || (parsedDate && parsedDate.getTime() > Date.now())) {
                endTime = new Date().toISOString();
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

    // forceRefreshが指定されている場合は該当商品の古いキャッシュを消去
    if (forceRefresh) {
      productAiCache.delete(productId);
    }

    // 商品IDから既存キャッシュを確認（フォールバック用文面や日本語が残っているキャッシュは無効化して再生成）
    const cachedItem = productAiCache.get(productId);
    const now = Date.now();
    const isCacheValid = cachedItem && cachedItem.expiresAt > now;

    let translatedDescription = isCacheValid ? (lang === 'pt' ? cachedItem.translatedDescPt : cachedItem.translatedDescEs) || '' : '';
    let translatedTitle = isCacheValid ? (lang === 'pt' ? cachedItem.translatedTitlePt : cachedItem.translatedTitleEs) || title : title;

    const isRealSummary = (s?: string) => {
      if (!s || s.length < 20) return false;
      if (s.includes('Consulte os detalhes') || s.includes('Consulte los detalles') || s.includes('Resumo:') || s.includes('Resumen:')) return false;
      return true;
    };

    let aiSummaryEs = isCacheValid && isRealSummary(cachedItem.aiSummaryEs) ? cachedItem.aiSummaryEs || '' : '';
    let aiSummaryPt = isCacheValid && isRealSummary(cachedItem.aiSummaryPt) ? cachedItem.aiSummaryPt || '' : '';

    // 1. タイトル翻訳とAI要約を最優先・完全並列実行 (超高速化)
    const targetLangForAi: 'es' | 'pt' = lang === 'pt' ? 'pt' : 'es';
    const needAi = !skipAiSummary && description && ((targetLangForAi === 'es' && !aiSummaryEs) || (targetLangForAi === 'pt' && !aiSummaryPt));
    const needTitleTrans = lang !== 'ja' && (!translatedTitle || translatedTitle === title) && title;

    const parallelTasks: Promise<void>[] = [];

    // タイトル高速翻訳タスク
    if (needTitleTrans) {
      parallelTasks.push(
        translateTitle(title, lang)
          .then((trans) => { if (trans) translatedTitle = trans; })
          .catch((e) => { console.error('Title translation error:', e); })
      );
    }

    // AI要約高速生成タスク (Gemini 2.5 Flash Lite で 1〜2秒生成)
    if (needAi) {
      const cleanDesc = description.replace(/<[^>]*>/g, ' ').substring(0, 3000);
      parallelTasks.push(
        generateAiSummary(cleanDesc, targetLangForAi)
          .then((summary) => {
            if (targetLangForAi === 'es') aiSummaryEs = summary;
            else aiSummaryPt = summary;
          })
          .catch(async (err) => {
            console.error(`Gemini ${targetLangForAi.toUpperCase()} Summary error:`, err);
            const fallback = await buildFallbackSummary(cleanDesc, targetLangForAi);
            if (targetLangForAi === 'es') aiSummaryEs = fallback;
            else aiSummaryPt = fallback;
          })
      );
    }

    if (parallelTasks.length > 0) {
      await Promise.all(parallelTasks);
    }

    // AI要約がどうしても失敗した場合のみ、説明文のGoogle翻訳をフォールバック実行
    const currentAiSummary = targetLangForAi === 'es' ? aiSummaryEs : aiSummaryPt;
    if (lang !== 'ja' && description && !skipDescription && !translatedDescription && (!isRealSummary(currentAiSummary))) {
      try {
        const cleanDesc = description.replace(/<[^>]*>/g, ' ').substring(0, 2000);
        translatedDescription = await translateText(cleanDesc, lang, 'ja');
      } catch (e) {
        console.error('Fallback description translation error:', e);
      }
    }

    // 2. キャッシュの更新（本物のAI要約のみキャッシュに記憶し、フォールバック文面はキャッシュしない）
    productAiCache.set(productId, {
      aiSummaryEs: isRealSummary(aiSummaryEs) ? aiSummaryEs : (isRealSummary(cachedItem?.aiSummaryEs) ? cachedItem?.aiSummaryEs : undefined),
      aiSummaryPt: isRealSummary(aiSummaryPt) ? aiSummaryPt : (isRealSummary(cachedItem?.aiSummaryPt) ? cachedItem?.aiSummaryPt : undefined),
      translatedTitleEs: lang === 'es' ? translatedTitle : cachedItem?.translatedTitleEs,
      translatedTitlePt: lang === 'pt' ? translatedTitle : cachedItem?.translatedTitlePt,
      translatedDescEs: lang === 'es' ? translatedDescription : cachedItem?.translatedDescEs,
      translatedDescPt: lang === 'pt' ? translatedDescription : cachedItem?.translatedDescPt,
      description: description || cachedItem?.description,
      expiresAt: now + CACHE_TTL_MS
    });

    // 残り時間の計算 (詳細取得用)
    let timeLeft = '-';
    if (isClosedItem || isEndedHtml) {
      timeLeft = lang === 'ja' ? '終了' : 'Finalizado';
    } else if (endTime) {
      const parsedEndTime = parseAnyDateTime(endTime);
      if (parsedEndTime) {
        const diff = Math.max(0, parsedEndTime.getTime() - Date.now());
        if (diff === 0) {
          timeLeft = lang === 'ja' ? '終了' : 'Finalizado';
        } else {
          const d = Math.floor(diff / (1000 * 60 * 60 * 24));
          const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
          const m = Math.floor((diff / 1000 / 60) % 60);
          timeLeft = `${d}d ${h}h ${m}m`;
        }
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

    const finalAiSummaryEs = aiSummaryEs || (isRealSummary(cachedItem?.aiSummaryEs) ? cachedItem?.aiSummaryEs : '') || '';
    const finalAiSummaryPt = aiSummaryPt || (isRealSummary(cachedItem?.aiSummaryPt) ? cachedItem?.aiSummaryPt : '') || '';

    const isFinished = isClosedItem || isEndedHtml || (endTime ? (parseAnyDateTime(endTime)?.getTime() || 0) <= Date.now() : false);

    const product = {
      id: productId,
      title: translatedTitle || 'タイトル取得失敗',
      currentPrice: currentPrice,
      bids: bids,
      endTime: endTime,
      timeLeft: timeLeft, // 追加
      isClosed: isFinished,
      isEnded: isFinished,
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
      aiSummaryEs: finalAiSummaryEs,
      aiSummaryPt: finalAiSummaryPt
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
    return await buildFallbackSummary(translatedDesc || description, targetLang);
  }

  // 翻訳済みまたは原文の説明文を使用
  const textToSummarize = (translatedDesc && translatedDesc.length > 50) ? translatedDesc : description;

  const promptEs = `Eres un asistente de compras internacional experto para clientes de habla hispana en una plataforma de subastas de Yahoo! Japón.
Tu tarea es traducir y resumir de forma clara, profesional y 100% en ESPAÑOL la siguiente descripción de producto.

REGLAS CRÍTICAS:
1. Debes redactar TODO absolutamente en ESPAÑOL. No incluyas ningún carácter en japonés (kanji, hiragana, katakana).
2. Estructura el resumen EXACTAMENTE con los siguientes 5 bloques separados por un salto de línea entre cada uno, usando viñetas claras:

• **Especificaciones / Detalles**:
(marca, modelo, dimensiones, color, material, etc. Si no se indica, escribe "No especificado")

• **Estado del producto**:
(usado/nuevo, presencia de rayones, abolladuras, desgaste, manchas, etc.)

• **Funcionamiento**:
(probado y funcionando, sin probar, para repuestos / chatarra / junk, etc.)

• **Accesorios incluidos**:
(caja, cables, manuales o solo el artículo principal)

• **Envío en Japón**:
(detalles de envío si se mencionan en la descripción)

3. No incluyas saludos ni despedidas. Solo los 5 bloques con viñetas en español.

Descripción del producto:
${textToSummarize}`;

  const promptPt = `Você é um assistente de compras internacional especializado para clientes lusófonos em uma plataforma de leilões do Yahoo! Japão.
Sua tarefa é traduzir e resumir de forma clara, profissional e 100% em PORTUGUÊS a seguinte descrição de produto.

REGRAS CRÍTICAS:
1. Você deve redigir TUDO absolutamente em PORTUGUÊS. Não inclua nenhum caractere em japonês (kanji, hiragana, katakana).
2. Estruture o resumo EXATAMENTE com os seguintes 5 blocos separados por uma linha em branco entre cada um, usando marcadores claros:

• **Especificações / Detalhes**:
(marca, modelo, dimensões, cor, material, etc. Se não constar, escreva "Não especificado")

• **Estado do produto**:
(usado/novo, presença de riscos, amassados, desgaste, manchas, etc.)

• **Funcionamento**:
(testado e funcionando, não testado, para peças / sucata / junk, etc.)

• **Acessórios incluídos**:
(caixa, cabos, manuais ou apenas o item principal)

• **Envio no Japão**:
(detalhes de envio se mencionados na descrição)

3. Não inclua saudações nem despedidas. Apenas os 5 blocos com marcadores em português.

Descrição do produto:
${textToSummarize}`;

  const prompt = targetLang === 'es' ? promptEs : promptPt;
  const models = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];

  for (const model of models) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

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
            maxOutputTokens: 2000,
            temperature: 0.2
          }
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (response.ok) {
        const resData = await response.json();
        const text = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && text.trim() && text.length > 20) {
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

  return await buildFallbackSummary(translatedDesc || description, targetLang);
}

async function buildFallbackSummary(text: string, targetLang: 'es' | 'pt'): Promise<string> {
  let clean = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  let snippet = clean.substring(0, 800);

  // 日本語文字が含まれている場合は translateText で確実に翻訳
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(snippet)) {
    try {
      const translated = await translateText(snippet, targetLang, 'ja');
      if (translated && !/[\u3040-\u30ff\u4e00-\u9faf]/.test(translated)) {
        snippet = translated;
      }
    } catch (e) {
      console.error('Fallback snippet translate error:', e);
    }
  }

  if (targetLang === 'pt') {
    return `• **Especificações / Detalhes**:\nConsulte a descrição traduzida\n\n• **Estado do produto**:\nVerifique as fotos e o texto do anúncio\n\n• **Resumo da Descrição**:\n${snippet}`;
  } else {
    return `• **Especificaciones / Detalles**:\nConsulte la descripción traducida\n\n• **Estado del producto**:\nRevise las fotos y el texto del anuncio\n\n• **Resumen de la Descripción**:\n${snippet}`;
  }
}