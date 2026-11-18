export function searchResultKey(query,role,type,niche) {
  return JSON.stringify([query,role,type,niche]);
}

export function appendUniqueSearchResults(previous,incoming) {
  if(!Array.isArray(incoming))throw new TypeError('Search results must be an array');
  const seen=new Set();
  const output=[];
  for(const item of [...(Array.isArray(previous)?previous:[]),...incoming]){
    if(!item || typeof item.id!=='string' || typeof item.type!=='string')continue;
    const key=item.type+'|'+item.id;
    if(seen.has(key))continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

export function hasMoreQuestionPage(meta,page) {
  return Number.isInteger(meta?.page) && meta.page===page
    && Number.isInteger(meta?.total) && Number.isInteger(meta?.limit)
    && meta.limit>0 && page*meta.limit<meta.total;
}

export function hasMoreFieldPage(meta,offset,receivedCount) {
  return Number.isInteger(meta?.offset) && meta.offset===offset
    && Number.isInteger(meta?.total) && Number.isInteger(receivedCount)
    && receivedCount>0 && meta.total>offset+receivedCount;
}

/** Keeps reader answer cards concise without changing the full published answer detail. */
export function questionAnswerTeaser(value, maxLength = 220) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (text.length <= maxLength) return text;
  const segment = text.slice(0, maxLength + 1);
  const boundary = segment.lastIndexOf(' ');
  const end = boundary >= Math.floor(maxLength * 0.65) ? boundary : maxLength;
  return text.slice(0, end).trimEnd() + '…';
}


// URL-backed filters make the Field Notes / Q&A lists shareable without
// sacrificing the published-only server-side counts or paging.
export function normalizePublicContentFilters(params) {
  const query = params instanceof URLSearchParams ? params : new URLSearchParams(params ?? '');
  const rawQ = (query.get('q') || '').trim();
  const rawNiche = query.get('niche') || '';
  return {
    q: rawQ.length >= 2 && rawQ.length <= 100 ? rawQ : '',
    niche: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawNiche) && rawNiche.length <= 120 ? rawNiche : '',
  };
}

export function buildPublicContentFilterParams(filters) {
  const params = new URLSearchParams();
  const q = String(filters?.q || '').trim();
  const niche = String(filters?.niche || '').trim();
  if (q.length >= 2 && q.length <= 100) params.set('q', q);
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(niche) && niche.length <= 120) params.set('niche', niche);
  return params;
}
