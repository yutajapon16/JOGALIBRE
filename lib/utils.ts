export const formatDateTime = (dateString: string, mode: 'admin' | 'customer' = 'admin') => {
  if (!dateString) return '-';

  // タイムゾーン情報がない場合、UTC として扱う(page側) / JSTとして扱う(admin側)の差があったため、
  // admin/page.tsx では "+09:00" を付けて呼んでいたのを統一し、呼び出し側で解決させるか、
  // あるいは元のコードの通り "Z" (またはタイムゾーンなし) としてパースします。
  // ここでは元コードの安全性を重視し、"Z"を付加するアプローチ（page.tsx互換）を基本とします。
  let date: Date;
  if (!dateString.includes('Z') && !dateString.includes('+') && !dateString.includes('-', 10)) {
    date = new Date(dateString + 'Z');
  } else {
    date = new Date(dateString);
  }

  if (isNaN(date.getTime())) return dateString;

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
  let date: Date;
  if (!dateString.includes('Z') && !dateString.includes('+') && !dateString.includes('-', 10)) {
    date = new Date(dateString + 'Z');
  } else {
    date = new Date(dateString);
  }

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

export const getTimeRemaining = (endTime: string, lang: 'ja' | 'es' | 'pt', timeLeftStr?: string) => {
  if (!endTime) return timeLeftStr || '-';

  // タイムゾーン情報がない場合、日本標準時 (JST) として扱う
  let endDate: Date;
  if (!endTime.includes('Z') && !endTime.includes('+') && !endTime.includes('-', 10)) {
    endDate = new Date(endTime + '+09:00');
  } else {
    endDate = new Date(endTime);
  }

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
