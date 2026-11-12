import test from 'node:test';
import assert from 'node:assert/strict';
import { readReaderCookie, readerCookieValue, sortByLens, mergePriorityPages, sortByPriorityIds } from './readerLens.js';

test('reader preference is restored from a same-site cookie regardless of spacing', () => {
  assert.equal(readReaderCookie('theme=light;conspace_reader=architect; other=x'), 'architect');
  assert.equal(readReaderCookie('conspace_reader=contractor'), 'contractor');
  assert.equal(readReaderCookie('conspace_reader=unknown'), 'homeowner');
  assert.equal(readReaderCookie(''), 'homeowner');
});

test('reader cookie is scoped to the whole site and persists for one year', () => {
  assert.equal(readerCookieValue('architect'), 'conspace_reader=architect; Max-Age=31536000; Path=/; SameSite=Lax');
  assert.equal(readerCookieValue('invalid'), null);
});

test('lens sorting prioritizes the selected audience without removing other audiences', () => {
  const items = [
    { id: 'a', audienceRole: 'contractor' },
    { id: 'b', audienceRole: 'homeowner' },
    { id: 'c', audienceRole: null },
    { id: 'd', audienceRole: 'architect' },
  ];
  const sorted = sortByLens(items, 'architect');
  assert.deepEqual(sorted.map((item) => item.id), ['d', 'c', 'a', 'b']);
  assert.equal(sorted.length, items.length);
});

test('priority and unfiltered API pages merge without duplicate IDs', () => {
  const merged = mergePriorityPages([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]);
  assert.deepEqual(merged.map((item) => item.id), ['a', 'b', 'c']);
});

test('priority IDs only reorder; all public records remain available', () => {
  const sorted = sortByPriorityIds([{ id: 'a', publishedAt: '2026-01-01' }, { id: 'b', publishedAt: '2026-02-01' }, { id: 'c', publishedAt: '2026-03-01' }], new Set(['a']));
  assert.deepEqual(sorted.map((item) => item.id), ['a', 'c', 'b']);
});
