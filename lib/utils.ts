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
