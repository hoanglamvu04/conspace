export const READER_COOKIE = 'conspace_reader';
export const READER_IDS = Object.freeze(['homeowner', 'architect', 'contractor']);

export function readReaderCookie(cookieString) {
  const parts = String(cookieString || '').split(';');
  for (const part of parts) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== READER_COOKIE) continue;
    let value = part.slice(index + 1).trim();
    try { value = decodeURIComponent(value); } catch { return 'homeowner'; }
    return READER_IDS.includes(value) ? value : 'homeowner';
  }
  return 'homeowner';
}

export function readerCookieValue(id) {
  if (!READER_IDS.includes(id)) return null;
  return READER_COOKIE + '=' + id + '; Max-Age=31536000; Path=/; SameSite=Lax';
}

export function sortByLens(items, role) {
  const priority = READER_IDS.includes(role) ? role : 'homeowner';
  const score = (item) => item?.audienceRole === priority ? 0 : item?.audienceRole == null || item.audienceRole === '' ? 1 : 2;
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({ item, index }))
    .sort((a, b) => score(a.item) - score(b.item) || a.index - b.index)
    .map((entry) => entry.item);
}

export function mergePriorityPages(priorityItems, allItems) {
  const seen = new Set();
  const result = [];
  for (const item of [...(Array.isArray(priorityItems) ? priorityItems : []), ...(Array.isArray(allItems) ? allItems : [])]) {
    if (!item || typeof item.id !== 'string' || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

export function sortByPriorityIds(items, priorityIds) {
  const ids = priorityIds instanceof Set ? priorityIds : new Set(priorityIds || []);
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const rank = Number(ids.has(b.item.id)) - Number(ids.has(a.item.id));
      if (rank) return rank;
      const dateA = Date.parse(a.item.publishedAt || '') || 0;
      const dateB = Date.parse(b.item.publishedAt || '') || 0;
      return dateB - dateA || a.index - b.index;
    })
    .map((entry) => entry.item);
}
