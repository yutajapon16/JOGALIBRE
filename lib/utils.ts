export const formatDateTime = (dateString: string, mode: 'admin' | 'customer' = 'admin') => {
  if (!dateString) return '-';

  const date = parseAnyDateTime(dateString);
  if (!date || isNaN(date.getTime())) return dateString;

  // ローカルタイムゾーンの取得
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // 略称の取得
  let localLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: localTimeZone,
    timeZoneName: 'short'
  }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value || '';

  // GMT-3 などのオフセット表示を BRT 等の略称にマッピング
  if (localTimeZone === 'America/Sao_Paulo' || localLabel.includes('GMT-3')) {
    localLabel = 'BRT';
  } else if (localTimeZone === 'Asia/Tokyo' || localLabel.includes('GMT+9')) {
    localLabel = 'JST';
  }

  const pad = (num: number) => String(num).padStart(2, '0');

  // Intl.DateTimeFormat を使って個別に値を取得
  const formatterParts = new Intl.DateTimeFormat('en-US', {
    timeZone: localTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const year = formatterParts.find(p => p.type === 'year')?.value || String(date.getFullYear());
  const month = formatterParts.find(p => p.type === 'month')?.value || pad(date.getMonth() + 1);
  const day = formatterParts.find(p => p.type === 'day')?.value || pad(date.getDate());
  const hour = formatterParts.find(p => p.type === 'hour')?.value || pad(date.getHours());
  const minute = formatterParts.find(p => p.type === 'minute')?.value || pad(date.getMinutes());

  const formattedTime = `${hour}:${minute}`;

  if (mode === 'customer') {
    return `${day}/${month}/${year} ${formattedTime} ${localLabel}`;
  } else {
    return `${year}/${month}/${day} ${formattedTime} ${localLabel}`;
  }
};

export const formatDateOnly = (dateString: string, mode: 'admin' | 'customer' = 'admin') => {
  if (!dateString) return '-';

  // タイムゾーンの変換を防ぎ、かつ Safari 等で NaN になるのを避けるため、YYYY-MM-DD や YYYY/MM/DD の日付のみ形式を安全に検出して組み替える
  const simpleDateMatch = dateString.trim().match(/^(\d{4})[-/](\d{2})[-/](\d{2})(?:\s|T|$)/);
  if (simpleDateMatch) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_, y, m, d] = simpleDateMatch;
    if (mode === 'customer') {
      return `${d}/${m}/${y}`;
    } else {
      return `${y}/${m}/${d}`;
    }
  }

  const date = parseAnyDateTime(dateString);
  if (!date || isNaN(date.getTime())) return dateString;

  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const pad = (num: number) => String(num).padStart(2, '0');

  const formatterParts = new Intl.DateTimeFormat('en-US', {
    timeZone: localTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = formatterParts.find(p => p.type === 'year')?.value || String(date.getFullYear());
  const month = formatterParts.find(p => p.type === 'month')?.value || pad(date.getMonth() + 1);
  const day = formatterParts.find(p => p.type === 'day')?.value || pad(date.getDate());

  if (mode === 'customer') {
    return `${day}/${month}/${year}`;
  } else {
    return `${year}/${month}/${day}`;
  }
};

export const parseYahooTimeRaw = (raw: string) => {
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

  // 「d h m」表記を強制する (例: 1d 0h 0m)
  const partsStr = parts.join(' ');
  let d = '0d', h = '0h', m = '0m';
  if (partsStr.includes('d')) d = partsStr.match(/(\d+)d/)?.[0] || '0d';
  if (partsStr.includes('h')) h = partsStr.match(/(\d+)h/)?.[0] || '0h';
  if (partsStr.includes('m')) m = partsStr.match(/(\d+)m/)?.[0] || '0m';

  let formattedTime = '';
  if (parts.length > 0) {
    formattedTime = `${d} ${h} ${m}`;
  }

  return formattedTime || raw.replace(/残り|あと|残り時間|まで/g, '').trim();
};

/**
 * データベースから取得した日付文字列（通常UTC基準だが、TIMESTAMP WITHOUT TIME ZONEによりタイムゾーン情報が削られている可能性がある）を、
 * 環境に依存せず、かつ各種ブラウザ（iOS Safari等）でエラーにならないよう安全に Date オブジェクトにパースします。
 */
export const parseDbDateTime = (dateStr: string): Date | null => {
  if (!dateStr) return null;

  // 前後の空白を除去
  let cleanStr = dateStr.trim();

  // スラッシュ '/' が使われている場合はハイフン '-' に統一
  cleanStr = cleanStr.replace(/\//g, '-');

  // すでに ISO 形式でタイムゾーンがある場合はそのままパース
  const hasTimeZone = cleanStr.includes('Z') || cleanStr.includes('+') || cleanStr.includes('-', 10);

  if (!hasTimeZone) {
    // タイムゾーンがない場合、DB内の値はUTCとして保存されているため、'Z' を付与してパースする
    cleanStr = cleanStr.replace(' ', 'T') + 'Z';
  } else {
    cleanStr = cleanStr.replace(' ', 'T');
  }

  const parsed = new Date(cleanStr);
  return isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * ヤフオクなどの日付文字列（日本時間 JST 基準）を、環境（UTCサーバーや海外のクライアントなど）に依存せず、
 * かつ各種ブラウザ（iOS Safari等）でエラーにならないよう安全に Date オブジェクトにパースします。
 */
export const parseJstDateTime = (dateStr: string): Date | null => {
  if (!dateStr) return null;

  // 前後の空白を除去
  let cleanStr = dateStr.trim();

  // スラッシュ '/' が使われている場合はハイフン '-' に統一
  cleanStr = cleanStr.replace(/\//g, '-');

  // すでに ISO 形式でタイムゾーンがある場合はそのままパース
  // Z または +XX:XX または -XX:XX (日付のハイフンと区別するためインデックス10以降)
  const hasTimeZone = cleanStr.includes('Z') || cleanStr.includes('+') || cleanStr.includes('-', 10);

  if (!hasTimeZone) {
    // タイムゾーンがない場合、日本時間 (JST = +09:00) として扱う
    // 日付と時刻の間のスペースを 'T' に置換してブラウザでのパースエラーを防止
    cleanStr = cleanStr.replace(' ', 'T');
    // JST タイムゾーンを付与
    cleanStr = cleanStr + '+09:00';
  }

  const parsed = new Date(cleanStr);
  return isNaN(parsed.getTime()) ? null : parsed;
};

export const parseAnyDateTime = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const cleanStr = dateStr.trim();

  // 1. すでにタイムゾーン情報（'Z', '+', または日付区切り以外の10文字目以降の '-'）がある場合はそのままパース
  const hasTimeZone = cleanStr.includes('Z') || cleanStr.includes('+') || cleanStr.includes('-', 10);
  if (hasTimeZone) {
    const d = new Date(cleanStr.replace(' ', 'T'));
    if (!isNaN(d.getTime())) return d;
  }

  // 2. スラッシュ区切りや日本語（年月日）を含む形式はヤフオクの日本時間（JST = +09:00）としてパース
  if (cleanStr.includes('/') || cleanStr.includes('年') || cleanStr.includes('月') || cleanStr.includes('日')) {
    const dJst = parseJstDateTime(cleanStr);
    if (dJst && !isNaN(dJst.getTime())) return dJst;
  }

  // 3. DB日時パース (PostgreSQLのTIMESTAMP WITHOUT TIME ZONEでZが削られたUTC日時をパース)
  const dDb = parseDbDateTime(cleanStr);
  if (dDb && !isNaN(dDb.getTime())) return dDb;

  // 4. JSTフォールバック
  const dJst = parseJstDateTime(cleanStr);
  if (dJst && !isNaN(dJst.getTime())) return dJst;

  const dFallback = new Date(cleanStr);
  return isNaN(dFallback.getTime()) ? null : dFallback;
};

export const getTimeRemaining = (endTime: string, lang: 'ja' | 'es' | 'pt', timeLeftStr?: string) => {
  if (!endTime) return timeLeftStr || '-';

  // ヤフオク日時（JST）およびDB日時（UTC）を環境非依存で安全かつ正確にパース
  const endDate = parseAnyDateTime(endTime);
  if (!endDate) return timeLeftStr || '-';

  const now = new Date().getTime();
  const end = endDate.getTime();
  const diff = end - now;

  if (diff <= 0) {
    if (lang === 'ja') return '終了';
    return (lang === 'es' ? 'Finalizado' : 'Finalizado');
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (lang === 'ja') {
    const parts = [];
    if (days > 0) parts.push(`${days}日`);
    if (hours > 0) parts.push(`${hours}時間`);
    if (minutes > 0 || (days === 0 && hours === 0)) parts.push(`${minutes}分`);
    return parts.join(' ');
  } else {
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.join(' ') || (lang === 'es' ? 'Menos de 1m' : 'Menos de 1m');
  }
};

import costsCache from './costs-cache.json';

// CSVデータのキャッシュ用インターフェース
interface ShippingCostItem {
  key: string;
  shipping: number;
  categoryIds: string[];
  keywords: string[];
}

interface FobCostItem {
  key: string;
  fob: number;
  categoryIds: string[];
  keywords: string[];
}

interface LocalCostItem {
  key: string;
  asu_sea: number | string;
  cde_sea: number | string;
  enc_sea: number | string;
  pjc_sea: number | string;
  snt_sea: number | string;
  iqq_sea: number | string;
  lpz_sea: number | string;
  scz_sea: number | string;
  bue_sea: number | string;
  asu_air: number | string;
  cde_air: number | string;
  enc_air: number | string;
  pjc_air: number | string;
  snt_air: number | string;
  iqq_air: number | string;
  lpz_air: number | string;
  scz_air: number | string;
  bue_air: number | string;
}

const cachedShippingCosts: ShippingCostItem[] = costsCache.shippingCosts;
const cachedFobCosts: FobCostItem[] = costsCache.fobCosts;
const cachedLocalCosts: Record<string, LocalCostItem> = costsCache.localCosts as Record<string, LocalCostItem>;

/**
 * CSVファイルをパースし、メモリキャッシュに読み込みます。（静的キャッシュ移行に伴いダミー化）
 */
function loadCostsData() {}

/**
 * タイトルまたはURLに対して、キーワードが安全に一致しているかを判定する関数
 * 短い英数字キーワード（evo, ape, gap, som, ram, gpu, cpu, dj等）は、単語境界で照合して
 * 「nuevo」などの無関係な単語への部分一致誤爆を防ぐ
 */
export const matchesCostKeyword = (text: string, keyword: string): boolean => {
  if (!text || !keyword) return false;
  const trimmedKw = keyword.trim().toLowerCase();
  if (!trimmedKw) return false;
  const lowerText = text.toLowerCase();

  // 英数字・ハイフンのみで構成されるキーワードの場合は単語境界マッチング
  if (/^[a-z0-9_-]+$/i.test(trimmedKw)) {
    const escaped = trimmedKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // moto の特殊判定（motor を除外）
    if (trimmedKw === 'moto') {
      const regex = /(^|[^a-z0-9])moto([^a-z0-9]|$)/i;
      return regex.test(lowerText) && !lowerText.includes('motor');
    }
    const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    return regex.test(lowerText);
  }

  // 日本語など非ASCII文字列を含む場合は通常の部分一致
  return lowerText.includes(trimmedKw);
};

/**
 * 商品タイトルやURLから、「エンジン本体（重量物・ASSY）」であるかを多層判定するヘルパー関数
 * - 優先度1 (本体確定): 「エンジン本体」「エンジンASSY」「コンプリートエンジン」等のキーワードがある場合は、
 *                      カムシャフト等のパーツ名が併記されていても無条件で【エンジン本体】と判定する
 * - 優先度2 (部品除外): 本体確定ワードがなく、パーツ単体名（ガスケット、カムシャフト、ピストン、プラグ、センサー、ボルト等）が
 *                      含まれる場合は【通常パーツ】と判定（エンジン本体ではない）
 * - 優先度3 (単体エンジン): 上記パーツ単体名がなく、「エンジン」単体や実動等の表記がある場合は【エンジン本体】と判定
 */
export const isEngineUnit = (title?: string | null, url?: string | null): boolean => {
  if (!title && !url) return false;
  const lowerTitle = (title || '').toLowerCase();
  const lowerUrl = (url || '').toLowerCase();
  const text = `${lowerTitle} ${lowerUrl}`;

  // 1. エンジン本体確定キーワード（これらがあれば、カムシャフト等の部品名が併記されていても100%エンジン本体とみなす）
  const engineUnitKeywords = [
    'エンジン本体',
    'エンジン assy',
    'エンジンassy',
    'エンジン・assy',
    'エンジン組品',
    'コンプリートエンジン',
    'リビルトエンジン',
    'ベアエンジン',
    'ショートブロック',
    'ロングブロック',
    'エンジン載せ替え',
    'エンジン 載せ替え',
    'エンジン載替',
    'エンジン 載替',
    '実動エンジン',
    '実働エンジン',
    'motor completo',
    'complete engine'
  ];

  if (engineUnitKeywords.some(kw => text.includes(kw))) {
    return true;
  }

  // 2. 部品・補修パーツ単体ワード（本体確定キーワードがなく、これらが含まれる場合はエンジン本体ではない）
  const enginePartKeywords = [
    'ガスケット',
    'パッキン',
    'シール',
    'オイルシール',
    'カムシャフト',
    'ハイカム',
    'ピストン',
    'コンロッド',
    'クランクシャフト',
    'タイミングベルト',
    'タイベル',
    'ファンベルト',
    'ベルト',
    'テンショナー',
    'プーリー',
    'プラグ',
    'スパークプラグ',
    'イグニッションコイル',
    'イグニッション',
    'インジェクター',
    'デリバリーパイプ',
    '燃料ポンプ',
    'フューエルポンプ',
    'オイルパン',
    'オイルポンプ',
    'ウォーターポンプ',
    'サーモスタット',
    'ラジエーター',
    'ラジエター',
    'インタークーラー',
    'オイルクーラー',
    'タービン',
    'ターボチャージャー',
    '過給器',
    'スーパーチャージャー',
    'ブローオフ',
    'ウェイストゲート',
    'アクチュエーター',
    'マニホールド',
    'エキマニ',
    'インマニ',
    'スロットル',
    'スロットルボディ',
    'センサー',
    'エアフロ',
    'o2センサー',
    'ソレノイド',
    'バルブ',
    'シリンダーヘッド',
    'シリンダーブロック',
    'タペットカバー',
    'ヘッドカバー',
    'ロッカーカバー',
    'バルブスプリング',
    'リフター',
    'エンジンマウント',
    'マウント',
    'ボルト',
    'ナット',
    'スタッドボルト',
    'ワッシャー',
    'ホース',
    'パイプ',
    'チューブ',
    'ステー',
    'ブラケット',
    'リペアキット',
    'オーバーホールキット',
    'o/hキット',
    'キット',
    'セット'
  ];

  if (enginePartKeywords.some(kw => text.includes(kw))) {
    return false;
  }

  // 3. パーツ単体名がなく、「エンジン」が含まれている場合
  if (text.includes('エンジンオイル') || text.includes('エンジンルーム')) {
    return false;
  }

  if (matchesCostKeyword(lowerTitle, 'エンジン') || matchesCostKeyword(lowerUrl, 'エンジン') || matchesCostKeyword(text, 'motor')) {
    return true;
  }

  return false;
};

/**
 * 商品タイトルやURLから、「外装・エアロ（大型品: 10,000円）」であるかを判定するヘルパー関数
 * バンパー、ボンネット、ドア、フェンダー、トランク、ガラス等の大物を判定し、
 * エンブレム、クリップ、ステッカー、ノズル等の小物は除外（通常送料1,000円）とする
 */
export const isCarroceriaUnit = (title?: string | null, url?: string | null): boolean => {
  if (!title && !url) return false;
  const lowerTitle = (title || '').toLowerCase();
  const lowerUrl = (url || '').toLowerCase();
  const text = `${lowerTitle} ${lowerUrl}`;

  // 1. 大型外装確定キーワード
  const bigKeywords = [
    'フロントバンパー', 'リアバンパー', 'リヤバンパー', 'バンパー',
    'ボンネット', 'capo',
    'フロントフェンダー', 'リアフェンダー', 'リヤフェンダー', 'フェンダー',
    'フロントドア', 'リアドア', 'リヤドア', 'ドア本体',
    'トランクパネル', 'トランク', 'リアゲート', 'リヤゲート', 'バックドア',
    'フロントガラス', 'リアガラス', 'リヤガラス',
    'サイドステップ', 'サイドスカート', 'エアロキット', 'フルエアロ',
    'gtウイング', 'リアウイング', 'リヤウイング', 'リアスポイラー', 'リヤスポイラー',
    'paragolpe', 'parabrisas'
  ];

  // 2. 外装小物・除外キーワード
  const partKeywords = [
    'エンブレム', 'emblem', 'ロゴ',
    'クリップ', 'リベット', 'ファスナー', 'ボルト', 'ナット', 'ビス', 'ネジ', 'ステー', 'ブラケット',
    'ドアノブ', 'アウターハンドル', 'インナーハンドル', 'ドアハンドル',
    'モール', 'モールディング', 'ガーニッシュ', 'トリム', 'ピラー',
    'ステッカー', 'デカール', 'フィルム', 'プロテクター',
    'ウォッシャーノズル', 'ノズル', 'ワイパーアーム', 'ワイパーブレード', 'ワイパーゴム', 'ワイパー',
    'ドアミラーレンズ', 'ミラーレンズ', 'ミラーカバー',
    'ウェザーストリップ', 'ドアゴム',
    'ガラスコーティング', 'コーティング', '撥水',
    'フォグカバー', 'グリルバッジ', 'キーシリンダー'
  ];

  // 小物キーワードが含まれる場合は小物優先
  const hasPart = partKeywords.some(kw => text.includes(kw));
  if (hasPart) {
    if (text.includes('クリップ') || text.includes('ボルト') || text.includes('ステー') || text.includes('エンブレム') || text.includes('ノズル') || text.includes('ステッカー') || text.includes('モール')) {
      return false;
    }
    const isBig = bigKeywords.some(kw => text.includes(kw));
    return isBig;
  }

  // 大物キーワード判定
  if (bigKeywords.some(kw => text.includes(kw))) {
    return true;
  }

  return false;
};

/**
 * 商品タイトルやURLから、「シート本体（大型品: 9,000円）」であるかを判定するヘルパー関数
 * シート本体（レカロ、セミバケ、フルバケ等）を判定し、
 * シートレール、シートベルト、シートカバー、遮熱シート等は除外（通常送料1,000円）とする
 */
export const isSeatUnit = (title?: string | null, url?: string | null): boolean => {
  if (!title && !url) return false;
  const lowerTitle = (title || '').toLowerCase();
  const lowerUrl = (url || '').toLowerCase();
  const text = `${lowerTitle} ${lowerUrl}`;

  // 1. シート小物・除外キーワード
  const partKeywords = [
    'シートレール', 'レール', 'ベースフレーム',
    'シートベルト', 'ベルトバックル', 'バックル', 'キャッチ',
    'シートカバー', 'カバー', 'プロテクター',
    'シートヒーター', 'ヒータースイッチ', 'スイッチ',
    'ヘッドレスト',
    'ボルト', 'ナット', 'ワッシャー', 'スペーサー',
    '防音シート', '遮熱シート', 'デッドニングシート', 'カーボンシート', 'ラッピングシート', '制振シート'
  ];

  if (partKeywords.some(kw => text.includes(kw))) {
    return false;
  }

  // 2. シート本体キーワード
  const bigKeywords = [
    'シート本体', 'セミバケ', 'セミバケット', 'フルバケ', 'フルバケット',
    'レカロシート', 'ブリッドシート', 'バケットシート',
    '運転席シート', '助手席シート', 'フロントシート', 'リアシート', 'リヤシート',
    '純正シート', 'レザーシート', 'recaro', 'bride', 'シート', 'asiento', 'assento'
  ];

  return bigKeywords.some(kw => text.includes(kw));
};

/**
 * 商品タイトルやURLから、「マフラー本体（大型品: 8,000円）」であるかを判定するヘルパー関数
 * マフラー本体、エキマニ、フロントパイプ、触媒等を判定し、
 * ガスケット、ハンガーゴム、ボルト、インナーサイレンサー等は除外（通常送料1,000円）とする
 */
export const isMufflerUnit = (title?: string | null, url?: string | null): boolean => {
  if (!title && !url) return false;
  const lowerTitle = (title || '').toLowerCase();
  const lowerUrl = (url || '').toLowerCase();
  const text = `${lowerTitle} ${lowerUrl}`;

  // 1. マフラー小物・除外キーワード
  const partKeywords = [
    'ガスケット', 'マフラーガスケット',
    'ハンガー', 'マフラーハンガー', '吊りゴム', 'マフラーゴム',
    'バンド', 'マフラーバンド', 'クランプ',
    'ボルト', 'ナット', 'スプリング',
    'インナーサイレンサー', 'サイレンサー',
    'マフラーカッター',
    'センサーボス', 'o2センサー', 'メクラボルト',
    'サーモバンテージ', 'バンテージ', '耐熱布', '遮熱板'
  ];

  if (partKeywords.some(kw => text.includes(kw))) {
    return false;
  }

  // 2. マフラー本体キーワード
  const bigKeywords = [
    'マフラー本体', 'マフラー', 'エキゾースト', 'リアピース', 'リヤマフラー', '砲弾',
    'エキマニ', 'エキゾーストマニホールド', 'タコ足',
    'フロントパイプ', 'センターパイプ', '中間パイプ', '中間タイコ',
    '触媒', 'キャタライザー', 'メタルキャタライザー', '触媒ストレート',
    'escape', 'escapamento', 'silenciador'
  ];

  return bigKeywords.some(kw => text.includes(kw));
};

/**
 * 商品タイトルやURLから、「ミッション・デフ本体（重量物: 8,000円）」であるかを判定するヘルパー関数
 * トランスミッション本体、LSD・デフ本体等を判定し、
 * シフトノブ、シフトブーツ、クラッチディスク、マウント、オイル等は除外（通常送料1,000円）とする
 */
export const isTransmissionUnit = (title?: string | null, url?: string | null): boolean => {
  if (!title && !url) return false;
  const lowerTitle = (title || '').toLowerCase();
  const lowerUrl = (url || '').toLowerCase();
  const text = `${lowerTitle} ${lowerUrl}`;

  // 1. ミッション小物・除外キーワード
  const partKeywords = [
    'シフトノブ', 'シフトレバー', 'クイックシフト', 'シフトブーツ',
    'クラッチディスク', 'クラッチカバー', 'レリーズベアリング', 'クラッチマスター', 'オペレーティングシリンダー', 'クラッチホース', 'クラッチペダル',
    'ミッションオイル', 'デフオイル', 'オイル',
    'ミッションマウント', 'デフマウント', 'マウント',
    'ドレンボルト', 'ドレンプラグ', 'ガスケット', 'シール', 'パッキン', 'オイルシール',
    'シンクロ', 'シフトフォーク', 'ベアリング', 'ボルト', 'ナット'
  ];

  if (partKeywords.some(kw => text.includes(kw))) {
    return false;
  }

  // 2. ミッション本体キーワード
  const bigKeywords = [
    'ミッション本体', 'トランスミッション本体', 'mt本体', 'at本体', 'cvt本体',
    'トランスミッション', 'ミッション', 'transmision', 'transmisión', 'transmissao', 'transmissão',
    'デフキャリア', 'デフ玉', 'デフassy', 'lsd本体', 'デフ',
    'トランスファー', 'プロペラシャフト'
  ];

  return bigKeywords.some(kw => text.includes(kw));
};

/**
 * ホイール・タイヤ商品における小物（ナット、キャップ、ハブリング等）を除外するヘルパー関数
 */
export const isWheelUnit = (title?: string | null, url?: string | null): boolean => {
  if (!title && !url) return false;
  const lowerTitle = (title || '').toLowerCase();
  const lowerUrl = (url || '').toLowerCase();
  const text = `${lowerTitle} ${lowerUrl}`;

  const partKeywords = [
    'ホイールナット', 'ラグナット', 'レーシングナット', 'ロックナット', 'ナット',
    'エアバルブ', 'バルブキャップ',
    'センターキャップ', 'ホイールキャップ',
    'ハブリング', 'ワイドトレッドスペーサー', 'ワイトレ', 'スペーサー',
    'ホイールボルト', 'スタッドボルト',
    'リムステッカー', 'リムガード',
    'パンク修理', 'エアゲージ', '空気圧センサー'
  ];

  if (partKeywords.some(kw => text.includes(kw))) {
    return false;
  }

  return true;
};

/**
 * ブレーキ商品における小物・消耗品（パッド、ホース、シールキット等）を除外するヘルパー関数
 */
export const isBrakeUnit = (title?: string | null, url?: string | null): boolean => {
  if (!title && !url) return false;
  const lowerTitle = (title || '').toLowerCase();
  const lowerUrl = (url || '').toLowerCase();
  const text = `${lowerTitle} ${lowerUrl}`;

  const partKeywords = [
    'ブレーキパッド', 'パッド', 'ブレーキパット',
    'ブレーキホース', 'ステンメッシュホース', 'ホース',
    'シールキット', 'キャリパーシール', 'リペアキット', 'オーバーホールキット',
    'ブリーダーボルト', 'ブリーダーキャップ',
    'ブレーキフルード', 'ブレーキオイル',
    'パッドセンサー', 'ブレーキスイッチ'
  ];

  if (partKeywords.some(kw => text.includes(kw))) {
    return false;
  }

  return true;
};

/**
 * ライト商品における小物（バルブ、電球、リレーハーネス等）を除外するヘルパー関数
 */
export const isLightUnit = (title?: string | null, url?: string | null): boolean => {
  if (!title && !url) return false;
  const lowerTitle = (title || '').toLowerCase();
  const lowerUrl = (url || '').toLowerCase();
  const text = `${lowerTitle} ${lowerUrl}`;

  const partKeywords = [
    'バルブ', 'ledバルブ', 'hidバーナー', 'バーナー', '電球', 'led球',
    't10', 't20', 'd2s', 'd4s', 'h4', 'h11', 'hb3', 'hb4',
    'リレー', 'リレーハーネス', 'ハーネス', '配線', 'ソケット', 'カプラー',
    'バラスト', 'hidバラスト',
    'スイッチ', 'レベライザースイッチ', '光軸調整'
  ];

  if (partKeywords.some(kw => text.includes(kw))) {
    return false;
  }

  return true;
};

/**
 * ステアリング商品における小物（ホーンボタン、ボルト、ボス等）を除外するヘルパー関数
 */
export const isSteeringUnit = (title?: string | null, url?: string | null): boolean => {
  if (!title && !url) return false;
  const lowerTitle = (title || '').toLowerCase();
  const lowerUrl = (url || '').toLowerCase();
  const text = `${lowerTitle} ${lowerUrl}`;

  const partKeywords = [
    'ホーンボタン', 'ホーンリング',
    'ステアリングボス', 'ボス', 'ボススペーサー',
    'ステアリングボルト', 'ボルト', 'ビス',
    'パドルシフト', 'スイッチ'
  ];

  if (partKeywords.some(kw => text.includes(kw))) {
    return false;
  }

  return true;
};

/**
 * カテゴリキーに応じて、商品が「大物・本体」であるかを総合判定するディスパッチャー関数
 * 小物・補修パーツと判定された場合は false を返し、通常送料（1,000円）へのフォールバックを促す
 */
export const isCategoryUnitItem = (categoryKey: string, title?: string | null, url?: string | null): boolean => {
  switch (categoryKey) {
    case 'motor':
      return isEngineUnit(title, url);
    case 'carroceria':
      return isCarroceriaUnit(title, url);
    case 'asiento':
      return isSeatUnit(title, url);
    case 'escape':
      return isMufflerUnit(title, url);
    case 'transmision':
      return isTransmissionUnit(title, url);
    case 'llantas':
    case 'aros':
    case 'll16':
    case 'll17':
    case 'll18':
    case 'ar16':
    case 'ar17':
    case 'ar18':
      return isWheelUnit(title, url);
    case 'freno':
      return isBrakeUnit(title, url);
    case 'luces':
      return isLightUnit(title, url);
    case 'volante':
      return isSteeringUnit(title, url);
    default:
      return true;
  }
};

/**
 * 商品タイトルやURLからカテゴリキーを判定するヘルパー関数
 */
export const detectCategoryKey = (title?: string | null, url?: string | null): string => {
  loadCostsData();
  
  let jcat: string | null = null;
  let decodedUrl = url || '';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  try { decodedUrl = decodeURIComponent(url || ''); } catch (_e) {}

  const jcatMatch = decodedUrl.match(/[?&]jcat=([^&]+)/);
  if (jcatMatch) {
    jcat = jcatMatch[1];
  }

  const lowerUrl = decodedUrl.toLowerCase();
  const lowerTitle = (title || '').toLowerCase();

  // 1. カテゴリIDによる厳密な判定
  for (const item of cachedShippingCosts) {
    if (item.categoryIds.some(id => lowerUrl.includes(id))) {
      // 大物カテゴリの場合、部品単体・小物であれば除外
      if (!isCategoryUnitItem(item.key, lowerTitle, lowerUrl)) {
        continue;
      }
      return item.key;
    }
  }
  for (const item of cachedFobCosts) {
    if (item.categoryIds.some(id => lowerUrl.includes(id))) {
      // 大物カテゴリの場合、部品単体・小物であれば除外
      if (!isCategoryUnitItem(item.key, lowerTitle, lowerUrl)) {
        continue;
      }
      return item.key;
    }
  }

  // 2. jcatによる判定
  if (jcat) {
    return jcat;
  }

  // 3. キーワードによるフォールバック判定
  for (const item of cachedShippingCosts) {
    if (!isCategoryUnitItem(item.key, lowerTitle, lowerUrl)) {
      continue;
    }
    if (item.keywords.some(keyword => matchesCostKeyword(lowerTitle, keyword) || matchesCostKeyword(lowerUrl, keyword))) {
      return item.key;
    }
  }
  for (const item of cachedFobCosts) {
    if (!isCategoryUnitItem(item.key, lowerTitle, lowerUrl)) {
      continue;
    }
    if (item.keywords.some(keyword => matchesCostKeyword(lowerTitle, keyword) || matchesCostKeyword(lowerUrl, keyword))) {
      return item.key;
    }
  }

  return 'default';
};



export interface City {
  code: string;
  nameJa: string;
  nameEs: string;
  namePt: string;
}

export interface Country {
  code: string;
  nameJa: string;
  nameEs: string;
  namePt: string;
  cities: City[];
}

export const deliveryLocations: Country[] = [
  {
    code: 'JP',
    nameJa: '日本 🇯🇵',
    nameEs: 'Japón 🇯🇵',
    namePt: 'Japão 🇯🇵',
    cities: []
  },
  {
    code: 'PY',
    nameJa: 'パラグアイ 🇵🇾',
    nameEs: 'Paraguay 🇵🇾',
    namePt: 'Paraguai 🇵🇾',
    cities: [
      { code: 'ASU', nameJa: 'アスンシオン 🇵🇾', nameEs: 'Asunción 🇵🇾', namePt: 'Assunção 🇵🇾' },
      { code: 'CDE', nameJa: 'シウダー・デル・エステ 🇵🇾', nameEs: 'Ciudad del Este 🇵🇾', namePt: 'Ciudad del Este 🇵🇾' },
      { code: 'ENC', nameJa: 'エンカルナシオン 🇵🇾', nameEs: 'Encarnación 🇵🇾', namePt: 'Encarnação 🇵🇾' },
      { code: 'PJC', nameJa: 'ペドロ・フアン・カバジェロ 🇵🇾', nameEs: 'Pedro Juan Caballero 🇵🇾', namePt: 'Pedro Juan Caballero 🇵🇾' },
      { code: 'OTH_PY', nameJa: 'その他 🇵🇾', nameEs: 'Otra 🇵🇾', namePt: 'Outra 🇵🇾' }
    ]
  },
  {
    code: 'CL',
    nameJa: 'チリ 🇨🇱',
    nameEs: 'Chile 🇨🇱',
    namePt: 'Chile 🇨🇱',
    cities: [
      { code: 'SNT', nameJa: 'サンティアゴ 🇨🇱', nameEs: 'Santiago 🇨🇱', namePt: 'Santiago 🇨🇱' },
      { code: 'IQQ', nameJa: 'イキケ 🇨🇱', nameEs: 'Iquique 🇨🇱', namePt: 'Iquique 🇨🇱' },
      { code: 'OTH_CL', nameJa: 'その他 🇨🇱', nameEs: 'Otra 🇨🇱', namePt: 'Outra 🇨🇱' }
    ]
  },
  {
    code: 'BO',
    nameJa: 'ボリビア 🇧🇴',
    nameEs: 'Bolivia 🇧🇴',
    namePt: 'Bolívia 🇧🇴',
    cities: [
      { code: 'LPZ', nameJa: 'ラパス 🇧🇴', nameEs: 'La Paz 🇧🇴', namePt: 'La Paz 🇧🇴' },
      { code: 'SCZ', nameJa: 'サンタ・クルス 🇧🇴', nameEs: 'Santa Cruz 🇧🇴', namePt: 'Santa Cruz 🇧🇴' },
      { code: 'OTH_BO', nameJa: 'その他 🇧🇴', nameEs: 'Otra 🇧🇴', namePt: 'Outra 🇧🇴' }
    ]
  },
  {
    code: 'AR',
    nameJa: 'アルゼンチン 🇦🇷',
    nameEs: 'Argentina 🇦🇷',
    namePt: 'Argentina 🇦🇷',
    cities: [
      { code: 'BUE', nameJa: 'ブエノスアイレス 🇦🇷', nameEs: 'Buenos Aires 🇦🇷', namePt: 'Buenos Aires 🇦🇷' },
      { code: 'OTH_AR', nameJa: 'その他 🇦🇷', nameEs: 'Otra 🇦🇷', namePt: 'Outra 🇦🇷' }
    ]
  }
];

export const getCountryNameJa = (code: string): string => {
  const country = deliveryLocations.find(c => c.code === code);
  return country ? country.nameJa : '日本 🇯🇵';
};

export const getCityNameJa = (countryCode: string, cityCode: string): string => {
  const country = deliveryLocations.find(c => c.code === countryCode);
  const city = country?.cities.find(c => c.code === cityCode);
  return city ? city.nameJa : '';
};

export const getCityCodeByJaName = (cityName: string): string => {
  if (!cityName) return 'JP';
  const cleanName = cityName.trim();
  for (const country of deliveryLocations) {
    for (const city of country.cities) {
      if (city.nameJa === cleanName || city.nameJa.includes(cleanName) || cleanName.includes(city.nameJa)) {
        return city.code;
      }
    }
  }
  return 'JP';
};

export const getCityCode = (deliveryLocation?: string): string => {
  if (!deliveryLocation) return 'JP';
  const loc = deliveryLocation.trim().toUpperCase();

  // 新旧すべての都市コードとの直接一致をチェック
  const allCodes = ['JP', 'ASU', 'CDE', 'ENC', 'PJC', 'SNT', 'IQQ', 'LPZ', 'SCZ', 'BUE', 'OTH_PY', 'OTH_CL', 'OTH_BO', 'OTH_AR'];
  if (allCodes.includes(loc) || loc.startsWith('OTH')) {
    return loc;
  }

  // もし "パラグアイ 🇵🇾:アスンシオン 🇵🇾" などの形式の場合、都市名部分を取り出す
  if (loc.includes(':')) {
    const parts = loc.split(':');
    return getCityCodeByJaName(parts[1]);
  }

  // もし都市の日本語名がそのまま渡された場合
  return getCityCodeByJaName(loc);
};

/**
 * 商品渡し場所と商品カテゴリに基づいて現地費用（USD）を計算して返す関数
 * @param deliveryLocation 商品渡し場所 ('JP', 'ASU', 'ENC', 'PJC' または国・都市表記)
 * @param item 商品情報
 * @returns 現地費用 (USD建ての数値、日本渡しは0)
 */
export const calculateLocalCost = (deliveryLocation?: string, item?: any, shippingMethod?: string): number | string => {
  const cityCode = getCityCode(deliveryLocation);
  if (cityCode === 'JP') return 0;

  // 管理者等が手動設定した現地費用（local_cost）がある場合は優先して使用
  if (item?.local_cost !== undefined && item?.local_cost !== null && !isNaN(Number(item.local_cost))) {
    return Number(item.local_cost);
  }

  // 都市コードが「その他（OTH_XX）」で始まる場合は無条件で「要確認」を返す
  if (cityCode.startsWith('OTH')) {
    return '要確認';
  }
  
  loadCostsData();

  // タイトルとURLからカテゴリキーを特定 (日本語タイトルがあれば優先)
  const title = item?.productTitleJa || item?.productTitle || item?.product_title || '';
  const url = item?.productUrl || item?.product_url || '';
  const categoryKey = detectCategoryKey(title, url);

  const loc = cityCode.toLowerCase();
  let costItem = cachedLocalCosts[categoryKey];
  
  // マッチしなかった場合はdefaultを使用
  if (!costItem) {
    costItem = cachedLocalCosts['default'];
  }

  if (!costItem) return 0;

  // shippingMethodの判定 (引数またはitemから取得。デフォルトは'sea')
  const method = (shippingMethod || item?.shipping_method || item?.shippingMethod || 'sea').trim().toLowerCase();
  const isAir = method === 'air' || method === 'airplane' || method === '航空便' || method === '飛行機';

  if (isAir) {
    if (loc === 'asu' || loc === 'asuncion') return costItem.asu_air ?? 0;
    if (loc === 'cde' || loc === 'ciudad_del_este' || loc === 'ciudad del este') return costItem.cde_air ?? 0;
    if (loc === 'enc' || loc === 'encarnacion') return costItem.enc_air ?? 0;
    if (loc === 'pjc') return costItem.pjc_air ?? 0;
    if (loc === 'snt' || loc === 'santiago') return costItem.snt_air ?? 0;
    if (loc === 'iqq' || loc === 'iquique') return costItem.iqq_air ?? 0;
    if (loc === 'lpz' || loc === 'lapaz' || loc === 'la paz') return costItem.lpz_air ?? 0;
    if (loc === 'scz' || loc === 'santacruz' || loc === 'santa cruz') return costItem.scz_air ?? 0;
    if (loc === 'bue' || loc === 'buenosaires' || loc === 'buenos aires') return costItem.bue_air ?? 0;
  } else {
    if (loc === 'asu' || loc === 'asuncion') return costItem.asu_sea ?? 0;
    if (loc === 'cde' || loc === 'ciudad_del_este' || loc === 'ciudad del este') return costItem.cde_sea ?? 0;
    if (loc === 'enc' || loc === 'encarnacion') return costItem.enc_sea ?? 0;
    if (loc === 'pjc') return costItem.pjc_sea ?? 0;
    if (loc === 'snt' || loc === 'santiago') return costItem.snt_sea ?? 0;
    if (loc === 'iqq' || loc === 'iquique') return costItem.iqq_sea ?? 0;
    if (loc === 'lpz' || loc === 'lapaz' || loc === 'la paz') return costItem.lpz_sea ?? 0;
    if (loc === 'scz' || loc === 'santacruz' || loc === 'santa cruz') return costItem.scz_sea ?? 0;
    if (loc === 'bue' || loc === 'buenosaires' || loc === 'buenos aires') return costItem.bue_sea ?? 0;
  }

  return 0;
};

/**
 * ブラジルエージェント、B001紐づき顧客などの日本支払額（日本送金額）を計算して返す関数
 * @param item 商品情報
 * @param totalSalePrice 合計売価
 * @returns 日本支払額 (USD)
 */
export const calculateJapanSendAmount = (item: any, totalSalePrice: number, exchangeRate: number = 150): number => {
  if (item.customerId === 'B001' || item.customer_id === 'B001') {
    return totalSalePrice;
  }
  let ownDivisor = 0.6; // デフォルト: 一般顧客 (利益率40%＝除数0.6)
  let targetDivisor = 0.9; // デフォルト: B001本人の仕入れ割合 (利益率10%＝除数0.9)
  
  if (item.agentCustomerId === 'B001' || item.agent_customer_id === 'B001') {
    ownDivisor = 0.5; // B001紐づき
    targetDivisor = 0.6; // 一般顧客 (＝B001紐づき顧客の日本支払額は「一般顧客売価」相当)
  } else if (item.customerId?.startsWith('A') || item.customer_id?.startsWith('A')) {
    const country = (item.customerCountry || item.country || '').trim().toLowerCase();
    if (country === 'brasil' || country === 'brazil') {
      ownDivisor = 0.7; // ブラジルエージェント
      targetDivisor = 0.8; // 通常エージェント (＝ブラジルエージェントの日本支払額は「一般エージェント売価」相当)
    } else {
      ownDivisor = 0.8; // 通常エージェント
      targetDivisor = 0.9; // B001本人
    }
  }

  // 1. もし元の日本円合計金額（total_jpy）が保存されている場合は、日本円から正確に計算します。
  const totalJpy = item.total_jpy || item.totalJpy;
  if (totalJpy && Number(totalJpy) > 0) {
    // 円建て日本支払額の計算 (円金額 / 目標除数)
    const jpySendAmount = Number(totalJpy) / targetDivisor;
    // 直接ドル換算し、5ドル単位で切り上げ (Math.ceil)
    return Math.ceil((jpySendAmount / exchangeRate) / 5) * 5;
  }

  // 2. 元の日本円合計金額がない場合は、5ドル切り上げ済みのドル売価から逆算（-2.5 近似式）します。
  const estimatedBasePrice = totalSalePrice - 2.5;
  return Math.ceil(((estimatedBasePrice * ownDivisor) / targetDivisor) / 5) * 5;
};

/**
 * 顧客のドルオファー上限額（maxBid）から、ヤフオクで入札可能な商品本体価格（JPY）の上限を逆算する関数
 * @param maxBidUsd ドルでの上限額
 * @param customerId 顧客ID
 * @param agentCustomerId 担当エージェント顧客ID
 * @param country 顧客の国名
 * @param title 商品タイトル
 * @param url 商品URL
 * @param exchangeRate JPY為替レート
 * @returns ヤフオク入札可能本体価格 (JPY)
 */
export const calculateProductBidJpy = (
  maxBidUsd: number,
  customerId?: string | null,
  agentCustomerId?: string | null,
  country?: string | null,
  title?: string | null,
  url?: string | null,
  exchangeRate: number = 150
): number => {
  if (!maxBidUsd || maxBidUsd <= 0) return 0;

  const fob = calculateDefaultFobCost(title, url);
  const shipping = calculateDefaultShippingCost(title, url);

  const profitDivisor = (() => {
    if (customerId === 'B001') return 0.9;
    if (agentCustomerId === 'B001') return 0.5;
    if (customerId?.startsWith('A')) {
      const countryLower = (country || '').trim().toLowerCase();
      if (countryLower === 'brasil' || countryLower === 'brazil') {
        return 0.7;
      }
      return 0.8;
    }
    return 0.6;
  })();

  const totalJpyLimit = maxBidUsd * exchangeRate * profitDivisor;
  const maxProductJpy = totalJpyLimit - fob - shipping;
  // 千の位で切り捨て (例: 41,895 -> 41,000)
  return Math.max(0, Math.floor(maxProductJpy / 1000) * 1000);
};

/**
 * 商品タイトルやURLから、カテゴリに応じたFOB費用（JPY）を判定して返す関数
 * @param title 商品タイトル
 * @param url 商品のURL
 * @returns デフォルトのFOB費用 (JPY)
 */
export const calculateDefaultFobCost = (title?: string | null, url?: string | null): number => {
  loadCostsData();

  let jcat: string | null = null;
  let decodedUrl = url || '';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  try { decodedUrl = decodeURIComponent(url || ''); } catch (_e) {}

  // 1. URLパラメータからjcat（フロントエンドのカテゴリID）を抽出
  const jcatMatch = decodedUrl.match(/[?&]jcat=([^&]+)/);
  if (jcatMatch) {
    jcat = jcatMatch[1];
  }

  const lowerUrl = decodedUrl.toLowerCase();
  const lowerTitle = (title || '').toLowerCase();

  // --- 0. パーツ・部品（フロントガラス、ライト、ホイール、シート等）の判定 ---
  // タイトルやURLにパーツ関連の単語がある場合は、車種名（シルビア、スープラ等）が含まれていても車両FOB（54,000円）を適用しない
  const isCarPart = 
    lowerTitle.includes('フロントガラス') ||
    lowerTitle.includes('ガラス') ||
    lowerTitle.includes('バンパー') ||
    lowerTitle.includes('フェンダー') ||
    lowerTitle.includes('ドア') ||
    lowerTitle.includes('ボンネット') ||
    lowerTitle.includes('トランク') ||
    lowerTitle.includes('スポイラー') ||
    lowerTitle.includes('ウイング') ||
    lowerTitle.includes('グリル') ||
    lowerTitle.includes('ライト') ||
    lowerTitle.includes('ヘッドライト') ||
    lowerTitle.includes('テールランプ') ||
    lowerTitle.includes('テール') ||
    lowerTitle.includes('ウインカー') ||
    lowerTitle.includes('マフラー') ||
    lowerTitle.includes('エキマニ') ||
    lowerTitle.includes('パイプ') ||
    lowerTitle.includes('サスペンション') ||
    lowerTitle.includes('サス') ||
    lowerTitle.includes('車高調') ||
    lowerTitle.includes('ショック') ||
    lowerTitle.includes('スプリング') ||
    lowerTitle.includes('シート') ||
    lowerTitle.includes('ステアリング') ||
    lowerTitle.includes('ハンドル') ||
    lowerTitle.includes('メーター') ||
    lowerTitle.includes('ホイール') ||
    lowerTitle.includes('タイヤ') ||
    lowerTitle.includes('ブレーキ') ||
    lowerTitle.includes('キャリパー') ||
    lowerTitle.includes('ローター') ||
    lowerTitle.includes('ミッション') ||
    lowerTitle.includes('クラッチ') ||
    lowerTitle.includes('デフ') ||
    lowerTitle.includes('ドライブシャフト') ||
    lowerTitle.includes('タービン') ||
    lowerTitle.includes('インタークーラー') ||
    lowerTitle.includes('ラジエーター') ||
    lowerTitle.includes('ecu') ||
    lowerTitle.includes('コンピューター') ||
    lowerTitle.includes('ハーネス') ||
    lowerTitle.includes('配線') ||
    lowerTitle.includes('スイッチ') ||
    lowerTitle.includes('センサー') ||
    lowerTitle.includes('純正') ||
    lowerTitle.includes('外装') ||
    lowerTitle.includes('内装') ||
    lowerTitle.includes('パネル') ||
    lowerTitle.includes('カバー') ||
    lowerTitle.includes('パーツ') ||
    lowerTitle.includes('部品');

  // --- 0.5 大物自動車部品（エンジン、バンパー・外装、シート、マフラー、ミッション等）の最優先判定 ---
  if (isEngineUnit(lowerTitle, lowerUrl)) {
    const motorCost = cachedFobCosts.find(i => i.key === 'motor');
    return motorCost ? motorCost.fob : 1500;
  }
  if (isCarroceriaUnit(lowerTitle, lowerUrl)) {
    const cost = cachedFobCosts.find(i => i.key === 'carroceria');
    return cost ? cost.fob : 1500;
  }
  if (isSeatUnit(lowerTitle, lowerUrl)) {
    const cost = cachedFobCosts.find(i => i.key === 'asiento');
    return cost ? cost.fob : 1500;
  }
  if (isMufflerUnit(lowerTitle, lowerUrl)) {
    const cost = cachedFobCosts.find(i => i.key === 'escape');
    return cost ? cost.fob : 1500;
  }
  if (isTransmissionUnit(lowerTitle, lowerUrl)) {
    const cost = cachedFobCosts.find(i => i.key === 'transmision');
    return cost ? cost.fob : 1500;
  }

  // --- 1. URL内のヤフオクカテゴリIDによる厳密な判定 ---
  let matchedItem: FobCostItem | null = null;
  for (const item of cachedFobCosts) {
    if (item.categoryIds.length > 0 && item.categoryIds.some(id => lowerUrl.includes(id))) {
      // 車両本体FOB（54,000円以上）の場合、パーツ単語が含まれていたら除外
      if (item.fob >= 50000 && isCarPart) {
        continue;
      }
      // 大物カテゴリの場合、部品単体・小物であれば除外
      if (!isCategoryUnitItem(item.key, lowerTitle, lowerUrl)) {
        continue;
      }
      matchedItem = item;
      break;
    }
  }

  if (matchedItem) {
    return matchedItem.fob;
  }

  // --- 2. jcatがあればマスタデータからFOB費用を取得 (上記カテゴリIDで一致しなかった場合) ---
  if (jcat) {
    const sizeCost = cachedFobCosts.find(i => i.key === jcat);
    if (sizeCost) {
      if (sizeCost.fob >= 50000 && isCarPart) {
        return 1500;
      }
      if (!isCategoryUnitItem(sizeCost.key, lowerTitle, lowerUrl)) {
        return 1500;
      }
      return sizeCost.fob;
    }
  }

  // --- 3. キーワード判定（車両本体FOBは自動車車体カテゴリ26360または部品取り2084061280がある場合のみ） ---
  const isVehicleCategory = lowerUrl.includes('26360') || lowerUrl.includes('2084061280') || lowerUrl.includes('26316');
  for (const item of cachedFobCosts) {
    if (item.fob >= 50000 && (!isVehicleCategory || isCarPart)) {
      // 車両本体FOBは車両カテゴリ以外またはパーツ商品には絶対に適用しない
      continue;
    }
    if (!isCategoryUnitItem(item.key, lowerTitle, lowerUrl)) {
      continue;
    }
    if (item.keywords.some(keyword => matchesCostKeyword(lowerTitle, keyword) || matchesCostKeyword(lowerUrl, keyword))) {
      return item.fob;
    }
  }

  return 1500;
};



/**
 * 商品タイトルやURLから、自動車部品カテゴリに応じたデフォルトの送料（JPY）を判定して返す関数
 * @param title 商品タイトル
 * @param url 商品のURL
 * @returns デフォルトの送料 (JPY)
 */
export const calculateDefaultShippingCost = (title?: string | null, url?: string | null): number => {
  loadCostsData();

  let jcat: string | null = null;
  let decodedUrl = url || '';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  try { decodedUrl = decodeURIComponent(url || ''); } catch (_e) {}

  // 1. URLパラメータからjcatを抽出
  const jcatMatch = decodedUrl.match(/[?&]jcat=([^&]+)/);
  if (jcatMatch) {
    jcat = jcatMatch[1];
  }

  const lowerUrl = decodedUrl.toLowerCase();
  const lowerTitle = (title || '').toLowerCase();

  // --- 0. 車両本体（自動車車体、バイク車体、部品取り車、自転車本体等）は送料0円（要見積もり）とする ---
  const isVehicle = 
    lowerUrl.includes('26360') || // 自動車車体
    lowerUrl.includes('26316') || // オートバイ車体
    lowerUrl.includes('2084061280') || // 部品取り車
    lowerUrl.includes('26246') || // 自転車本体
    lowerTitle.includes('部品取り') ||
    lowerTitle.includes('丸車') ||
    lowerTitle.includes('バイク') ||
    lowerTitle.includes('オートバイ') ||
    lowerTitle.includes('二輪') ||
    (lowerUrl.includes('moto') && !lowerUrl.includes('motor')) ||
    lowerUrl.includes('desarme');

  if (isVehicle) {
    return 0;
  }

  // --- 0.5 大物自動車部品（エンジン本体、バンパー・外装、シート本体、マフラー、ミッション等）の最優先判定 ---
  // タイトルに明確に大物確定ワードがある場合は、正規の大型送料を最優先適用
  if (isEngineUnit(lowerTitle, lowerUrl)) {
    const cost = cachedShippingCosts.find(i => i.key === 'motor');
    return cost ? cost.shipping : 10000;
  }
  if (isCarroceriaUnit(lowerTitle, lowerUrl)) {
    const cost = cachedShippingCosts.find(i => i.key === 'carroceria');
    return cost ? cost.shipping : 10000;
  }
  if (isSeatUnit(lowerTitle, lowerUrl)) {
    const cost = cachedShippingCosts.find(i => i.key === 'asiento');
    return cost ? cost.shipping : 9000;
  }
  if (isMufflerUnit(lowerTitle, lowerUrl)) {
    const cost = cachedShippingCosts.find(i => i.key === 'escape');
    return cost ? cost.shipping : 8000;
  }
  if (isTransmissionUnit(lowerTitle, lowerUrl)) {
    const cost = cachedShippingCosts.find(i => i.key === 'transmision');
    return cost ? cost.shipping : 8000;
  }

  // --- 1. URL内のヤフオクカテゴリIDによる厳密な判定 ---
  let matchedItem: ShippingCostItem | null = null;
  for (const item of cachedShippingCosts) {
    if (item.categoryIds.some(id => lowerUrl.includes(id))) {
      // 大物カテゴリ（外装、シート、マフラー、ミッション、ホイール、ブレーキ、ライト等）の場合、小物・補修品であれば除外
      if (!isCategoryUnitItem(item.key, lowerTitle, lowerUrl)) {
        continue;
      }
      matchedItem = item;
      break;
    }
  }

  if (matchedItem) {
    // タイヤ・ホイールセット系の特別マッピング処理（jcatを考慮）
    if (matchedItem.key === 'llantas') {
      if (jcat && ['ll16', 'll17', 'll18', 'llantas'].includes(jcat)) {
        const sizeCost = cachedShippingCosts.find(i => i.key === jcat);
        if (sizeCost) return sizeCost.shipping;
      }
      if (jcat === 'ar16') {
        const sizeCost = cachedShippingCosts.find(i => i.key === 'll16');
        if (sizeCost) return sizeCost.shipping;
      }
      if (jcat === 'ar17') {
        const sizeCost = cachedShippingCosts.find(i => i.key === 'll17');
        if (sizeCost) return sizeCost.shipping;
      }
      if (jcat === 'ar18') {
        const sizeCost = cachedShippingCosts.find(i => i.key === 'll18');
        if (sizeCost) return sizeCost.shipping;
      }
      if (jcat === 'aros') {
        const sizeCost = cachedShippingCosts.find(i => i.key === 'llantas');
        if (sizeCost) return sizeCost.shipping;
      }
      return matchedItem.shipping;
    }

    if (matchedItem.key === 'aros') {
      if (jcat && ['ar16', 'ar17', 'ar18', 'aros'].includes(jcat)) {
        const sizeCost = cachedShippingCosts.find(i => i.key === jcat);
        if (sizeCost) return sizeCost.shipping;
      }
      return matchedItem.shipping;
    }

    return matchedItem.shipping;
  }

  // --- 2. jcatがあればマスタデータから送料を取得 (上記カテゴリIDで一致しなかった場合) ---
  if (jcat) {
    const sizeCost = cachedShippingCosts.find(i => i.key === jcat);
    if (sizeCost) {
      if (!isCategoryUnitItem(sizeCost.key, lowerTitle, lowerUrl)) {
        return 1000;
      }
      return sizeCost.shipping;
    }
  }

  // --- 3. URLにカテゴリIDがない場合のフォールバック判定（タイトルやキーワードによる判定） ---
  for (const item of cachedShippingCosts) {
    if (!isCategoryUnitItem(item.key, lowerTitle, lowerUrl)) {
      continue;
    }
    if (item.keywords.some(keyword => matchesCostKeyword(lowerTitle, keyword) || matchesCostKeyword(lowerUrl, keyword))) {
      return item.shipping;
    }
  }

  // 自動車部品・車両本体以外のすべての一般カテゴリはデフォルトで1,000円とする
  return 1000;
};

// 招待コードのインターフェース定義
export interface InviteCode {
  code: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

/**
 * 有効期限切れから24時間が経過した招待コードをリストから削除するヘルパー関数
 * @param inviteCodes 招待コードの配列
 * @returns 削除対象を除外した新しい配列と、削除が発生したかどうかのフラグ
 */
export function cleanExpiredInviteCodes(inviteCodes: InviteCode[]): { cleanedCodes: InviteCode[]; isUpdated: boolean } {
  const now = Date.now();
  const limitTime = 24 * 60 * 60 * 1000; // 24時間 (ミリ秒)
  
  let isUpdated = false;
  const cleanedCodes = inviteCodes.filter(code => {
    const expiresTime = new Date(code.expiresAt).getTime();
    // 有効期限切れ後24時間を超えている場合は削除 (除外) する
    if (expiresTime + limitTime <= now) {
      isUpdated = true;
      return false;
    }
    return true;
  });
  
  return { cleanedCodes, isUpdated };
}

/**
 * URLまたはID文字列からヤフオクの商品・オークションIDを抽出・正規化する関数
 */
export function extractAuctionId(urlOrId?: string | null): string {
  if (!urlOrId) return '';
  const trimmed = urlOrId.trim();
  const match = trimmed.match(/\/auction\/([a-zA-Z0-9]+)/i);
  if (match && match[1]) return match[1].toLowerCase();
  
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const urlPath = trimmed.split('?')[0];
    const parts = urlPath.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1];
    if (lastPart) return lastPart.toLowerCase();
  }
  return trimmed.split('?')[0].toLowerCase();
}

/**
 * ローカルストレージに保存されている申請済み商品IDリストを取得する
 */
export function getLocalOfferedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem('jogalibre_offered_ids') || localStorage.getItem('joga_offered_ids');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.warn('Error reading jogalibre_offered_ids:', e);
  }
  return [];
}

/**
 * ローカルストレージに申請済み商品IDを追加・同期する
 */
export function addLocalOfferedId(idOrUrl: string) {
  if (typeof window === 'undefined') return;
  const cleanId = extractAuctionId(idOrUrl);
  if (!cleanId) return;
  try {
    const current = getLocalOfferedIds();
    if (!current.includes(cleanId)) {
      const updated = [...current, cleanId];
      localStorage.setItem('jogalibre_offered_ids', JSON.stringify(updated));
    }
  } catch (e) {
    console.warn('Error saving jogalibre_offered_ids:', e);
  }
}

/**
 * ローカルストレージから指定した申請済み商品IDを削除する
 */
export function removeLocalOfferedId(idOrUrl: string) {
  if (typeof window === 'undefined') return;
  const cleanId = extractAuctionId(idOrUrl);
  if (!cleanId) return;
  try {
    const current = getLocalOfferedIds();
    const updated = current.filter(id => id !== cleanId);
    localStorage.setItem('jogalibre_offered_ids', JSON.stringify(updated));
  } catch (e) {
    console.warn('Error removing from jogalibre_offered_ids:', e);
  }
}

/**
 * 最新のリクエスト一覧からローカルストレージを完全上書き同期する
 */
export function syncLocalOfferedIds(idsOrUrls: string[]) {
  if (typeof window === 'undefined') return;
  try {
    const normalizedIds = Array.from(new Set(idsOrUrls.map(extractAuctionId).filter(Boolean)));
    localStorage.setItem('jogalibre_offered_ids', JSON.stringify(normalizedIds));
  } catch (e) {
    console.warn('Error syncing jogalibre_offered_ids:', e);
  }
}

/**
 * Android端末、各種ブラウザ、WebView、非セキュア環境でも安全にクリップボードへコピーする堅牢な関数
 */
export async function copyToClipboardSafe(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. モダンブラウザの Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 権限エラーや非セキュアコンテキスト時はフォールバックへ
    }
  }

  // 2. textarea を用いた execCommand フォールバック（Android WebView / アプリ内ブラウザ対応）
  if (typeof document !== 'undefined') {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      textArea.setAttribute('readonly', '');
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.warn('Fallback copy error:', err);
      return false;
    }
  }

  return false;
}
