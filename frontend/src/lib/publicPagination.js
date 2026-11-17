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
