/**
 * 翻訳ユーティリティモジュール
 * インメモリキャッシュ + Gemini 2.5 Flash Lite による超高速・高品質なバッチ翻訳
 */

import { notifyAdminError, hasJapaneseCharacters } from '@/lib/error-notifier';

// 超高速・高スループットモデルを最優先
const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];

// 翻訳結果のインメモリキャッシュ (Key: `${targetLang}:${sourceText}`)
const translationMemoryCache = new Map<string, string>();
const MAX_CACHE_SIZE = 10000;

function getCachedTranslation(text: string, targetLang: string): string | undefined {
  if (!text) return text;
  return translationMemoryCache.get(`${targetLang}:${text.trim()}`);
}

function setCachedTranslation(text: string, targetLang: string, translated: string) {
  if (!text || !translated) return;
  if (translationMemoryCache.size >= MAX_CACHE_SIZE) {
    // 古いエントリを間引く
    const firstKey = translationMemoryCache.keys().next().value;
    if (firstKey) translationMemoryCache.delete(firstKey);
  }
  translationMemoryCache.set(`${targetLang}:${text.trim()}`, translated.trim());
}

/**
 * 単一タイトルの翻訳
 */
export async function translateTitle(title: string, targetLang: string): Promise<string> {
  if (!title || targetLang === 'ja') return title;
  const cached = getCachedTranslation(title, targetLang);
  if (cached) return cached;

  const results = await batchTranslateTitles([title], targetLang);
  return results[0] || title;
}

/**
 * 複数商品タイトルの一括高速翻訳
 * インメモリキャッシュを最優先参照し、未翻訳分のみを Gemini で並列バッチ翻訳
 * @param titles 翻訳対象のタイトル配列
 * @param targetLang 翻訳先言語（'es' または 'pt' 等）
 * @returns 翻訳されたタイトル配列（元の配列と同じ長さ・順序）
 */
export async function batchTranslateTitles(titles: string[], targetLang: string): Promise<string[]> {
  if (!titles || titles.length === 0 || targetLang === 'ja') {
    return titles || [];
  }

  const results: string[] = new Array(titles.length);
  const uncachedIndices: number[] = [];
  const uncachedTitles: string[] = [];

  // 1. キャッシュヒット確認
  titles.forEach((title, idx) => {
    if (!title || typeof title !== 'string') {
      results[idx] = '';
      return;
    }
    const cached = getCachedTranslation(title, targetLang);
    if (cached) {
      results[idx] = cached;
    } else {
      uncachedIndices.push(idx);
      uncachedTitles.push(title);
    }
  });

  // 全てキャッシュヒットしていたら即時返却 (0ms)
  if (uncachedTitles.length === 0) {
    return results;
  }

  // 2. 未キャッシュ分のチャンク分割並列翻訳 (10件/チャンクで高速並列処理)
  const apiKey = process.env.GEMINI_API_KEY;
  const CHUNK_SIZE = 10;
  const chunkPromises: Promise<string[]>[] = [];

  for (let i = 0; i < uncachedTitles.length; i += CHUNK_SIZE) {
    const chunk = uncachedTitles.slice(i, i + CHUNK_SIZE);
    chunkPromises.push(
      translateChunkWithFallback(chunk, targetLang, apiKey)
    );
  }

  const chunkResults = await Promise.all(chunkPromises);
  const translatedUncached = chunkResults.flat();

  // 日本語残存・未翻訳タイトルの収集
  const failedTitles: { original: string; translated: string }[] = [];

  // 結果のマッピングとキャッシュ保存
  uncachedIndices.forEach((origIdx, i) => {
    const origTitle = uncachedTitles[i];
    const transTitle = (translatedUncached && translatedUncached[i]) ? translatedUncached[i] : origTitle;
    results[origIdx] = transTitle;

    // 日本語残存チェック（ターゲット言語がes/ptで、結果に日本語が含まれているか未翻訳のまま）
    if (targetLang !== 'ja' && origTitle && origTitle.length > 3) {
      if (hasJapaneseCharacters(transTitle) || transTitle === origTitle) {
        failedTitles.push({ original: origTitle, translated: transTitle });
      }
    }

    if (transTitle && transTitle !== origTitle && !hasJapaneseCharacters(transTitle)) {
      setCachedTranslation(origTitle, targetLang, transTitle);
    }
  });

  // 翻訳エラー・日本語残存が検知された場合は非同期で管理者に通知（スロットリング付き）
  if (failedTitles.length > 0) {
    notifyAdminError({
      category: 'translation',
      title: `商品タイトルの${targetLang.toUpperCase()}翻訳エラー（日本語残存/未翻訳検知）`,
      message: `${failedTitles.length}件の商品タイトルの翻訳において、日本語が残存しているか翻訳に失敗した可能性があります。`,
      details: {
        targetLang,
        failedCount: failedTitles.length,
        sampleFailures: failedTitles.slice(0, 5)
      },
      severity: 'warning',
      throttleKey: `translation:${targetLang}:${failedTitles[0]?.original?.substring(0, 20)}`
    }).catch(e => console.error('Failed to notify translation error:', e));
  }

  return results;
}

/**
 * 1チャンク（最大10件）の高速翻訳 + 多重フォールバック
 */
async function translateChunkWithFallback(chunk: string[], targetLang: string, apiKey?: string): Promise<string[]> {
  if (apiKey) {
    const geminiResult = await translateWithGeminiBatch(chunk, targetLang, apiKey);
    if (geminiResult && geminiResult.length === chunk.length) {
      return geminiResult;
    }
  }

  // GTX バッチフォールバック
  const gtxResult = await translateWithGtxBatch(chunk, targetLang);
  if (gtxResult && gtxResult.length === chunk.length) {
    return gtxResult;
  }

  // 個別 MyMemory フォールバック
  try {
    const memoryResults = await Promise.all(
      chunk.map(t => translateWithMyMemory(t, targetLang, 'ja').catch(() => t))
    );
    return memoryResults;
  } catch {
    return chunk;
  }
}

