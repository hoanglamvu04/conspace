import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterPath, chapterDisplayLabel, nicheLayersForRole, addOpenLayerRole, toggleOpenLayerRole } from './contentModel.js';

test('book chapters use the canonical IA route families', () => {
  assert.equal(chapterPath('cam-nang-kien-truc-hoa-lac', 3), '/cam-nang/phan-3/muc-3');
  assert.equal(chapterPath('phan-nha-thau-xay-dung', 12), '/phan-nha-thau/chuong-12');
  assert.equal(chapterPath('quan-quanh-kts', 5), '/quan-quanh-kts/chuong-5');
  assert.equal(chapterPath('unknown-book', 1), '/tu-sach');
  assert.equal(chapterPath('phan-nha-thau-xay-dung', 0), '/tu-sach');
  assert.equal(chapterDisplayLabel('cam-nang-kien-truc-hoa-lac', 4, null), 'Phần 4');
  assert.equal(chapterDisplayLabel('phan-nha-thau-xay-dung', 4, null), 'Chương 4');
  assert.equal(chapterDisplayLabel('phan-nha-thau-xay-dung', 4, 'Bàn giao'), 'Bàn giao');
});

test('niche layers follow the exact v1.0 mapping and leave unpublished slots empty', () => {
  const sections = Array.from({ length: 12 }, (_, index) => ({
    sectionNo: index + 1,
    key: 'block-' + (index + 1),
    title: 'Khối ' + (index + 1),
    layers: [],
  }));
  sections[0].layers = [
    { audienceRole: 'homeowner', content: 'Chủ nhà cần biết.', sourceRef: 'Nguồn A' },
    { audienceRole: 'contractor', content: 'Nhà thầu cần biết.', sourceRef: 'Nguồn B' },
  ];
  sections[1].layers = [{ audienceRole: 'architect', content: 'KTS cần biết.', sourceRef: 'Nguồn C' }];
  const homeowner = nicheLayersForRole(sections, 'homeowner');
  const architect = nicheLayersForRole(sections, 'architect');
  const contractor = nicheLayersForRole(sections, 'contractor');
  assert.deepEqual(homeowner.map((item) => item.sectionNo), [1, 3, 4, 5, 7, 11]);
  assert.deepEqual(contractor.map((item) => item.sectionNo), [1, 6, 8, 9, 10]);
  assert.deepEqual(architect.map((item) => item.sectionNo), [2, 9, 10]);
  assert.equal(homeowner[0].published, true);
  assert.equal(homeowner[1].published, false);
  assert.equal(homeowner[1].content, '');
  assert.deepEqual(nicheLayersForRole(sections, 'unknown'), []);
});

test('switching the reader opens the new layer without collapsing layers the reader already opened', () => {
  let open = addOpenLayerRole(['homeowner'], 'architect');
  assert.deepEqual(open, ['homeowner', 'architect']);
  open = toggleOpenLayerRole(open, 'contractor', true);
  assert.deepEqual(open, ['homeowner', 'architect', 'contractor']);
  open = toggleOpenLayerRole(open, 'architect', false);
  assert.deepEqual(open, ['homeowner', 'contractor']);
  open = addOpenLayerRole(open, 'architect');
  assert.deepEqual(open, ['homeowner', 'contractor', 'architect']);
});
