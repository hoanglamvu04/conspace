import test from 'node:test';
import assert from 'node:assert/strict';
import { apiUrl, ApiError, getJson, requireList } from './api.js';

test('builds same-origin versioned URLs and encodes filters', () => {
  assert.equal(apiUrl('/niches', { group: 'design' }), '/api/v1/niches?group=design');
  assert.equal(apiUrl('/terms', { q: 'ép cọc', limit: 20 }), '/api/v1/terms?q=%C3%A9p+c%E1%BB%8Dc&limit=20');
  assert.equal(apiUrl('/articles', { role: 'homeowner', cursor: null }), '/api/v1/articles?role=homeowner');
});

test('rejects unsupported endpoints and unsafe slug paths', () => {
  assert.throws(() => apiUrl('/auth/login'));
  assert.throws(() => apiUrl('/articles/../../secrets'));
});

test('requires real array payload and does not insert placeholder records', () => {
  assert.deepEqual(requireList({ data: [] }), []);
  assert.throws(() => requireList({ data: { count: 38 } }), ApiError);
});

test('handles actual API error envelopes', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ ok: false, error: { code: 'UNAVAILABLE', message: 'Tạm bảo trì' } }) });
  try {
    await assert.rejects(getJson('/api/v1/articles'), { name: 'ApiError', status: 503, code: 'UNAVAILABLE', message: 'Tạm bảo trì' });
  } finally {
    globalThis.fetch = original;
  }
});
