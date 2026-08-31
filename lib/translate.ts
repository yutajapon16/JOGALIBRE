/**
 * 翻訳ユーティリティモジュール
 * インメモリキャッシュ + Gemini 2.5 Flash Lite による超高速・高品質なバッチ翻訳
 */

import { notifyAdminError, hasJapaneseCharacters, ErrorUserInfo } from '@/lib/error-notifier';


// 現在利用可能な公式の超高速・高スループット安定モデルを最速順に設定
const GEMINI_MODELS = [
  'gemini-3.5-flash-lite', // 最速 (約800ms)
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-2.5-flash',
  'gemini-flash-latest'
];


// 1. 英語＋カタカナ・漢字の重複パターン除去（例: SONY ソニー -> SONY, ソニー SONY -> SONY）
const BRAND_DUPLICATE_RULES: { pattern: RegExp; replacement: string }[] = [
  // アウトドア・キャンプ
  { pattern: /(?:COLEMAN\s*コールマン|コールマン\s*COLEMAN)/gi, replacement: 'Coleman' },
  { pattern: /(?:SNOW\s*PEAK\s*スノーピーク|スノーピーク\s*SNOW\s*PEAK)/gi, replacement: 'Snow Peak' },
  { pattern: /(?:LOGOS\s*ロゴス|ロゴス\s*LOGOS)/gi, replacement: 'LOGOS' },
  { pattern: /(?:CAPTAIN\s*STAG\s*キャプテンスタッグ|キャプテンスタッグ\s*CAPTAIN\s*STAG)/gi, replacement: 'Captain Stag' },
  { pattern: /(?:MONT-BELL\s*モンベル|モンベル\s*MONT-BELL)/gi, replacement: 'mont-bell' },
  { pattern: /(?:THE\s*NORTH\s*FACE\s*ノースフェイス|ノースフェイス\s*THE\s*NORTH\s*FACE)/gi, replacement: 'THE NORTH FACE' },
  { pattern: /(?:PATAGONIA\s*パタゴニア|パタゴニア\s*PATAGONIA)/gi, replacement: 'Patagonia' },
  { pattern: /(?:UNIFLAME\s*ユニフレーム|ユニフレーム\s*UNIFLAME)/gi, replacement: 'UNIFLAME' },
  { pattern: /(?:SOTO\s*ソト|ソト\s*SOTO)/gi, replacement: 'SOTO' },
  { pattern: /(?:NANGA\s*ナンガ|ナンガ\s*NANGA)/gi, replacement: 'NANGA' },

  // 家電・カメラ・電子機器
  { pattern: /(?:SONY\s*ソニー|ソニー\s*SONY)/gi, replacement: 'SONY' },
  { pattern: /(?:CANON\s*(?:キヤノン|キャノン)|(?:キヤノン|キャノン)\s*CANON)/gi, replacement: 'Canon' },
  { pattern: /(?:NIKON\s*ニコン|ニコン\s*NIKON)/gi, replacement: 'Nikon' },
  { pattern: /(?:PANASONIC\s*パナソニック|パナソニック\s*PANASONIC)/gi, replacement: 'Panasonic' },
  { pattern: /(?:PIONEER\s*パイオニア|パイオニア\s*PIONEER)/gi, replacement: 'Pioneer' },
  { pattern: /(?:KENWOOD\s*ケンウッド|ケンウッド\s*KENWOOD)/gi, replacement: 'Kenwood' },
  { pattern: /(?:ALPINE\s*アルパイン|アルパイン\s*ALPINE)/gi, replacement: 'Alpine' },
  { pattern: /(?:CARROZZERIA\s*カロッツェリア|カロッツェリア\s*CARROZZERIA)/gi, replacement: 'Carrozzeria' },
  { pattern: /(?:CASIO\s*カシオ|カシオ\s*CASIO)/gi, replacement: 'Casio' },
  { pattern: /(?:SEIKO\s*セイコー|セイコー\s*SEIKO)/gi, replacement: 'Seiko' },
  { pattern: /(?:CITIZEN\s*シチズン|シチズン\s*CITIZEN)/gi, replacement: 'Citizen' },

  // 車・バイク・パーツ
  { pattern: /(?:TOYOTA\s*トヨタ|トヨタ\s*TOYOTA)/gi, replacement: 'Toyota' },
  { pattern: /(?:HONDA\s*ホンダ|ホンダ\s*HONDA)/gi, replacement: 'Honda' },
  { pattern: /(?:NISSAN\s*(?:ニッサン|日産)|(?:ニッサン|日産)\s*NISSAN)/gi, replacement: 'Nissan' },
  { pattern: /(?:MAZDA\s*マツダ|マツダ\s*MAZDA)/gi, replacement: 'Mazda' },
  { pattern: /(?:SUBARU\s*スバル|スバル\s*SUBARU)/gi, replacement: 'Subaru' },
  { pattern: /(?:MITSUBISHI\s*(?:ミツビシ|三菱)|(?:ミツビシ|三菱)\s*MITSUBISHI)/gi, replacement: 'Mitsubishi' },
  { pattern: /(?:SUZUKI\s*スズキ|スズキ\s*SUZUKI)/gi, replacement: 'Suzuki' },
  { pattern: /(?:KAWASAKI\s*カワサキ|カワサキ\s*KAWASAKI)/gi, replacement: 'Kawasaki' },
  { pattern: /(?:YAMAHA\s*ヤマハ|ヤマハ\s*YAMAHA)/gi, replacement: 'Yamaha' },
  { pattern: /(?:BBS\s*(?:ビービーエス|ＢＢＳ)|(?:ビービーエス|ＢＢＳ)\s*BBS)/gi, replacement: 'BBS' },
  { pattern: /(?:RAYS\s*レイズ|レイズ\s*RAYS)/gi, replacement: 'RAYS' },
  { pattern: /(?:WORK\s*ワーク|ワーク\s*WORK)/gi, replacement: 'WORK' },
  { pattern: /(?:ENKEI\s*エンケイ|エンケイ\s*ENKEI)/gi, replacement: 'ENKEI' },
  { pattern: /(?:BREMBO\s*ブレンボ|ブレンボ\s*BREMBO)/gi, replacement: 'Brembo' },
  { pattern: /(?:BRIDGESTONE\s*ブリヂストン|ブリヂストン\s*BRIDGESTONE)/gi, replacement: 'Bridgestone' },
  { pattern: /(?:YOKOHAMA\s*ヨコハマ|ヨコハマ\s*YOKOHAMA)/gi, replacement: 'Yokohama' },
  { pattern: /(?:DUNLOP\s*ダンロップ|ダンロップ\s*DUNLOP)/gi, replacement: 'Dunlop' },
  { pattern: /(?:MICHELIN\s*ミシュラン|ミシュラン\s*MICHELIN)/gi, replacement: 'Michelin' },

  // 工具・電動工具
  { pattern: /(?:MAKITA\s*マキタ|マキタ\s*MAKITA)/gi, replacement: 'Makita' },
  { pattern: /(?:HIKOKI\s*(?:ハイコーキ|日立工機)|(?:ハイコーキ|日立工機)\s*HIKOKI)/gi, replacement: 'HiKOKI' },
  { pattern: /(?:RYOBI\s*リョービ|リョービ\s*RYOBI)/gi, replacement: 'RYOBI' },
  { pattern: /(?:KYOCERA\s*京セラ|京セラ\s*KYOCERA)/gi, replacement: 'Kyocera' },
  { pattern: /(?:KTC\s*京都機械工具|京都機械工具\s*KTC)/gi, replacement: 'KTC' },
  { pattern: /(?:TONE\s*トネ|トネ\s*TONE)/gi, replacement: 'TONE' },

  // 車種名・モデル名重複・カッコ補足パターン
  { pattern: /(?:VW\s*up!?\s*[\(（]アップ(?:\s*GTI)?[\)）]|[\(（]アップ(?:\s*GTI)?[\)）]\s*VW\s*up!?)/gi, replacement: 'VW up!' },
  { pattern: /[\(（]アップ(?:\s*GTI)?[\)）]/gi, replacement: '' },
  { pattern: /(?:VOLKSWAGEN\s*[\(（]フォルクスワーゲン[\)）]|フォルクスワーゲン\s*VOLKSWAGEN|VW\s*[\(（]フォルクスワーゲン[\)）]|フォルクスワーゲン\s*VW)/gi, replacement: 'Volkswagen' },
  { pattern: /(?:GOLF\s*[\(（]ゴルフ[\)）]|[\(（]ゴルフ[\)）]\s*GOLF)/gi, replacement: 'Golf' },
  { pattern: /(?:POLO\s*[\(（]ポロ[\)）]|[\(（]ポロ[\)）]\s*POLO)/gi, replacement: 'Polo' },
  { pattern: /(?:PRIUS\s*[\(（]プリウス[\)）]|[\(（]プリウス[\)）]\s*PRIUS)/gi, replacement: 'Prius' },
  { pattern: /(?:CIVIC\s*[\(（]シビック[\)）]|[\(（]シビック[\)）]\s*CIVIC)/gi, replacement: 'Civic' },
  { pattern: /(?:INTEGRA\s*[\(（]インテグラ[\)）]|[\(（]インテグラ[\)）]\s*INTEGRA)/gi, replacement: 'Integra' },
  { pattern: /(?:FIT\s*[\(（]フィット[\)）]|[\(（]フィット[\)）]\s*FIT)/gi, replacement: 'Fit' },
  { pattern: /(?:YARIS\s*[\(（]ヤリス[\)）]|[\(（]ヤリス[\)）]\s*YARIS)/gi, replacement: 'Yaris' },
  { pattern: /(?:COROLLA\s*[\(（]カローラ[\)）]|[\(（]カローラ[\)）]\s*COROLLA)/gi, replacement: 'Corolla' },
  { pattern: /(?:KW\s*[\(（](?:カーヴェー|カーベ)[）\)]|[\(（](?:カーヴェー|カーベ)[）\)]\s*KW)/gi, replacement: 'KW' },
  { pattern: /(?:SOARER\s*ソアラ|ソアラ\s*SOARER|Soアラ)/gi, replacement: 'Soarer' },
  { pattern: /(?:SUPRA\s*スープラ|スープラ\s*SUPRA)/gi, replacement: 'Supra' },
  { pattern: /(?:SILVIA\s*シルビア|シルビア\s*SILVIA)/gi, replacement: 'Silvia' },
  { pattern: /(?:SKYLINE\s*スカイライン|スカイライン\s*SKYLINE)/gi, replacement: 'Skyline' },
  { pattern: /(?:FAIRLADY\s*Z\s*フェアレディ\s*Z|フェアレディ\s*Z\s*FAIRLADY\s*Z|フェアレディZ)/gi, replacement: 'Fairlady Z' },
  { pattern: /(?:CHASER\s*チェイサー|チェイサー\s*CHASER)/gi, replacement: 'Chaser' },
  { pattern: /(?:MARK\s*II\s*マーク\s*II|マーク\s*II\s*MARK\s*II|マーク2|マークII)/gi, replacement: 'Mark II' },
  { pattern: /(?:CRESTA\s*クレスタ|クレスタ\s*CRESTA)/gi, replacement: 'Cresta' },
  { pattern: /(?:IMPREZA\s*インプレッサ|インプレッサ\s*IMPREZA)/gi, replacement: 'Impreza' },
  { pattern: /(?:LANCER\s*EVOLUTION\s*ランサーエボリューション|ランサーエボリューション|ランエボ)/gi, replacement: 'Lancer Evolution' },
  { pattern: /(?:ROADSTER\s*ロードスター|ロードスター\s*ROADSTER)/gi, replacement: 'Roadster' },
  { pattern: /(?:ALTEZZA\s*アルテッツァ|アルテッツァ\s*ALTEZZA)/gi, replacement: 'Altezza' },
  { pattern: /(?:CELICA\s*セリカ|セリカ\s*CELICA)/gi, replacement: 'Celica' },

  // 釣具・ホビー
  { pattern: /(?:SHIMANO\s*シマノ|シマノ\s*SHIMANO)/gi, replacement: 'Shimano' },
  { pattern: /(?:DAIWA\s*ダイワ|ダイワ\s*DAIWA)/gi, replacement: 'Daiwa' },
  { pattern: /(?:TAMIYA\s*タミヤ|タミヤ\s*TAMIYA)/gi, replacement: 'Tamiya' },
  { pattern: /(?:BANDAI\s*バンダイ|バンダイ\s*BANDAI)/gi, replacement: 'Bandai' },
];