/**
 * 単一テキストの翻訳（説明文やキーワード検索クエリ用）
 */
export async function translateText(text: string, targetLang: string, sourceLang: string = 'ja'): Promise<string> {
  if (!text || targetLang === sourceLang) return text;

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const targetLangName = targetLang === 'es' ? 'Spanish' : targetLang === 'pt' ? 'Portuguese' : targetLang === 'ja' ? 'Japanese' : targetLang;
      const prompt = `Translate the following text into ${targetLangName}. Output ONLY the translated text without any explanation or quotes.\n\nText:\n${text}`;

      for (const model of GEMINI_MODELS) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 6000);
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 2000, temperature: 0.1 }
            }),
            signal: controller.signal
          });
          clearTimeout(timeout);
          if (res.ok) {
            const data = await res.json();
            const translated = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (translated) return translated;
          }
        } catch {}
      }
    } catch {}
  }

  // フォールバック: Google Translate
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    );
    if (res.ok) {
      const data = await res.json();
      const translated = data?.[0]?.map((x: string[]) => x[0]).join('');
      if (translated) return translated.trim();
    }
  } catch {}

  // フォールバック: MyMemory
  try {
    const memoryResult = await translateWithMyMemory(text, targetLang, sourceLang);
    if (memoryResult) return memoryResult;
  } catch {}

  // 全ての翻訳が失敗し、日本語が残存している場合は管理者に通知
  if (targetLang !== 'ja' && sourceLang === 'ja' && hasJapaneseCharacters(text)) {
    notifyAdminError({
      category: 'translation',
      title: `テキスト翻訳の全フォールバック失敗（${targetLang.toUpperCase()}）`,
      message: `Gemini, Google Translate, MyMemory によるテキスト翻訳がすべて失敗し、原文（日本語）が返却されました。`,
      details: {
        targetLang,
        sourceTextSnippet: text.substring(0, 300)
      },
      severity: 'error',
      throttleKey: `translateText:${targetLang}:${text.substring(0, 30)}`
    }).catch(e => console.error('Failed to notify text translation failure:', e));
  }

  return text;
}

/**
 * Gemini API を用いたタイトル一括翻訳内部関数 (1チャンク分)
 */
async function translateWithGeminiBatch(titles: string[], targetLang: string, apiKey: string): Promise<string[] | null> {
  const targetLangName = targetLang === 'es' ? 'Spanish (Español)' : targetLang === 'pt' ? 'Portuguese (Português)' : targetLang;

  const prompt = `You are a professional translator for an e-commerce auction proxy service.
Translate each of the following product titles from Japanese into ${targetLangName}.
Return ONLY a valid JSON array of ${titles.length} translated strings in the EXACT same order and array length as the input.
Do NOT output markdown code fences, backticks, or any explanatory text. Return purely the JSON array.

Input JSON:
${JSON.stringify(titles)}`;

  for (const model of GEMINI_MODELS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 2500,
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (response.ok) {
        const resData = await response.json();
        const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        
        // JSONパース
        let cleanJson = rawText;
        if (cleanJson.startsWith('```json')) {
          cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/```$/, '').trim();
        } else if (cleanJson.startsWith('```')) {
          cleanJson = cleanJson.replace(/^```\s*/, '').replace(/```$/, '').trim();
        }

        const parsed = JSON.parse(cleanJson);
        if (Array.isArray(parsed) && parsed.length === titles.length) {
          return parsed.map((item, idx) => {
            if (typeof item === 'string' && item.trim()) {
              return item.trim();
            }
            return titles[idx];
          });
        }
      }
    } catch (e) {
      // 次のモデルへ
    }
  }
  return null;
}

/**
 * Google Translate (gtx) を用いたタイトル一括翻訳内部関数
 */
async function translateWithGtxBatch(titles: string[], targetLang: string): Promise<string[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const titlesWithMarkers = titles.map((title, idx) => `=== ${idx} ===\n${title}`).join('\n');
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=${targetLang}&dt=t`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        body: new URLSearchParams({ q: titlesWithMarkers }).toString(),
        signal: controller.signal
      }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data[0]) return null;

    let fullTranslatedText = '';
    for (let i = 0; i < data[0].length; i++) {
      fullTranslatedText += data[0][i][0];
    }

    const regex = /===\s*(\d+)\s*===([^=]+)/g;
    let match;
    const result = [...titles];
    let matchedCount = 0;

    while ((match = regex.exec(fullTranslatedText)) !== null) {
      const idx = parseInt(match[1], 10);
      const text = match[2].replace(/^[\s\n]+/, '').trim();
      if (idx >= 0 && idx < titles.length && text) {
        result[idx] = text;
        matchedCount++;
      }
    }

    if (matchedCount > 0) {
      return result;
    }
  } catch (e) {
    console.warn('GTX batch translate error:', e);
  }
  return null;
}

/**
 * MyMemory API による単一テキスト翻訳内部関数
 */
async function translateWithMyMemory(text: string, targetLang: string, sourceLang: string = 'ja'): Promise<string> {
  const shortText = text.substring(0, 500);
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(shortText)}&langpair=${sourceLang}|${targetLang}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  if (res.ok) {
    const data = await res.json();
    if (data?.responseData?.translatedText) {
      return data.responseData.translatedText;
    }
  }
  return text;
}

