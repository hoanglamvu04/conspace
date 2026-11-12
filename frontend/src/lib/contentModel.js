const BOOK_PATHS = Object.freeze({
  'cam-nang-kien-truc-hoa-lac': 'cam-nang',
  'phan-nha-thau-xay-dung': 'phan-nha-thau',
  'quan-quanh-kts': 'quan-quanh-kts',
});

export function chapterPath(bookSlug, chapterNo) {
  const number = Number(chapterNo);
  if (!Number.isInteger(number) || number < 1 || number > 100) return '/tu-sach';
  const prefix = BOOK_PATHS[bookSlug];
  if (prefix === 'cam-nang') return '/cam-nang/phan-' + number + '/muc-' + number;
  if (prefix === 'phan-nha-thau') return '/phan-nha-thau/chuong-' + number;
  if (prefix === 'quan-quanh-kts') return '/quan-quanh-kts/chuong-' + number;
  return '/tu-sach';
}

export function chapterRouteParams({ part, item, chapter }) {
  if (part && item) {
    const match = String(item).match(/^muc-(\\d{1,3})$/);
    const partMatch = String(part).match(/^phan-(\\d{1,3})$/);
    if (!match || !partMatch) return null;
    return { bookSlug: 'cam-nang-kien-truc-hoa-lac', chapterNo: Number(match[1]) };
  }
  if (chapter) {
    const match = String(chapter).match(/^chuong-(\\d{1,3})$/);
    if (!match) return null;
    const bookSlug = String(chapter).startsWith('chuong-') ? null : null;
    return { bookSlug, chapterNo: Number(match[1]) };
  }
  return null;
}

export function nicheLayersForRole(sections, role) {
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((section) => {
    const layer = Array.isArray(section.layers)
      ? section.layers.find((item) => item.audienceRole === role && typeof item.content === 'string' && item.content.trim())
      : null;
    return layer ? [{ sectionNo: section.sectionNo, key: section.key, title: section.title, content: layer.content, sourceRef: layer.sourceRef || null }] : [];
  });
}

export function chapterNumberFromPath(pathname) {
  const value = String(pathname || '');
  const match = value.match(/\\/(?:muc|chuong)-(\\d{1,3})(?:\\/|$)/);
  return match ? Number(match[1]) : null;
}
