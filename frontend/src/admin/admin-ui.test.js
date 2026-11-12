import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('./api.js', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('./pages/Dashboard.jsx', import.meta.url), 'utf8');
const articles = readFileSync(new URL('./pages/Articles.jsx', import.meta.url), 'utf8');

test('ADMIN CMS navigation is limited to system administration and read-only article access', () => {
  assert.match(api, /ADMIN: \[\.\.\.EVERYONE, 'users:read', 'users:write', 'settings:write'\]/);
  assert.doesNotMatch(api, /ADMIN: \[\.\.\.new Set/);
  assert.match(api, /EDITOR_IN_CHIEF: \[\.\.\.EVERYONE,\.\.\.CHIEF, 'dictionary:publish'\]/);
});

test('system admin dashboard does not render editorial queues or publication schedule', () => {
  assert.match(dashboard, /user\?\.role === 'ADMIN'/);
  assert.match(dashboard, /user\?\.role !== 'ADMIN' && \(/);
  assert.match(dashboard, /Tài khoản CMS/);
});

test('system admin article route is explicitly read-only', () => {
  assert.match(articles, /user\?\.role === 'ADMIN' \? 'Chế độ chỉ xem/);
  assert.match(articles, /can\('articles:write'\) \? 'Biên tập/);
});