// 2. 単独で残存したカタカナ・漢字ブランド名・車種名の変換
const STANDALONE_BRAND_RULES: { pattern: RegExp; replacement: string }[] = [
  { pattern: /マキタ/g, replacement: 'Makita' },
  { pattern: /(?:ハイコーキ|日立工機)/g, replacement: 'HiKOKI' },
  { pattern: /リョービ/g, replacement: 'RYOBI' },
  { pattern: /京セラ/g, replacement: 'Kyocera' },
  { pattern: /トネ/g, replacement: 'TONE' },
  { pattern: /(?:フォルクスワーゲン)/g, replacement: 'Volkswagen' },
  { pattern: /(?:カーヴェー|カーベ)/g, replacement: 'KW' },
  { pattern: /ゴルフ/g, replacement: 'Golf' },
  { pattern: /ポロ/g, replacement: 'Polo' },
  { pattern: /プリウス/g, replacement: 'Prius' },
  { pattern: /シビック/g, replacement: 'Civic' },
  { pattern: /インテグラ/g, replacement: 'Integra' },
  { pattern: /フィット/g, replacement: 'Fit' },
  { pattern: /ヤリス/g, replacement: 'Yaris' },
  { pattern: /カローラ/g, replacement: 'Corolla' },
  { pattern: /(?:ランクル|ランドクルーザー)/g, replacement: 'Land Cruiser' },
  { pattern: /ハイエース/g, replacement: 'Hiace' },
  { pattern: /アルファード/g, replacement: 'Alphard' },
  { pattern: /ヴェルファイア/g, replacement: 'Vellfire' },
  { pattern: /クラウン/g, replacement: 'Crown' },
  { pattern: /ハリアー/g, replacement: 'Harrier' },
  { pattern: /ヴォクシー/g, replacement: 'Voxy' },
  { pattern: /ノア/g, replacement: 'Noah' },
  { pattern: /セレナ/g, replacement: 'Serena' },
  { pattern: /ジムニー/g, replacement: 'Jimny' },
  { pattern: /エスクード/g, replacement: 'Escudo' },
  { pattern: /スイフト/g, replacement: 'Swift' },
  { pattern: /コペン/g, replacement: 'Copen' },
  { pattern: /タント/g, replacement: 'Tanto' },
  { pattern: /(?:ソアラ|Soアラ)/g, replacement: 'Soarer' },
  { pattern: /スープラ/g, replacement: 'Supra' },
  { pattern: /シルビア/g, replacement: 'Silvia' },
  { pattern: /スカイライン/g, replacement: 'Skyline' },
  { pattern: /フェアレディZ?/g, replacement: 'Fairlady Z' },
  { pattern: /チェイサー/g, replacement: 'Chaser' },
  { pattern: /(?:マークII|マーク2)/g, replacement: 'Mark II' },
  { pattern: /クレスタ/g, replacement: 'Cresta' },
  { pattern: /インプレッサ/g, replacement: 'Impreza' },
  { pattern: /(?:ランサーエボリューション|ランエボ)/g, replacement: 'Lancer Evolution' },
  { pattern: /ロードスター/g, replacement: 'Roadster' },
  { pattern: /アルテッツァ/g, replacement: 'Altezza' },
  { pattern: /セリカ/g, replacement: 'Celica' },
  { pattern: /コールマン/g, replacement: 'Coleman' },
  { pattern: /スノーピーク/g, replacement: 'Snow Peak' },
  { pattern: /ロゴス/g, replacement: 'LOGOS' },
  { pattern: /キャプテンスタッグ/g, replacement: 'Captain Stag' },
  { pattern: /モンベル/g, replacement: 'mont-bell' },
  { pattern: /ノースフェイス/g, replacement: 'THE NORTH FACE' },
  { pattern: /パタゴニア/g, replacement: 'Patagonia' },
  { pattern: /ユニフレーム/g, replacement: 'UNIFLAME' },
  { pattern: /ナンガ/g, replacement: 'NANGA' },
  { pattern: /ソニー/g, replacement: 'SONY' },
  { pattern: /トヨタ/g, replacement: 'Toyota' },
  { pattern: /ホンダ/g, replacement: 'Honda' },
  { pattern: /(?:ニッサン|日産)/g, replacement: 'Nissan' },
  { pattern: /マツダ/g, replacement: 'Mazda' },
  { pattern: /スバル/g, replacement: 'Subaru' },
  { pattern: /(?:ミツビシ|三菱)/g, replacement: 'Mitsubishi' },
  { pattern: /スズキ/g, replacement: 'Suzuki' },
  { pattern: /カワサキ/g, replacement: 'Kawasaki' },
  { pattern: /ヤマハ/g, replacement: 'Yamaha' },
  { pattern: /(?:キヤノン|キャノン)/g, replacement: 'Canon' },
  { pattern: /ニコン/g, replacement: 'Nikon' },
  { pattern: /パナソニック/g, replacement: 'Panasonic' },
  { pattern: /パイオニア/g, replacement: 'Pioneer' },
  { pattern: /ケンウッド/g, replacement: 'Kenwood' },

  { pattern: /アルパイン/g, replacement: 'Alpine' },
  { pattern: /カロッツェリア/g, replacement: 'Carrozzeria' },
  { pattern: /(?:ビービーエス|ＢＢＳ)/g, replacement: 'BBS' },
  { pattern: /レイズ/g, replacement: 'RAYS' },
  { pattern: /エンケイ/g, replacement: 'ENKEI' },
  { pattern: /ブレンボ/g, replacement: 'Brembo' },
  { pattern: /ブリヂストン/g, replacement: 'Bridgestone' },
  { pattern: /ヨコハマ/g, replacement: 'Yokohama' },
  { pattern: /ダンロップ/g, replacement: 'Dunlop' },
  { pattern: /ミシュラン/g, replacement: 'Michelin' },
  { pattern: /シマノ/g, replacement: 'Shimano' },

  { pattern: /ダイワ/g, replacement: 'Daiwa' },
  { pattern: /タミヤ/g, replacement: 'Tamiya' },
  { pattern: /バンダイ/g, replacement: 'Bandai' },
  { pattern: /カシオ/g, replacement: 'Casio' },
  { pattern: /セイコー/g, replacement: 'Seiko' },
  { pattern: /シチズン/g, replacement: 'Citizen' },
];


