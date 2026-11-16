import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLoopbackUrl, parseSessionCookie, userHasRole } from '../scripts/local-role-acceptance.mjs';

test('role acceptance URL guard allows local HTTP loopback only', () => {
  assert.equal(assertLoopbackUrl('http://127.0.0.1:5088', 'API').hostname, '127.0.0.1');
  assert.equal(assertLoopbackUrl('http://localhost:5176', 'Frontend').hostname, 'localhost');
  assert.throws(() => assertLoopbackUrl('https://conspace.vn', 'API'), /loopback only/);
  assert.throws(() => assertLoopbackUrl('http://103.149.170.146:5088', 'API'), /loopback only/);
  assert.throws(() => assertLoopbackUrl('http://user:pass@127.0.0.1:5088', 'API'), /loopback only/);
});

test('role acceptance extracts only the CMS session cookie pair', () => {
  assert.equal(
    parseSessionCookie('conspace_admin_session=abc123; Path=/api/admin; HttpOnly; SameSite=Strict'),
    'conspace_admin_session=abc123',
  );
  assert.throws(() => parseSessionCookie('other=value; Path=/'), /expected CMS session cookie/);
  assert.throws(() => parseSessionCookie(''), /missing the CMS session cookie/);
});

test('role acceptance honors secondary role assignments', () => {
  assert.equal(userHasRole({ role: 'TECHNICAL_REVIEWER', roles: ['EDITOR', 'TECHNICAL_REVIEWER'] }, 'EDITOR'), true);
  assert.equal(userHasRole({ role: 'EDITOR', roles: [] }, 'EDITOR'), true);
  assert.equal(userHasRole({ role: 'EDITOR' }, 'ADMIN'), false);
});
