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
  if (!deliveryLocation || deliveryLocation === 'JP') return 0;
  
  // 【将来的な変更用】渡し場所やカテゴリによる分岐をここで一元管理できます。
  // 例:
  // if (deliveryLocation === 'ASU') {
  //   if (item?.category === 'car') return 500;
  //   return 200;
  // }
  
  return 200; // 現在は仮として一律 $200
};

/**
 * ブラジルエージェント、B001紐づき顧客などの日本支払額（日本送金額）を計算して返す関数
 * @param item 商品情報
 * @param totalSalePrice 合計売価
 * @returns 日本支払額 (USD)
 */
export const calculateJapanSendAmount = (item: any, totalSalePrice: number): number => {
  if (item.customerId === 'B001' || item.customer_id === 'B001') {
    return totalSalePrice;
  }
  let ownDivisor = 0.6; // デフォルト: 一般顧客 (利益率40%＝除数0.6)
  let targetDivisor = 0.9; // デフォルト: B001本人の仕入れ割合 (利益率10%＝除数0.9)
  
  if (item.agentCustomerId === 'B001' || item.agent_customer_id === 'B001') {
    ownDivisor = 0.5; // B001紐づき (利益率50%＝除数0.5)
    targetDivisor = 0.6; // 一般顧客 (利益率40%＝除数0.6)
  } else if (item.customerId?.startsWith('A') || item.customer_id?.startsWith('A')) {
    const country = (item.customerCountry || item.country || '').trim().toLowerCase();
    if (country === 'brasil' || country === 'brazil') {
      ownDivisor = 0.7; // ブラジルエージェント (利益率30%＝除数0.7)
      targetDivisor = 0.8; // 通常エージェント (利益率20%＝除数0.8)
    } else {
      ownDivisor = 0.8; // 通常エージェント (利益率20%＝除数0.8)
      targetDivisor = 0.9; // B001本人 (利益率10%＝除数0.9)
    }
  }
  return Math.ceil(((totalSalePrice * ownDivisor) / targetDivisor) / 10) * 10;
};

