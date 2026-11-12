import test from 'node:test';
import assert from 'node:assert/strict';
import { apiUrl, ApiError, getJson, postJson, requireList } from './api.js';

test('builds same-origin versioned URLs and encodes filters', () => {
  assert.equal(apiUrl('/niches', { group: 'design' }), '/api/v1/niches?group=design');
  assert.equal(apiUrl('/terms', { q: 'ép cọc', limit: 20 }), '/api/v1/terms?q=%C3%A9p+c%E1%BB%8Dc&limit=20');
  assert.equal(apiUrl('/articles', { role: 'homeowner', cursor: null }), '/api/v1/articles?role=homeowner');
  assert.equal(apiUrl('/feed', { limit: 6 }), '/api/v1/feed?limit=6');
  assert.equal(apiUrl('/books/phan-nha-thau-xay-dung/chapters/2'), '/api/v1/books/phan-nha-thau-xay-dung/chapters/2');
  assert.equal(apiUrl('/field-notes/123e4567-e89b-12d3-a456-426614174000'), '/api/v1/field-notes/123e4567-e89b-12d3-a456-426614174000');
  assert.equal(apiUrl('/questions'), '/api/v1/questions');
  assert.equal(apiUrl('/search', { q: 'chống thấm', type: 'all' }), '/api/v1/search?q=ch%E1%BB%91ng+th%E1%BA%A5m&type=all');
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

test('anonymous question intake sends only the documented JSON shape to the same-origin API', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return { ok: true, status: 201, json: async () => ({ ok: true, data: { id: 'question-id', message: 'Đã tiếp nhận' } }) };
  };
  try {
    const payload = { description: 'Tường nhà bị nứt sau khi hoàn thiện.', guessedNicheId: null, requestPrivateReply: 'false', images: [] };
    const result = await postJson('/questions', payload);
    assert.equal(result.data.id, 'question-id');
    assert.equal(request.url, '/api/v1/questions');
    assert.equal(request.init.method, 'POST');
    assert.equal(request.init.credentials, 'same-origin');
    assert.equal(request.init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(request.init.body), payload);
    await assert.rejects(() => postJson('/articles', payload), /Unsupported public POST/);
  } finally {
    globalThis.fetch = original;
  }
});
