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

export function nicheLayersForRole(sections, role) {
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((section) => {
    const layer = Array.isArray(section.layers)
      ? section.layers.find((item) => item.audienceRole === role && typeof item.content === 'string' && item.content.trim())
      : null;
    return layer ? [{ sectionNo: section.sectionNo, key: section.key, title: section.title, content: layer.content, sourceRef: layer.sourceRef || null }] : [];
  });
}
