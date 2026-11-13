import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('./api.js', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('./pages/Dashboard.jsx', import.meta.url), 'utf8');
const articles = readFileSync(new URL('./pages/Articles.jsx', import.meta.url), 'utf8');
const system = readFileSync(new URL('./pages/System.jsx', import.meta.url), 'utf8');
const reviews = readFileSync(new URL('./pages/Reviews.jsx', import.meta.url), 'utf8');

test('ADMIN CMS navigation is limited to system administration and read-only article access', () => {
  assert.match(api, /ADMIN: \[\.\.\.EVERYONE, 'users:read', 'users:write', 'settings:write'\]/);
  assert.doesNotMatch(api, /ADMIN: \[\.\.\.new Set/);
  assert.match(api, /EDITOR_IN_CHIEF: \[\.\.\.EVERYONE,\.\.\.CHIEF, 'dictionary:publish'\]/);
});

test('system admin dashboard hides editorial lanes unless explicit capabilities are present', () => {
  assert.match(dashboard, /can\('reviews:read'\)\|\|can\('articles:write'\)\|\|can\('articles:schedule'\)/);
  assert.match(dashboard, /can\('users:read'\).*Tài khoản CMS/s);
  assert.match(dashboard, /can\('audit:read'\).*Nhật ký kiểm soát/s);
});

test('system admin article route is explicitly read-only', () => {
  assert.match(articles, /user\?\.role === 'ADMIN' \? 'Chế độ chỉ xem/);
  assert.match(articles, /can\('articles:write'\) \? 'Biên tập/);
});

test('CMS user administration exposes explicit secondary roles and reasoned delegated permissions', () => {
  assert.ok(system.includes('Vai trò kiêm nhiệm'));
  assert.ok(system.includes('Lý do cấp/thay đổi vai trò'));
  assert.ok(system.includes('Quyền bổ sung'));
  assert.ok(system.includes('permissionReason'));
});

test('editorial review UI can inspect and decide niche sections through the Backend queue', () => {
  assert.ok(reviews.includes('queue.data.nicheSections'));
  assert.ok(reviews.includes('/reviews/niche-sections/'));
  assert.ok(reviews.includes('templateType:selected.templateType'));
});
