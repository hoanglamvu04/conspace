import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localBase } from '../scripts/chromium-cdp.mjs';

test('Chromium acceptance only permits local HTTP services', () => {
  assert.equal(localBase('http://127.0.0.1:5176/', 'Frontend').hostname, '127.0.0.1');
  assert.equal(localBase('http://localhost:5088/', 'Backend').hostname, 'localhost');
  for (const value of [
    'https://conspace.vn/', 'http://192.168.1.20:5176/', 'http://example.org/',
    'http://user:secret@localhost:5176/', 'http://localhost:5176/api/v1/',
    'http://localhost:5176/?token=test', 'file:///tmp/site.html',
  ]) {
    assert.throws(() => localBase(value, 'Frontend'), /local HTTP loopback origin/, value);
  }
});

test('Chromium acceptance tests real public reader flows without submitting data', () => {
  const script = readFileSync(new URL('../scripts/public-browser-acceptance.mjs', import.meta.url), 'utf8');
  for (const route of [
    '/bai-viet/demo-public-design-overview', '/bai-viet/demo-review-needs-changes',
    '/tu-dien/demo-thuat-ngu-cong-khai',
    '/tra-nhanh?q=demo', '/hoi-dap/gui-cau-hoi',
  ]) {
    assert.ok(script.includes(route), 'Missing reader scenario: ' + route);
  }
  assert.ok(script.includes("'/mang/' + niche"), 'Template B browser test must follow selected demo niche');
  assert.ok(script.includes('tab.viewport(390, 844, true)'));
  assert.ok(script.includes('tab.key(\'Escape\')'));
  assert.ok(script.includes('document.documentElement.scrollWidth'));
  assert.ok(!script.includes("method: 'POST'"), 'Browser acceptance must remain read-only');
});
