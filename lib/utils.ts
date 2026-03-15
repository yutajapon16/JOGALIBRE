export const formatDateTime = (dateString: string) => {
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

  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: localTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  return `${formatter.format(date)} ${localLabel}`;
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
    if (days > 0) return `${days}日 ${hours}時間`;
    if (hours > 0) return `${hours}時間 ${minutes}分`;
    return `${minutes}分`;
  } else {
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.join(' ') || (lang === 'es' ? 'Menos de 1m' : 'Menos de 1m');
  }
};
