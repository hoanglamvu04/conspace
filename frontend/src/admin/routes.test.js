import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routes = readFileSync(new URL('./AdminApp.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');

const admin = [
  '/admin/login', '/admin', 'dashboard', 'articles', 'articles/new',
  'articles/:id/edit', 'reviews', 'niches', 'books', 'chapters', 'field-notes',
  'dictionary', 'questions', 'connections', 'media', 'audit', 'users', 'settings',
];

test('all documented CMS routes, including Connection triage and deep article editing, exist', () => {
  admin.forEach((path) => assert.ok(routes.includes(`path="${path}"`), `Missing ${path}`));
});

test('site routes admin to lazy isolated entry without altering public navigation', () => {
  assert.match(app, /lazy\(\(\)\s*=>\s*import\('\.\/admin\/AdminApp\.jsx'\)\)/);
  assert.match(app, /pathname\.startsWith\('\/admin\/'\)/);
  assert.match(app, /<Header\s*\/>/);
  assert.match(app, /<Footer\s*\/>/);
});

test('admin routes go through verified session and role gates', () => {
  assert.match(routes, /<SessionProvider>/);
  assert.match(routes, /<RequireAdmin>/);
  assert.match(routes, /<RequireAdmin permission=\{permission\}>/);
  assert.match(routes, /<Restricted permission="users:read">/);
});
