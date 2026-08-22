/**
 * 翻訳ユーティリティモジュール
 * Gemini API（最新モデル）による高速・高品質なバッチ翻訳および多重フォールバックを提供
 */

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-3.6-flash'];

/**
 * 単一タイトルの翻訳
 */
export async function translateTitle(title: string, targetLang: string): Promise<string> {
  if (!title || targetLang === 'ja') return title;
  const results = await batchTranslateTitles([title], targetLang);
  return results[0] || title;
}

/**
 * 複数商品タイトルの一括高速翻訳
 * @param titles 翻訳対象のタイトル配列
 * @param targetLang 翻訳先言語（'es' または 'pt' 等）
 * @returns 翻訳されたタイトル配列（元の配列と同じ長さ・順序）
 */
export async function batchTranslateTitles(titles: string[], targetLang: string): Promise<string[]> {
  if (!titles || titles.length === 0 || targetLang === 'ja') {
    return titles || [];
  }

  // 1. Gemini API による一括翻訳
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const geminiResult = await translateWithGeminiBatch(titles, targetLang, apiKey);
    if (geminiResult && geminiResult.length === titles.length) {
      return geminiResult;
    }
  }

  // 2. Google Translate (gtx) によるバッチ翻訳フォールバック
  const gtxResult = await translateWithGtxBatch(titles, targetLang);
  if (gtxResult && gtxResult.length === titles.length) {
    return gtxResult;
  }

  // 3. MyMemory API による個別フォールバック（重要タイトルまたは短縮処理）
  try {
    const fallbackResults = await Promise.all(
      titles.map(async (t) => {
        if (!t) return t;
        return await translateWithMyMemory(t, targetLang, 'ja').catch(() => t);
      })
    );
    return fallbackResults;
  } catch {
    return titles;
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
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 2000, temperature: 0.1 }
            })
          });
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

  return text;
}

/**
 * Gemini API を用いたタイトル一括翻訳内部関数
 */
async function translateWithGeminiBatch(titles: string[], targetLang: string, apiKey: string): Promise<string[] | null> {
  const targetLangName = targetLang === 'es' ? 'Spanish (Español)' : targetLang === 'pt' ? 'Portuguese (Português)' : targetLang;

  // JSON 配列としてリクエスト
  const prompt = `You are a professional translator for an e-commerce auction proxy service.
Translate each of the following product titles from Japanese into ${targetLangName}.
Return ONLY a valid JSON array of translated strings in the EXACT same order and array length as the input.
Do NOT output markdown code fences, backticks, or any explanatory text. Return purely the JSON array.

Input JSON:
${JSON.stringify(titles)}`;

  for (const model of GEMINI_MODELS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 4000,
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
      console.warn(`Gemini batch translate failed with model ${model}:`, e);
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