/**
 * 翻訳後テキスト内のカタカナ重複ブランド名や単独カタカナブランドを英語/ローマ字にクリーンアップ
 */
export function cleanupBrandNames(text: string): string {
  if (!text) return text;
  let cleaned = text;

  // 1. 重複パターンを優先除去
  for (const rule of BRAND_DUPLICATE_RULES) {
    cleaned = cleaned.replace(rule.pattern, rule.replacement);
  }

  // 2. 残った単独カタカナブランドを変換
  for (const rule of STANDALONE_BRAND_RULES) {
    cleaned = cleaned.replace(rule.pattern, rule.replacement);
  }

  // 連続スペースの整理
  return cleaned.replace(/\s+/g, ' ').trim();
}


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
export async function translateTitle(title: string, targetLang: string, user?: ErrorUserInfo): Promise<string> {
  if (!title || targetLang === 'ja') return title;
  const cached = getCachedTranslation(title, targetLang);
  if (cached) return cached;

  const results = await batchTranslateTitles([title], targetLang, user);
  return results[0] || title;
}

/**
 * 複数商品タイトルの一括高速翻訳
 * インメモリキャッシュを最優先参照し、未翻訳分のみを Gemini で並列バッチ翻訳
 * @param titles 翻訳対象のタイトル配列
 * @param targetLang 翻訳先言語（'es' または 'pt' 等）
 * @param user 操作している顧客情報（エラー通知用）
 * @returns 翻訳されたタイトル配列（元の配列と同じ長さ・順序）
 */
