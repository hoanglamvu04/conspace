import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apiUrl } from './api.js';
import { PRIMARY_NAV } from '../config.js';

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../pages/HomeV1.jsx', import.meta.url), 'utf8');
const niche = readFileSync(new URL('../pages/NicheDetailV1.jsx', import.meta.url), 'utf8');
const publicPages = readFileSync(new URL('../pages/PublicPages.jsx', import.meta.url), 'utf8');
const config = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
const connection = readFileSync(new URL('../pages/Connection.jsx', import.meta.url), 'utf8');
const articlesPage = readFileSync(new URL('../pages/Articles.jsx', import.meta.url), 'utf8');
const contactPage = readFileSync(new URL('../pages/Contact.jsx', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../components/UI.jsx', import.meta.url), 'utf8');

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

test('editorial homepage follows approved architecture magazine layout and uses real published data', () => {
  for (const label of ['Tôi sắp xây nhà', 'Tôi là kiến trúc sư', 'Tôi là nhà thầu']) assert.ok(config.includes(label));
  for (const className of ['ed-hero', 'ed-niche-strip', 'ed-article-layout', 'ed-panels', 'ed-manifesto']) {
    assert.ok(home.includes(className), 'Missing editorial section: ' + className);
  }
  assert.ok(home.includes('useFeed(reader)'), 'Homepage feed must use the selected reader lens.');
  assert.ok(home.includes('useArticles('), 'Homepage must get real published articles.');
  assert.ok(home.includes('useNiches()'), 'Homepage must use API taxonomy.');
  assert.ok(home.includes('safeMediaUrl(image)'), 'Homepage must sanitize published media URLs.');
  assert.ok(!home.includes('nha-o-2-tang-trong-khu-vuon-nho'), 'Do not create fake article links.');
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
  assert.ok(publicPages.includes('q:query,type,role,niche:niche||undefined'), 'Search must send the selected reader lens and niche filter to Backend.');
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


test('Bàn nghề uses an editorial tag instead of duplicating the full article stream', () => {
  assert.ok(articlesPage.includes("isWorkbench ? 'ban-nghe' : null"));
  assert.ok(articlesPage.includes('Chưa có bài Bàn nghề đã xuất bản'));
  assert.ok(articlesPage.includes('Không lấy toàn bộ dòng bài để lấp chỗ trống'));
});


test('field-note public links use stable article slugs and canonicalize legacy UUID URLs', () => {
  assert.ok(home.includes("'/hien-truong/' + encodeURIComponent(fieldNotes[0].slug)"));
  assert.ok(niche.includes("'/hien-truong/' + encodeURIComponent(item.slug)"));
  assert.ok(publicPages.includes("'/hien-truong/' + encodeURIComponent(item.slug)"));
  assert.ok(publicPages.includes("navigate('/hien-truong/' + encodeURIComponent(canonicalSlug), { replace: true })"));
  assert.ok(publicPages.includes("canonicalPath:canonicalSlug?'/hien-truong/'+canonicalSlug:'/hien-truong'"));
});


test('responsive public navigation keeps mobile behavior and Connection emphasis', () => {
  assert.ok(config.includes("{ to: '/ket-noi', label: 'Kết nối', emphasis: true }"));
  assert.ok(ui.includes("document.body.classList.toggle('public-menu-open', menuOpen)"));
  assert.ok(ui.includes('mobile-nav-backdrop'));
  assert.ok(ui.includes('mobile-nav-secondary'));
  for (const label of ['Bài viết','Bàn nghề','Về CONSPACE','Quy tắc nội dung']) assert.ok(ui.includes(label));
  assert.ok(ui.includes("item.emphasis ? 'nav-link--emphasis '"));
  assert.ok(ui.includes("item.emphasis ? 'mobile-nav-link--emphasis '"));
});

test('homepage first screen exposes direct paths and trust cues without fake metrics', () => {
  assert.ok(home.includes('Khám phá kho ngách'));
  assert.ok(home.includes('Gửi câu hỏi'));
  assert.ok(home.includes('home-trust-rail'));
  assert.ok(home.includes('Chỉ nội dung đã công khai'));
  assert.ok(home.includes('Ba góc nhìn cùng tồn tại'));
  assert.ok(config.includes("{ to: '/ket-noi', title: 'Kết nối'"));
});


test('niche directory and detail expose mobile recovery and in-page navigation', () => {
  const directory = readFileSync(new URL('../pages/Niches.jsx', import.meta.url), 'utf8');
  assert.ok(directory.includes('directory-overview'));
  assert.ok(directory.includes('Xóa bộ lọc'));
  assert.ok(niche.includes('detail-jump-nav'));
  for (const anchor of ['ho-so-chuyen-mon','bai-viet-lien-quan','hien-truong-lien-quan','chuong-sach-lien-quan']) {
    assert.ok(niche.includes(anchor));
  }
  assert.ok(niche.includes('id="ho-so-chuyen-mon"'));
});


test('article and field-note detail pages expose readable in-page structure', () => {
  assert.ok(articlesPage.includes('article-reading-tools'));
  assert.ok(articlesPage.includes('id="noi-dung-bai-viet"'));
  assert.ok(articlesPage.includes('id="nguon-tham-khao"'));
  assert.ok(publicPages.includes('field-case-summary'));
  assert.ok(publicPages.includes('01 / HIỆN TƯỢNG'));
  assert.ok(publicPages.includes('03 / ĐIỂM CHẶN'));
  assert.ok(publicPages.includes('Về kho Hiện trường'));
});


test('public library journey exposes reader prioritization, book progress and chapter navigation', () => {
  assert.ok(publicPages.includes('library-overview'));
  assert.ok(publicPages.includes('book-progress-summary'));
  assert.ok(publicPages.includes('id="noi-dung-chuong"'));
  assert.ok(publicPages.includes('id="nguon-chuong"'));
  assert.ok(publicPages.includes('Danh sách chương'));
});

test('public Q&A and lookup expose clear next actions without publishing drafts', () => {
  assert.ok(publicPages.includes('qa-process'));
  assert.ok(publicPages.includes('form-trust-note'));
  assert.ok(publicPages.includes('Gửi câu hỏi của bạn'));
  assert.ok(publicPages.includes('lookup-clear'));
  assert.ok(publicPages.includes('lookup-empty-actions'));
  assert.ok(publicPages.includes('Chỉ bản đã duyệt mới công khai'));
});

test('Connection journey explains private manual handling and supports changing request type', () => {
  assert.ok(connection.includes('connection-process'));
  assert.ok(connection.includes('Nhân sự phân loại thủ công'));
  assert.ok(connection.includes('connection-form-context'));
  assert.ok(connection.includes('Đổi loại yêu cầu'));
  assert.ok(connection.includes('connection-privacy-note'));
  assert.ok(connection.includes('Về trang Kết nối'));
});


test('contact page routes readers only to existing intake paths without inventing contact details', () => {
  assert.ok(contactPage.includes('/hoi-dap/gui-cau-hoi'));
  assert.ok(contactPage.includes('/ket-noi'));
  assert.ok(contactPage.includes('Kết nối riêng tư'));
  assert.ok(contactPage.includes('chưa có trong nguồn thông tin được xác nhận'));
});

test('article and Q&A cross-links resolve design slugs to the canonical /mang route', () => {
  assert.ok(articlesPage.includes('nichePathForSlug(tag, activeNiches)'));
  assert.ok(publicPages.includes('nichePathForSlug(data.niche'));
});

test('Field Note and Dictionary details request allowed slug APIs and recover on errors',()=>{
  assert.ok(publicPages.includes("apiUrl('/field-notes/' + id)"));
  assert.ok(publicPages.includes("apiUrl('/terms/' + slug)"));
  assert.equal(apiUrl('/field-notes/demo-field-ready'),'/api/v1/field-notes/demo-field-ready');
  assert.equal(apiUrl('/terms/demo-thuat-ngu-cong-khai'),'/api/v1/terms/demo-thuat-ngu-cong-khai');
  assert.ok(publicPages.includes('Trở lại kho Hiện trường'));
  assert.ok(publicPages.includes('Trở lại Tra nhanh'));
});

test('Public Q&A uses server-backed pagination metadata and blocks stale page actions',()=>{
  assert.ok(publicPages.includes('hasMoreQuestionPage(questions.meta, page)'));
  assert.ok(publicPages.includes('Đang tải thêm câu hỏi'));
  assert.ok(publicPages.includes('questions.retry'));
});

test('Public search retries the failed page and hides stale query/filter results',()=>{
  assert.ok(publicPages.includes('searchResultKey(activeQuery,reader,activeType,activeNiche)'));
  assert.ok(publicPages.includes("const resultStatus=resultsCurrent?results.status:'loading'"));
  assert.ok(publicPages.includes('onRetry={results.retry}'));
  assert.ok(publicPages.includes('onClick={results.retry}'));
  assert.ok(publicPages.includes('!results.error &&'));
  assert.ok(publicPages.includes('appendUniqueSearchResults(current.data,data)'));
});

test('published article authors use API authorName instead of showing the default editorial byline',()=>{
  assert.ok(ui.includes("article.author?.displayName || article.authorName"));
  assert.ok(articlesPage.includes("entry.author?.displayName || entry.authorName"));
  assert.ok(articlesPage.includes("(article.author?.displayName || article.authorName) ?"));
});

test('Public mobile navigation dismisses overlays and restores keyboard focus', () => {
  assert.ok(ui.includes('mobileNavRef.current?.querySelector'));
  assert.ok(ui.includes("event.key !== 'Tab'"));
  assert.ok(ui.includes('document.activeElement'));
  assert.ok(ui.includes('readerPopoverRef.current?.contains(event.target)'));
  assert.ok(ui.includes('onSelect={() => { setRoleOpen(false)'));
  assert.ok(ui.includes('onSelect={() => { setMenuOpen(false)'));
  assert.ok(ui.includes('content.inert = menuOpen'));
  assert.ok(ui.includes('footer.inert = menuOpen'));
});

test('Public question cards keep long answers on detail pages', () => {
  assert.ok(publicPages.includes('questionAnswerTeaser(item.answer)'));
  assert.ok(publicPages.includes('<Markdown body={data.answer}/>'));
});

test('public header exposes Article index on both desktop and mobile without duplicate mobile links', () => {
  assert.deepEqual(PRIMARY_NAV.map(item => item.to), [
    '/bai-viet','/tu-sach','/ngach','/hien-truong','/hoi-dap','/tra-nhanh','/ket-noi'
  ]);
  assert.equal(PRIMARY_NAV.filter(item => item.to === '/bai-viet').length, 1);
  assert.ok(app.includes('path="/bai-viet"'));
  assert.ok(ui.includes('className="desktop-nav"'));
  assert.ok(ui.includes('className="mobile-nav-primary"'));
  assert.equal(ui.includes('<Link to="/bai-viet">Bài viết</Link>'), true, 'Footer still links to Article index');
  assert.ok(!ui.includes('<div className="mobile-nav-secondary" aria-label="Điều hướng bổ sung">\n                <Link to="/bai-viet">'), 'Article link should not be duplicated in mobile secondary menu');
});

test('editorial header stays shared across public pages and homepage uses functional controls', () => {
  const editorialStyles = readFileSync(new URL('../editorial.css', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
  assert.ok(main.includes("import './editorial.css'"));
  for (const key of ['.ed-hero', '.ed-niche-strip', '.ed-article-layout', '.ed-panels', '.ed-manifesto']) assert.ok(editorialStyles.includes(key));
  assert.ok(home.includes("setFeaturedIndex((value) => (value + 1) % featuredCount)"));
  assert.ok(home.includes("setArticleLens(id)"));
  assert.ok(home.includes("navigate('/tra-nhanh'"));
  assert.ok(ui.includes('CONSPACE — Tạp chí &amp; Thư viện ngành xây'));
  assert.ok(ui.includes('utility-links'));
});
