import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('./api.js', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('./pages/Dashboard.jsx', import.meta.url), 'utf8');
const articles = readFileSync(new URL('./pages/Articles.jsx', import.meta.url), 'utf8');
const system = readFileSync(new URL('./pages/System.jsx', import.meta.url), 'utf8');
const reviews = readFileSync(new URL('./pages/Reviews.jsx', import.meta.url), 'utf8');
const editorial = readFileSync(new URL('./pages/Editorial.jsx', import.meta.url), 'utf8');
const niches = readFileSync(new URL('./pages/Niches.jsx', import.meta.url), 'utf8');
const library = readFileSync(new URL('./pages/Library.jsx', import.meta.url), 'utf8');
const authorsPage = readFileSync(new URL('./pages/Authors.jsx', import.meta.url), 'utf8');
const reviewFeedback = readFileSync(new URL('./ReviewFeedback.jsx', import.meta.url), 'utf8');

test('ADMIN CMS navigation is limited to system administration, private intake oversight and read-only article access', () => {
  assert.match(api, /ADMIN: \[\.\.\.EVERYONE, 'users:read', 'users:write', 'connections:read', 'authors:read', 'authors:verify', 'settings:write'\]/);
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

test('user governance UI exposes person identity, grant history and session revocation', () => {
  assert.ok(system.includes('personId'));
  assert.ok(system.includes('Lịch sử nguồn cấp vai trò'));
  assert.ok(system.includes('/revoke-sessions'));
  assert.ok(system.includes('activeSessionCount'));
});

test('field note UI exposes backend-backed compliance readiness and preserves sources', () => {
  assert.ok(editorial.includes("compliance:complianceFilter||undefined"));
  assert.ok(editorial.includes('Điều kiện gửi duyệt hiện trường'));
  assert.ok(editorial.includes('Nguồn truy vết'));
  assert.ok(editorial.includes('fieldComplianceReady'));
});


test('NEEDS_CHANGES feedback is actionable across CMS authoring surfaces', () => {
  assert.ok(reviewFeedback.includes("REQUEST_CHANGES"));
  assert.ok(reviewFeedback.includes('latestReturn.reason'));
  assert.ok(reviewFeedback.includes('latestReturn.actorName'));
  assert.ok(reviewFeedback.includes("status==='NEEDS_CHANGES'"));
  assert.ok(articles.includes('<ReviewFeedback entityType="ARTICLE"'));
  assert.ok(editorial.includes('<ReviewFeedback entityType="TERM"'));
  assert.ok(editorial.includes('<ReviewFeedback entityType="QUESTION_ANSWER"'));
  assert.ok(editorial.includes('<ReviewFeedback entityType="ARTICLE" entityId={form.articleId}'));
  assert.ok(niches.includes("entityType={isTemplateB?'ARCHITECTURAL_SECTION':'NICHE_SECTION'}"));
});


test('Bàn nghề is an explicit article tag toggle, not a separate content copy', () => {
  assert.ok(articles.includes('Hiển thị trong Bàn nghề'));
  assert.ok(articles.includes("tag.slug==='ban-nghe'"));
  assert.ok(articles.includes("{slug:'ban-nghe',name:'Bàn nghề'}"));
});


test('chapter CMS uses a filtered article picker with explicit detach and safe delete controls', () => {
  assert.ok(library.includes("contentType:selectedBook?.contentLabel"));
  assert.ok(library.includes('Tìm bài để gắn'));
  assert.ok(library.includes('Bài viết liên kết'));
  assert.ok(library.includes("data:{articleId:null}"));
  assert.ok(library.includes('Gỡ bài khỏi chương'));
  assert.ok(library.includes('Xóa ô chương trống'));
  assert.ok(library.includes("method:'DELETE'"));
});


test('author profile CMS separates editorial editing from ADMIN verification', () => {
  assert.ok(authorsPage.includes('Hồ sơ tác giả'));
  assert.ok(authorsPage.includes("can('authors:write')"));
  assert.ok(authorsPage.includes("can('authors:verify')"));
  assert.ok(authorsPage.includes('Chỉ ADMIN có thể thay đổi trạng thái này'));
  assert.ok(authorsPage.includes("method:'DELETE'"));
  assert.ok(api.includes("'authors:read','authors:create','authors:write'"));
  assert.ok(api.includes("'authors:read', 'authors:verify'"));
});
