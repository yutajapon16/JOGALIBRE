export async function translateTitle(title: string, targetLang: string): Promise<string> {
  if (!title || targetLang === 'ja') return title;
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=${targetLang}&dt=t`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ q: title }).toString(),
        cache: 'no-store'
      }
    );
    if (!res.ok) {
      throw new Error(`Google Translate API Error: ${res.status}`);
    }
    const data = await res.json();
    const translated = data?.[0]?.map((x: string[]) => x[0]).join('') || title;
    return translated.trim();
  } catch (e) {
    console.error(`Error translating to ${targetLang}:`, e);
    return title; // Fallback to original title
  }
}
