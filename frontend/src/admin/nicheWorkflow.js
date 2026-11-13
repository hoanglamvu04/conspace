export const TEMPLATE_A_ROLES = Object.freeze([
  { id: 'homeowner', title: 'Chủ nhà' },
  { id: 'architect', title: 'Kiến trúc sư' },
  { id: 'contractor', title: 'Nhà thầu' },
]);

export function normalizeSectionEnvelope(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.sections)) {
    throw new Error('Phản hồi khối ngách không hợp lệ');
  }
  const templateType = data.templateType === 'TEMPLATE_B' ? 'TEMPLATE_B' : 'TEMPLATE_A';
  const expectedSectionCount = templateType === 'TEMPLATE_B' ? 7 : 12;
  return { templateType, expectedSectionCount, sections: data.sections };
}

export function sectionKey(sectionNo, audienceRole = null) {
  return `${sectionNo}:${audienceRole || 'common'}`;
}

export function mapSectionCells(envelope) {
  const normalized = normalizeSectionEnvelope(envelope);
  const cells = {};
  for (const row of normalized.sections) {
    const role = normalized.templateType === 'TEMPLATE_B' ? null : (row.audienceRole ?? row.storedAudienceRole ?? null);
    const key = sectionKey(row.sectionNo, role);
    cells[key] = {
      id: row.id ?? null,
      sectionNo: row.sectionNo,
      blockKey: row.blockKey ?? null,
      title: row.title ?? '',
      sourceDescription: row.sourceDescription ?? '',
      audienceRole: role,
      content: row.content ?? '',
      sourceRef: row.sourceRef ?? '',
      status: row.status ?? 'DRAFT',
      sensitivityAssessed: Boolean(row.sensitivityAssessed),
      sensitivityFlags: Array.isArray(row.sensitivityFlags) ? row.sensitivityFlags : [],
      requiresChiefReview: Boolean(row.requiresChiefReview),
      submittedAt: row.submittedAt ?? null,
      approvedAt: row.approvedAt ?? null,
      publishedAt: row.publishedAt ?? null,
      existing: Boolean(row.id),
    };
  }
  return { ...normalized, cells };
}

export function buildSectionSavePayload({ templateType, audienceRole, content, sourceRef, sensitivityAssessed, sensitivityFlags }) {
  const payload = {
    content: String(content ?? ''),
    sourceRef: String(sourceRef ?? '').trim() || null,
    sensitivityAssessed: Boolean(sensitivityAssessed),
    sensitivityFlags: Array.isArray(sensitivityFlags) ? [...new Set(sensitivityFlags)] : [],
  };
  if (templateType === 'TEMPLATE_A') payload.audienceRole = audienceRole ?? null;
  return payload;
}

export function buildSectionSubmitPayload(templateType, audienceRole, reason) {
  const payload = { reason: String(reason ?? '').trim() };
  if (templateType === 'TEMPLATE_A') payload.audienceRole = audienceRole ?? null;
  return payload;
}

export function buildSectionPublishPayload(templateType, audienceRole, reason) {
  return buildSectionSubmitPayload(templateType, audienceRole, reason);
}

export function isSectionEditable(status) {
  return ['DRAFT','NEEDS_CHANGES','REJECTED'].includes(status || 'DRAFT');
}

export function isSectionSubmittable(cell) {
  return isSectionEditable(cell?.status) &&
    Boolean(cell?.content?.trim()) &&
    Boolean(cell?.sourceRef?.trim()) &&
    Boolean(cell?.sensitivityAssessed);
}
