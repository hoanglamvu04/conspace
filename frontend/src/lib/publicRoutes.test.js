import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../pages/HomeV1.jsx', import.meta.url), 'utf8');
const niche = readFileSync(new URL('../pages/NicheDetailV1.jsx', import.meta.url), 'utf8');
const publicPages = readFileSync(new URL('../pages/PublicPages.jsx', import.meta.url), 'utf8');
const config = readFileSync(new URL('../config.js', import.meta.url), 'utf8');

test('IA public routes include the new sections and keep legacy aliases working', () => {
  for (const route of ['/tu-sach', '/ngach', '/hien-truong', '/hoi-dap', '/tra-nhanh', '/tra-cuu', '/tu-dien', '/ban-nghe', '/lien-he']) {
    assert.ok(app.includes('path="' + route + '"'), 'Missing public route ' + route);
  }
  assert.ok(app.includes('path="/mang/:slug"'));
  assert.ok(app.includes('path="/lien-he"'));
  assert.ok(app.includes('path="/cam-nang/:part/:item"'));
  assert.ok(app.includes('path="/phan-nha-thau/:chapter"'));
  assert.ok(app.includes('path="/quan-quanh-kts/:chapter"'));
  assert.ok(app.includes('path="/hoi-dap/gui-cau-hoi"'));
});

test('homepage keeps the architectural drawing and presents three reader choices without a carousel', () => {
  for (const label of ['Tôi sắp xây nhà', 'Tôi là kiến trúc sư', 'Tôi là nhà thầu']) assert.ok(config.includes(label));
  assert.match(home, /ConstructionDrawing/);
  assert.doesNotMatch(home, /carousel/i);
});

test('niche detail fetches all public layers from one URL and renders accessible disclosures', () => {
  assert.ok(niche.includes("apiUrl('/niches/' + slug)"));
  assert.match(niche, /<details className="public-layer-accordion"/);
  assert.match(niche, /open={openRoles.includes\(role.id\)}/);
  assert.match(niche, /addOpenLayerRole/);
  assert.match(niche, /toggleOpenLayerRole/);
  assert.match(niche, /READERS\.map/);
});

test('books, field notes, reader questions and quick search use real public API resources', () => {
  for (const endpoint of ["apiUrl('/books')", "apiUrl('/field-notes/", "apiUrl('/questions", "apiUrl('/search'"]) assert.ok(publicPages.includes(endpoint), 'Missing API use ' + endpoint);
  assert.ok(publicPages.includes("postJson('/questions', payload)"));
  assert.ok(publicPages.includes('publishedChapterCount'));
  assert.ok(publicPages.includes('repairCostSource'));
});

test('robots and sitemap expose only stable canonical public pages', () => {
  const sitemap = readFileSync(new URL('../../public/sitemap.xml', import.meta.url), 'utf8');
  const robots = readFileSync(new URL('../../public/robots.txt', import.meta.url), 'utf8');
  assert.ok(sitemap.includes('https://conspace.vn/'));
  assert.ok(sitemap.includes('https://conspace.vn/tu-sach'));
  assert.ok(sitemap.includes('https://conspace.vn/ngach'));
  assert.ok(!sitemap.includes('/tra-cuu'));
  assert.ok(!sitemap.includes('/tu-dien'));
  assert.ok(!sitemap.includes('/tra-nhanh'));
  assert.ok(robots.includes('Disallow: /admin/'));
  assert.ok(robots.includes('Sitemap: https://conspace.vn/sitemap.xml'));
});