export async function batchTranslateTitles(titles: string[], targetLang: string, user?: ErrorUserInfo): Promise<string[]> {
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
    let transTitle = (translatedUncached && translatedUncached[i]) ? translatedUncached[i] : origTitle;

    // ブランド名のカタカナ重複クリーンアップを適用
    if (targetLang !== 'ja' && transTitle) {
      transTitle = cleanupBrandNames(transTitle);
    }

    results[origIdx] = transTitle;

    // 日本語残存・未翻訳チェック
    // 1. 翻訳結果に日本語（漢字・ひらがな・カタカナ）が含まれている
    // 2. または、元のタイトルに日本語が含まれていたのに翻訳結果が元の日本語のまま変わっていない
    if (targetLang !== 'ja' && origTitle && origTitle.length > 3) {
      const origHasJp = hasJapaneseCharacters(origTitle);
      const transHasJp = hasJapaneseCharacters(transTitle);
      const isFailed = transHasJp || (origHasJp && transTitle === origTitle);

      if (isFailed) {
        failedTitles.push({ original: origTitle, translated: transTitle });
      }
    }

    if (transTitle && !hasJapaneseCharacters(transTitle)) {
      setCachedTranslation(origTitle, targetLang, transTitle);
    }
  });

  // 翻訳エラー・日本語残存が検知された場合は非同期で管理者に通知（スロットリング付き）
  if (failedTitles.length > 0) {
    notifyAdminError({
      category: 'translation',
      title: `商品タイトルの${targetLang.toUpperCase()}翻訳エラー（日本語残存/未翻訳検知）`,
      message: `${failedTitles.length}件の商品タイトルの翻訳において、日本語が残存しているか翻訳に失敗した可能性があります。`,
      user,
      details: {
        targetLang,
        failedCount: failedTitles.length,
        sampleFailures: failedTitles.slice(0, 5)
      },
      severity: 'warning',
      throttleKey: `translation:${targetLang}:${failedTitles[0]?.original?.substring(0, 20)}:${user?.customerId || user?.email || 'guest'}`
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
            if (translated) return cleanupBrandNames(translated);
          } else if (res.status === 429 || res.status === 503) {
            // レートリミット・一時混雑時は少し待機してから次のモデルへ
            await new Promise(r => setTimeout(r, 600));
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
      if (translated) return cleanupBrandNames(translated.trim());
    }
  } catch {}

  // フォールバック: MyMemory
  try {
    const memoryResult = await translateWithMyMemory(text, targetLang, sourceLang);
    if (memoryResult) return cleanupBrandNames(memoryResult);
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

CRITICAL RULES:
1. Return ONLY a valid JSON array of ${titles.length} translated strings in the EXACT same order and array length as the input.
2. Remove redundant Japanese katakana brand/model names and parenthetical notes when the Latin/English name is present (e.g. "VW up! (アップ GTI)" -> "VW up! GTI", "Golf (ゴルフ)" -> "Golf", "SONY ソニー" -> "SONY", "TOYOTA トヨタ" -> "Toyota", "BBS ビービーエス" -> "BBS", "Coleman コールマン" -> "Coleman", "KW (カーヴェー)" -> "KW").
3. Convert all standalone Japanese brand and car model names to their official Latin/English equivalents (e.g. "ソニー" -> "SONY", "日産" -> "Nissan", "コールマン" -> "Coleman", "ソアラ" -> "Soarer", "スープラ" -> "Supra", "プリウス" -> "Prius", "シビック" -> "Civic").
4. Never leave untranslated Japanese katakana/kanji characters in the output.
5. Do NOT output markdown code fences, backticks, or any explanatory text. Return purely the JSON array.

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
      } else if (response.status === 429 || response.status === 503) {
        // レートリミット・一時混雑時は少し待機してから次のモデルへ
        await new Promise(r => setTimeout(r, 600));
      }
    } catch {
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

