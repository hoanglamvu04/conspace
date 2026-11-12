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

const NICHE_LAYER_MAPPING = Object.freeze({
  homeowner: [1, 3, 4, 5, 7, 11],
  contractor: [1, 6, 8, 9, 10],
  architect: [2, 9, 10],
});

export function nicheLayersForRole(sections, role) {
  if (!Array.isArray(sections) || !NICHE_LAYER_MAPPING[role]) return [];
  const byNumber = new Map(sections.map((section) => [section.sectionNo, section]));
  return NICHE_LAYER_MAPPING[role].flatMap((sectionNo) => {
    const section = byNumber.get(sectionNo);
    if (!section) return [];
    const layer = Array.isArray(section.layers)
      ? section.layers.find((item) => item.audienceRole === role && typeof item.content === 'string' && item.content.trim())
      : null;
    return [{
      sectionNo,
      key: section.key,
      title: section.title,
      content: layer?.content || '',
      sourceRef: layer?.sourceRef || null,
      published: Boolean(layer?.content),
    }];
  });
}

export function addOpenLayerRole(current, selectedRole) {
  const roles = Array.isArray(current) ? current : [];
  return roles.includes(selectedRole) ? roles : [...roles, selectedRole];
}

export function toggleOpenLayerRole(current, role, open) {
  const roles = Array.isArray(current) ? current : [];
  if (open) return addOpenLayerRole(roles, role);
  return roles.filter((item) => item !== role);
}

export function chapterDisplayLabel(bookSlug, chapterNo, title) {
  if (typeof title === 'string' && title.trim()) return title;
  const prefix = bookSlug === 'cam-nang-kien-truc-hoa-lac' ? 'Phần ' : 'Chương ';
  return prefix + Number(chapterNo);
}
