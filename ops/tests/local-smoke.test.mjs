import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLoopbackUrl, localUrl } from '../scripts/local-smoke.mjs';

test('local smoke only permits loopback HTTP targets', () => {
  assert.equal(assertLoopbackUrl('http://127.0.0.1:5176', 'frontend').port, '5176');
  assert.equal(assertLoopbackUrl('http://localhost:5088', 'backend').hostname, 'localhost');
  for (const value of [
    'https://conspace.vn',
    'http://103.149.170.146:5088',
    'http://example.test',
    'http://user:pass@127.0.0.1:5088',
    'http://127.0.0.1:5088/?token=secret',
  ]) assert.throws(() => assertLoopbackUrl(value, 'target'));
});

test('local URL builder preserves only the loopback origin and requested path', () => {
  assert.equal(
    localUrl('http://127.0.0.1:5088', '/api/v1/feed?role=architect'),
    'http://127.0.0.1:5088/api/v1/feed?role=architect'
  );
});
