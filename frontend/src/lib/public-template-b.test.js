import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const nicheDetail = readFileSync(new URL('../pages/NicheDetailV1.jsx', import.meta.url), 'utf8');

test('public Template B renders seven architecture blocks from published API data', () => {
  assert.ok(nicheDetail.includes('function DesignBlocks'));
  assert.ok(nicheDetail.includes('TEMPLATE B / 07 KHỐI'));
  assert.ok(nicheDetail.includes("section.content"));
  assert.ok(nicheDetail.includes("section.sourceRef"));
  assert.ok(nicheDetail.includes('Chưa có nội dung đã kiểm duyệt và đủ nguồn để công khai.'));
  assert.ok(nicheDetail.includes('<DesignBlocks sections={niche.sections||[]}'));
  assert.ok(!nicheDetail.includes('Hồ sơ mảng kiến trúc có cấu trúc riêng'));
});
