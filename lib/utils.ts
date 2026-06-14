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

  const date = parseDbDateTime(dateString);
  if (!date || isNaN(date.getTime())) return dateString;

  if (isNaN(date.getTime())) return dateString;

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
  } else {
    // タイムゾーンがある場合も、スペースを 'T' に置換しておくことで Safari 等でのパースエラーを防ぐ
    cleanStr = cleanStr.replace(' ', 'T');
  }

  const parsed = new Date(cleanStr);
  return isNaN(parsed.getTime()) ? null : parsed;
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

/**
 * 商品渡し場所と商品カテゴリ（将来拡張用）に基づいて現地費用（USD）を計算して返す関数
 * @param deliveryLocation 商品渡し場所 ('JP', 'ASU', 'ENC', 'PJC')
 * @param item 商品情報 (将来的にカテゴリ判定に使用)
 * @returns 現地費用 (USD建ての数値、日本渡しは0)
 */
export const calculateLocalCost = (deliveryLocation?: string, item?: any): number => {
  // 現在は個別相談（Consultar）のため、計算上は0を返します。
  // 将来的にカテゴリ・引渡場所ごとの金額設定をここに実装します。
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
    // 1,000円未満切り上げ
    const jpySendAmountRounded = Math.ceil(jpySendAmount / 1000) * 1000;
    // ドル換算 ＋ 10ドル単位で四捨五入 (Math.round)
    return Math.round((jpySendAmountRounded / exchangeRate) / 10) * 10;
  }

  // 2. 元の日本円合計金額がない場合は、10ドル切り上げ済みのドル売価から逆算（-5 近似式）します。
  const estimatedBasePrice = totalSalePrice - 5;
  return Math.ceil(((estimatedBasePrice * ownDivisor) / targetDivisor) / 10) * 10;
};

import { CATEGORY_COSTS } from './category-costs';

/**
 * 商品タイトルやURLから、カテゴリに応じたFOB費用（JPY）を判定して返す関数
 * @param title 商品タイトル
 * @param url 商品のURL
 * @returns デフォルトのFOB費用 (JPY)
 */
export const calculateDefaultFobCost = (title?: string | null, url?: string | null): number => {
  let jcat: string | null = null;
  let decodedUrl = url || '';
  try { decodedUrl = decodeURIComponent(url || ''); } catch (e) {}

  // 1. URLパラメータからjcat（フロントエンドのカテゴリID）を抽出
  const jcatMatch = decodedUrl.match(/[?&]jcat=([^&]+)/);
  if (jcatMatch) {
    jcat = jcatMatch[1];
  }

  // 2. jcatがあればマスタデータからFOB費用を取得
  if (jcat && CATEGORY_COSTS[jcat] && CATEGORY_COSTS[jcat].fob !== undefined) {
    return CATEGORY_COSTS[jcat].fob as number;
  }

  // 3. jcatがない場合（URL直接入力など）のフォールバック判定
  const lowerTitle = (title || '').toLowerCase();
  const lowerUrl = decodedUrl.toLowerCase();

  if (
    lowerTitle.includes('desarme') ||
    lowerTitle.includes('desmanche') ||
    lowerTitle.includes('部品取り') ||
    lowerTitle.includes('丸車') ||
    lowerTitle.includes('書類無し') ||
    lowerUrl.includes('desarme') ||
    lowerUrl.includes('desmanche') ||
    lowerUrl.includes('2084061280') ||
    lowerUrl.includes('部品取り')
  ) {
    return CATEGORY_COSTS['desarme'].fob as number;
  }

  if (
    lowerTitle.includes('moto') ||
    lowerTitle.includes('バイク') ||
    lowerTitle.includes('オートバイ') ||
    lowerTitle.includes('二輪') ||
    lowerTitle.includes('motorcycle') ||
    lowerUrl.includes('moto') ||
    lowerUrl.includes('バイク') ||
    lowerUrl.includes('26316')
  ) {
    return CATEGORY_COSTS['moto'].fob as number;
  }

  if (lowerTitle.includes('supra') || lowerTitle.includes('スープラ') || lowerTitle.includes('jza80') || lowerUrl.includes('supra') || lowerUrl.includes('スープラ')) return CATEGORY_COSTS['supra'].fob as number;
  if (lowerTitle.includes('skyline') || lowerTitle.includes('スカイライン') || lowerTitle.includes('gt-r') || lowerTitle.includes('gtr') || lowerTitle.includes('bnr32') || lowerTitle.includes('bcnr33') || lowerTitle.includes('bnr34') || lowerUrl.includes('skyline') || lowerUrl.includes('スカイライン') || lowerUrl.includes('gt-r') || lowerUrl.includes('gtr')) return CATEGORY_COSTS['skyline'].fob as number;
  if (lowerTitle.includes('lancer') || lowerTitle.includes('evo') || lowerTitle.includes('ランエボ') || lowerTitle.includes('エボ') || lowerTitle.includes('ランサー') || lowerUrl.includes('lancer') || lowerUrl.includes('ランエボ') || lowerUrl.includes('ランサー')) return CATEGORY_COSTS['lancer'].fob as number;
  if (lowerTitle.includes('rx-7') || lowerTitle.includes('rx7') || lowerTitle.includes('fd3s') || lowerTitle.includes('fc3s') || lowerUrl.includes('rx-7') || lowerUrl.includes('rx7')) return CATEGORY_COSTS['rx7'].fob as number;
  if (lowerTitle.includes('silvia') || lowerTitle.includes('シルビア') || lowerTitle.includes('シルホア') || lowerTitle.includes('s13') || lowerTitle.includes('s14') || lowerTitle.includes('s15') || lowerUrl.includes('silvia') || lowerUrl.includes('シルビア') || lowerUrl.includes('シルホア')) return CATEGORY_COSTS['silvia'].fob as number;
  if (lowerTitle.includes('impreza') || lowerTitle.includes('インプレッサ') || lowerTitle.includes('gc8') || lowerUrl.includes('impreza') || lowerUrl.includes('インプレッサ')) return CATEGORY_COSTS['impreza'].fob as number;

  return 1500;
};

