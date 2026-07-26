export const formatDateTime = (dateString: string, mode: 'admin' | 'customer' = 'admin') => {
  if (!dateString) return '-';

  const date = parseDbDateTime(dateString);
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
    const [_, y, m, d] = simpleDateMatch;
    if (mode === 'customer') {
      return `${d}/${m}/${y}`;
    } else {
      return `${y}/${m}/${d}`;
    }
  }

  const date = parseDbDateTime(dateString);
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
  const d1 = parseDbDateTime(dateStr);
  if (d1 && !isNaN(d1.getTime())) return d1;
  const d2 = parseJstDateTime(dateStr);
  if (d2 && !isNaN(d2.getTime())) return d2;
  const d3 = new Date(dateStr);
  return isNaN(d3.getTime()) ? null : d3;
};

export const getTimeRemaining = (endTime: string, lang: 'ja' | 'es' | 'pt', timeLeftStr?: string) => {
  if (!endTime) return timeLeftStr || '-';

  // DBからの値（またはAPIからのZ付きISO文字列）なので、parseDbDateTimeを使用する
  const endDate = parseDbDateTime(endTime);
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
 * 商品タイトルやURLからカテゴリキーを判定するヘルパー関数
 */
export const detectCategoryKey = (title?: string | null, url?: string | null): string => {
  loadCostsData();
  
  let jcat: string | null = null;
  let decodedUrl = url || '';
  try { decodedUrl = decodeURIComponent(url || ''); } catch (e) {}

  const jcatMatch = decodedUrl.match(/[?&]jcat=([^&]+)/);
  if (jcatMatch) {
    jcat = jcatMatch[1];
  }

  const lowerUrl = decodedUrl.toLowerCase();
  const lowerTitle = (title || '').toLowerCase();

  // 1. カテゴリIDによる厳密な判定
  for (const item of cachedShippingCosts) {
    if (item.categoryIds.some(id => lowerUrl.includes(id))) {
      return item.key;
    }
  }
  for (const item of cachedFobCosts) {
    if (item.categoryIds.some(id => lowerUrl.includes(id))) {
      return item.key;
    }
  }

  // 2. jcatによる判定
  if (jcat) {
    return jcat;
  }

  // 3. キーワードによるフォールバック判定
  for (const item of cachedShippingCosts) {
    if (item.keywords.some(keyword => {
      if (keyword === 'moto') {
        return lowerTitle.includes('moto') || (lowerUrl.includes('moto') && !lowerUrl.includes('motor'));
      }
      return lowerTitle.includes(keyword) || lowerUrl.includes(keyword);
    })) {
      return item.key;
    }
  }
  for (const item of cachedFobCosts) {
    if (item.keywords.some(keyword => {
      if (keyword === 'moto') {
        return lowerTitle.includes('moto') || (lowerUrl.includes('moto') && !lowerUrl.includes('motor'));
      }
      return lowerTitle.includes(keyword) || lowerUrl.includes(keyword);
    })) {
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
  // 都市コードが「その他（OTH_XX）」で始まる場合は無条件で「要問い合わせ」を返す
  if (cityCode.startsWith('OTH')) {
    return '要問い合わせ';
  }
  
  loadCostsData();

  // タイトルとURLからカテゴリキーを特定
  const title = item?.productTitle || item?.product_title || '';
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
    // 直接ドル換算し、10ドル単位で切り上げ (Math.ceil)
    return Math.ceil((jpySendAmount / exchangeRate) / 10) * 10;
  }

  // 2. 元の日本円合計金額がない場合は、10ドル切り上げ済みのドル売価から逆算（-5 近似式）します。
  const estimatedBasePrice = totalSalePrice - 5;
  return Math.ceil(((estimatedBasePrice * ownDivisor) / targetDivisor) / 10) * 10;
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
  try { decodedUrl = decodeURIComponent(url || ''); } catch (e) {}

  // 1. URLパラメータからjcat（フロントエンドのカテゴリID）を抽出
  const jcatMatch = decodedUrl.match(/[?&]jcat=([^&]+)/);
  if (jcatMatch) {
    jcat = jcatMatch[1];
  }

  const lowerUrl = decodedUrl.toLowerCase();
  const lowerTitle = (title || '').toLowerCase();

  // --- 1. URL内のヤフオクカテゴリIDによる厳密な判定 ---
  let matchedItem: FobCostItem | null = null;
  for (const item of cachedFobCosts) {
    if (item.categoryIds.some(id => lowerUrl.includes(id))) {
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
    if (sizeCost) return sizeCost.fob;
  }

  // --- 3. URLにカテゴリIDがない場合のフォールバック判定（タイトルやキーワードによる判定） ---
  for (const item of cachedFobCosts) {
    if (item.keywords.some(keyword => {
      if (keyword === 'moto') {
        return lowerTitle.includes('moto') || (lowerUrl.includes('moto') && !lowerUrl.includes('motor'));
      }
      return lowerTitle.includes(keyword) || lowerUrl.includes(keyword);
    })) {
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
  try { decodedUrl = decodeURIComponent(url || ''); } catch (e) {}

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

  // --- 1. URL内のヤフオクカテゴリIDによる厳密な判定 ---
  let matchedItem: ShippingCostItem | null = null;
  for (const item of cachedShippingCosts) {
    if (item.categoryIds.some(id => lowerUrl.includes(id))) {
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
    if (sizeCost) return sizeCost.shipping;
  }

  // --- 3. URLにカテゴリIDがない場合のフォールバック判定（タイトルやキーワードによる判定） ---
  for (const item of cachedShippingCosts) {
    if (item.keywords.some(keyword => {
      if (keyword === 'moto') {
        return lowerTitle.includes('moto') || (lowerUrl.includes('moto') && !lowerUrl.includes('motor'));
      }
      return lowerTitle.includes(keyword) || lowerUrl.includes(keyword);
    })) {
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

