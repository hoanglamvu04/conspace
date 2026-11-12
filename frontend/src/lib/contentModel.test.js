import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterPath, nicheLayersForRole } from './contentModel.js';

test('book chapters use the canonical IA route families', () => {
  assert.equal(chapterPath('cam-nang-kien-truc-hoa-lac', 3), '/cam-nang/phan-3/muc-3');
  assert.equal(chapterPath('phan-nha-thau-xay-dung', 12), '/phan-nha-thau/chuong-12');
  assert.equal(chapterPath('quan-quanh-kts', 5), '/quan-quanh-kts/chuong-5');
  assert.equal(chapterPath('unknown-book', 1), '/tu-sach');
  assert.equal(chapterPath('phan-nha-thau-xay-dung', 0), '/tu-sach');
});

test('niche layers are separated by audience while sharing the same source sections', () => {
  const sections = [
    { sectionNo: 1, key: 'scope', title: 'Phạm vi', layers: [
      { audienceRole: 'homeowner', content: 'Chủ nhà cần biết.', sourceRef: 'Nguồn A' },
      { audienceRole: 'contractor', content: 'Nhà thầu cần biết.', sourceRef: 'Nguồn B' },
    ] },
    { sectionNo: 2, key: 'sequence', title: 'Trình tự', layers: [
      { audienceRole: 'architect', content: 'KTS cần biết.', sourceRef: 'Nguồn C' },
    ] },
    { sectionNo: 3, key: 'pricing', title: 'Giá', layers: [] },
  ];
  assert.deepEqual(nicheLayersForRole(sections, 'homeowner').map((item) => item.sectionNo), [1]);
  assert.deepEqual(nicheLayersForRole(sections, 'architect').map((item) => item.sectionNo), [2]);
  assert.deepEqual(nicheLayersForRole(sections, 'contractor').map((item) => item.sectionNo), [1]);
  assert.deepEqual(nicheLayersForRole(sections, 'unknown'), []);
});