/**
 * 商品タイトルやURLから、自動車部品カテゴリに応じたデフォルトの送料（JPY）を判定して返す関数
 * @param title 商品タイトル
 * @param url 商品のURL
 * @returns デフォルトの送料 (JPY)
 */
export const calculateDefaultShippingCost = (title?: string | null, url?: string | null): number => {
  let jcat: string | null = null;
  let decodedUrl = url || '';
  try { decodedUrl = decodeURIComponent(url || ''); } catch (e) {}

  // 1. URLパラメータからjcatを抽出
  const jcatMatch = decodedUrl.match(/[?&]jcat=([^&]+)/);
  if (jcatMatch) {
    jcat = jcatMatch[1];
  }

  // 2. jcatがあればマスタデータから送料を取得
  if (jcat && CATEGORY_COSTS[jcat] && CATEGORY_COSTS[jcat].shipping !== undefined) {
    return CATEGORY_COSTS[jcat].shipping as number;
  }

  // 3. jcatがない場合のフォールバック判定
  const lowerTitle = (title || '').toLowerCase();
  const lowerUrl = decodedUrl.toLowerCase();

  if (lowerTitle.includes('motor') || lowerTitle.includes('エンジン') || lowerUrl.includes('motor') || lowerUrl.includes('2084200282')) return CATEGORY_COSTS['motor'].shipping as number;
  if (lowerTitle.includes('transmisión') || lowerTitle.includes('transmision') || lowerTitle.includes('transmissão') || lowerTitle.includes('transmissao') || lowerTitle.includes('トランスミッション') || lowerTitle.includes('ミッション') || lowerUrl.includes('transmision') || lowerUrl.includes('2084008426')) return CATEGORY_COSTS['transmision'].shipping as number;
  if (lowerTitle.includes('llantas') || lowerTitle.includes('rodas') || lowerTitle.includes('タイヤ') || lowerUrl.includes('llantas') || lowerUrl.includes('2084200183')) return CATEGORY_COSTS['llantas'].shipping as number;
  if (lowerTitle.includes('aros') || lowerTitle.includes('ホイール') || lowerTitle.includes('アルミ') || lowerUrl.includes('aros') || lowerUrl.includes('2084005140')) return CATEGORY_COSTS['aros'].shipping as number;
  if (lowerTitle.includes('suspensión') || lowerTitle.includes('suspension') || lowerTitle.includes('suspensão') || lowerTitle.includes('suspensao') || lowerTitle.includes('サスペンション') || lowerTitle.includes('サス') || lowerTitle.includes('車高調') || lowerTitle.includes('スプリング') || lowerTitle.includes('ショック') || lowerUrl.includes('suspension') || lowerUrl.includes('2084005257')) return CATEGORY_COSTS['suspension'].shipping as number;
  if (lowerTitle.includes('asiento') || lowerTitle.includes('assento') || lowerTitle.includes('シート') || lowerTitle.includes('レカロ') || lowerTitle.includes('recaro') || lowerTitle.includes('セミバケ') || lowerTitle.includes('フルバケ') || lowerUrl.includes('asiento') || lowerUrl.includes('2084005258')) return CATEGORY_COSTS['asiento'].shipping as number;
  if (lowerTitle.includes('barras') || lowerTitle.includes('タワーバー') || lowerTitle.includes('ロールバー') || lowerTitle.includes('補強') || lowerUrl.includes('barras') || lowerUrl.includes('2084008461')) return CATEGORY_COSTS['barras'].shipping as number;
  if (lowerTitle.includes('freno') || lowerTitle.includes('freio') || lowerTitle.includes('ブレーキ') || lowerTitle.includes('ブレンボ') || lowerTitle.includes('brembo') || lowerTitle.includes('キャリパー') || lowerTitle.includes('ローター') || lowerUrl.includes('freno') || lowerUrl.includes('2084005259')) return CATEGORY_COSTS['freno'].shipping as number;
  if (lowerTitle.includes('audio') || lowerTitle.includes('som') || lowerTitle.includes('オーディオ') || lowerTitle.includes('スピーカー') || lowerTitle.includes('アンプ') || lowerTitle.includes('ウーファー') || lowerTitle.includes('サブウーファー') || lowerTitle.includes('プレーヤー') || lowerTitle.includes('player') || lowerTitle.includes('reproductor') || lowerTitle.includes('amplificador') || lowerTitle.includes('subwoofer') || lowerTitle.includes('altavoz') || lowerTitle.includes('altavoces') || lowerTitle.includes('alto-falantes') || lowerUrl.includes('audio') || lowerUrl.includes('23852')) return CATEGORY_COSTS['caraudio'].shipping as number;

  return 0;
};
