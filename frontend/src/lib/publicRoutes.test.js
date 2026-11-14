import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../pages/HomeV1.jsx', import.meta.url), 'utf8');
const niche = readFileSync(new URL('../pages/NicheDetailV1.jsx', import.meta.url), 'utf8');
const publicPages = readFileSync(new URL('../pages/PublicPages.jsx', import.meta.url), 'utf8');
const config = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
const connection = readFileSync(new URL('../pages/Connection.jsx', import.meta.url), 'utf8');

test('IA public routes include the new sections and keep legacy aliases working', () => {
  for (const route of ['/tu-sach', '/ngach', '/hien-truong', '/hoi-dap', '/tra-nhanh', '/tra-cuu', '/tu-dien', '/ban-nghe', '/lien-he', '/ket-noi']) {
    assert.ok(app.includes('path="' + route + '"'), 'Missing public route ' + route);
  }
  assert.ok(app.includes('path="/mang/:slug"'));
  assert.ok(app.includes('path="/lien-he"'));
  assert.ok(app.includes('path="/cam-nang/:part/:item"'));
  assert.ok(app.includes('path="/phan-nha-thau/:chapter"'));
  assert.ok(app.includes('path="/quan-quanh-kts/:chapter"'));
  assert.ok(app.includes('path="/hoi-dap/gui-cau-hoi"'));
  assert.ok(app.includes('path="/tu-dien/:slug"'));
  assert.ok(app.includes('path="/ket-noi/:type"'));
});

test('homepage keeps the architectural drawing and presents three reader choices without a carousel', () => {
  for (const label of ['Tôi sắp xây nhà', 'Tôi là kiến trúc sư', 'Tôi là nhà thầu']) assert.ok(config.includes(label));
  assert.match(home, /ConstructionDrawing/);
  assert.doesNotMatch(home, /carousel/i);
  assert.ok(home.includes('useFeed(reader)'), 'Homepage feed must use the selected reader lens.');
});

test('niche detail fetches all public layers from one URL and renders accessible disclosures', () => {
  assert.ok(niche.includes("apiUrl('/niches/' + slug, { role: reader })"));
  assert.match(niche, /<details className="public-layer-accordion"/);
  assert.match(niche, /open={openRoles.includes\(role.id\)}/);
  assert.match(niche, /addOpenLayerRole/);
  assert.match(niche, /toggleOpenLayerRole/);
  assert.match(niche, /READERS\.map/);
});

test('books, field notes, reader questions and quick search use real public API resources', () => {
  for (const endpoint of ["apiUrl('/books', { role: reader })", "useFieldNotes(null, 12, offset, reader)", "apiUrl('/search'"]) assert.ok(publicPages.includes(endpoint), 'Missing API use ' + endpoint);
  assert.ok(publicPages.includes('useQuestions('), 'Reader questions must use the public questions API hook.');
  assert.ok(publicPages.includes("postJson('/questions', payload)"));
  assert.ok(publicPages.includes('useFieldNotes(null, 12, offset, reader)'), 'Field notes must use the selected reader lens.');
  assert.ok(publicPages.includes('publishedChapterCount'));
  assert.ok(publicPages.includes('repairCostSource'));
  assert.ok(publicPages.includes("role, niche: niche || undefined"), 'Search must send the selected reader lens and niche filter to Backend.');
  assert.ok(publicPages.includes('results.meta?.facets'), 'Search must expose backend facets in the public UI.');
  assert.ok(publicPages.includes("'/tu-dien/' + encodeURIComponent(item.slug)"), 'Published term results must open a dedicated dictionary detail page.');
});

test('robots and dynamic sitemap expose only canonical public surfaces', () => {
  const sitemapRoute = readFileSync(new URL('../../../backend/src/routes/seo.js', import.meta.url), 'utf8');
  const robots = readFileSync(new URL('../../public/robots.txt', import.meta.url), 'utf8');
  assert.ok(sitemapRoute.includes("router.get('/sitemap.xml'"));
  assert.ok(sitemapRoute.includes("'/ngach'"));
  assert.ok(sitemapRoute.includes("'/tu-sach'"));
  assert.ok(sitemapRoute.includes("'/tra-nhanh'"));
  assert.ok(sitemapRoute.includes("'/lien-he'"));
  assert.ok(sitemapRoute.includes("a.status='PUBLISHED'"));
  assert.ok(!sitemapRoute.includes("'/tra-cuu'"));
  assert.ok(!sitemapRoute.includes("'/tu-dien'"));
  assert.ok(robots.includes('Disallow: /admin'));
  assert.ok(robots.includes('Sitemap: https://conspace.vn/sitemap.xml'));
});


test('phase-1 private Connection intake has four routes and no public marketplace behavior', () => {
  for (const slug of ['du-an','kien-truc-su','nha-thau','tham-gia']) assert.ok(connection.includes(slug));
  assert.ok(connection.includes("postJson('/connections'"));
  assert.ok(connection.includes('Thông tin liên hệ chỉ dùng để xử lý yêu cầu này'));
  assert.ok(connection.includes('Không phải marketplace'));
  assert.ok(!connection.includes('đấu giá công khai'));
});
