#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

const DEMO_USERS = Object.freeze({
  editor: { email: 'editor.demo@conspace.local', role: 'EDITOR' },
  reviewer: { email: 'reviewer.demo@conspace.local', role: 'TECHNICAL_REVIEWER' },
  chief: { email: 'chief.demo@conspace.local', role: 'EDITOR_IN_CHIEF' },
});
const DEMO_ARTICLE_SLUG = 'demo-review-needs-changes';
const DEMO_FIELD_SLUG = 'demo-field-ready';
const DEMO_QUESTION_PREFIX = '[DEMO] Câu hỏi mô phỏng';

export function assertLoopbackUrl(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(label + ' must be a valid URL'); }
  const allowed = new Set(['127.0.0.1', 'localhost', '[::1]']);
  if (url.protocol !== 'http:' || !allowed.has(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw new Error(label + ' must target local HTTP loopback only; production/VPS is forbidden');
  }
  return url;
}

export function parseSessionCookie(setCookie, cookieName = 'conspace_admin_session') {
  if (typeof setCookie !== 'string' || !setCookie) throw new Error('Login response is missing the CMS session cookie');
  const first = setCookie.split(',').find((part) => part.trim().startsWith(cookieName + '=')) || setCookie;
  const pair = first.split(';', 1)[0].trim();
  if (!pair.startsWith(cookieName + '=') || pair.length <= cookieName.length + 1) {
    throw new Error('Login response did not set the expected CMS session cookie');
  }
  return pair;
}

export function userHasRole(user, role) {
  const roles = Array.isArray(user?.roles) && user.roles.length ? user.roles : [user?.role].filter(Boolean);
  return roles.includes(role);
}

function requireSecret(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || !value) throw new Error(name + ' is required; set it in the local CMD session only');
  return value;
}

function localUrl(base, pathname) {
  return new URL(pathname, base).toString();
}

async function readPayload(response, label) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { throw new Error(label + ': response is not JSON'); }
}

async function request(fetcher, { base, origin, session, method = 'GET', path, body, expect = [200], label = path }) {
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  const headers = { Accept: 'application/json' };
  if (session?.cookie) headers.Cookie = session.cookie;
  if (write) {
    headers.Origin = origin;
    if (session?.csrfToken) headers['X-CSRF-Token'] = session.csrfToken;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
  }
  let response;
  try {
    response = await fetcher(localUrl(base, path), {
      method,
      redirect: 'manual',
      cache: 'no-store',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error(label + ': cannot connect; start the local Backend/Frontend first');
  }
  const payload = await readPayload(response, label);
  if (!expect.includes(response.status)) {
    const code = payload?.error?.code ? ' (' + payload.error.code + ')' : '';
    throw new Error(label + ': expected HTTP ' + expect.join('/') + ', received ' + response.status + code);
  }
  if (response.status >= 200 && response.status < 300 && payload?.ok !== true) {
    throw new Error(label + ': API did not return ok:true');
  }
  return { status: response.status, payload, headers: response.headers };
}

async function expectPage(fetcher, url, label) {
  let response;
  try {
    response = await fetcher(url, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(12000) });
  } catch {
    throw new Error(label + ': cannot connect; start the local service first');
  }
  if (response.status !== 200) throw new Error(label + ': expected HTTP 200, received ' + response.status);
}

async function login(fetcher, { base, origin, email, password, expectedRole, cookieName }) {
  const response = await fetcher(localUrl(base, '/api/admin/auth/login'), {
    method: 'POST',
    redirect: 'manual',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(12000),
  }).catch(() => { throw new Error('Login ' + email + ': cannot connect to local Backend'); });
  const payload = await readPayload(response, 'Login ' + email);
  if (response.status !== 200 || payload?.ok !== true) {
    const code = payload?.error?.code ? ' (' + payload.error.code + ')' : '';
    throw new Error('Login ' + email + ': HTTP ' + response.status + code);
  }
  if (!userHasRole(payload.data?.user, expectedRole)) {
    throw new Error('Login ' + email + ': expected role ' + expectedRole + ' is not assigned');
  }
  if (!payload.data?.csrfToken) throw new Error('Login ' + email + ': CSRF token is missing');
  return {
    email,
    user: payload.data.user,
    csrfToken: payload.data.csrfToken,
    cookie: parseSessionCookie(response.headers.get('set-cookie'), cookieName),
  };
}

function dataOf(result, label) {
  if (!result?.payload || !Object.prototype.hasOwnProperty.call(result.payload, 'data')) {
    throw new Error(label + ': response is missing data');
  }
  return result.payload.data;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(label + ': expected an array');
  return value;
}

function assertStatus(value, expected, label) {
  if (value?.status !== expected) throw new Error(label + ': expected status ' + expected + ', received ' + String(value?.status));
}

function requireDemoBaseline(condition, label) {
  if (!condition) {
    throw new Error(label + ': demo fixture is not at the expected baseline; rerun db:seed-demo before acceptance');
  }
}

async function logout(fetcher, ctx, session) {
  if (!session) return;
  try {
    await request(fetcher, { ...ctx, session, method: 'POST', path: '/api/admin/auth/logout', body: {}, expect: [200], label: 'Logout ' + session.email });
  } catch {
    // Best effort only. Acceptance failures must report the original problem without exposing credentials.
  }
}

export async function runLocalRoleAcceptance({ fetcher = fetch, env = process.env, log = console.log } = {}) {
  const frontend = assertLoopbackUrl(env.CONSPACE_FRONTEND_URL || 'http://127.0.0.1:5176', 'CONSPACE_FRONTEND_URL');
  const backend = assertLoopbackUrl(env.CONSPACE_API_URL || 'http://127.0.0.1:5088', 'CONSPACE_API_URL');
  const cmsOrigin = assertLoopbackUrl(env.CONSPACE_CMS_ORIGIN || frontend.origin, 'CONSPACE_CMS_ORIGIN').origin;
  const cookieName = env.CONSPACE_SESSION_COOKIE_NAME || 'conspace_admin_session';
  if (!/^[A-Za-z0-9_-]+$/.test(cookieName)) throw new Error('CONSPACE_SESSION_COOKIE_NAME is invalid');
  const demoPassword = requireSecret(env, 'DEMO_USER_PASSWORD');
  const adminPassword = requireSecret(env, 'CONSPACE_ADMIN_PASSWORD');
  const adminEmail = env.CONSPACE_ADMIN_EMAIL || 'admin@conspace.local';
  const ctx = { base: backend, origin: cmsOrigin };
  const sessions = [];
  const pass = (message) => log('PASS: ' + message);

  await expectPage(fetcher, localUrl(frontend, '/'), 'Frontend home');
  await expectPage(fetcher, localUrl(frontend, '/admin/login'), 'CMS login route');
  pass('Frontend home and CMS login route');
  const health = await request(fetcher, { ...ctx, path: '/api/health', label: 'Backend health' });
  if (health.payload?.service !== 'conspace-api') throw new Error('Backend health: unexpected service identifier');
  const ready = await request(fetcher, { ...ctx, path: '/api/ready', label: 'Database readiness' });
  if (ready.payload?.checks?.database !== 'up') {
    throw new Error('Database readiness: PostgreSQL is not ready');
  }
  pass('Backend health and PostgreSQL readiness');

  let admin, editor, reviewer, chief;
  try {
    admin = await login(fetcher, { ...ctx, email: adminEmail, password: adminPassword, expectedRole: 'ADMIN', cookieName }); sessions.push(admin);
    editor = await login(fetcher, { ...ctx, ...DEMO_USERS.editor, password: demoPassword, expectedRole: DEMO_USERS.editor.role, cookieName }); sessions.push(editor);
    reviewer = await login(fetcher, { ...ctx, ...DEMO_USERS.reviewer, password: demoPassword, expectedRole: DEMO_USERS.reviewer.role, cookieName }); sessions.push(reviewer);
    chief = await login(fetcher, { ...ctx, ...DEMO_USERS.chief, password: demoPassword, expectedRole: DEMO_USERS.chief.role, cookieName }); sessions.push(chief);
    pass('ADMIN, Editor, Technical Reviewer and Editor-in-Chief login');

    const users = requireArray(dataOf(await request(fetcher, { ...ctx, session: admin, path: '/api/admin/users', label: 'ADMIN users list' }), 'ADMIN users list'), 'ADMIN users list');
    for (const email of [adminEmail, DEMO_USERS.editor.email, DEMO_USERS.reviewer.email, DEMO_USERS.chief.email]) {
      if (!users.some((user) => user.email === email)) throw new Error('ADMIN users list: missing ' + email);
    }
    for (const session of [editor, reviewer, chief]) {
      await request(fetcher, { ...ctx, session, path: '/api/admin/users', expect: [403], label: session.email + ' users denial' });
    }
    await request(fetcher, { ...ctx, session: editor, path: '/api/admin/reviews/queue?stage=TECHNICAL', expect: [403], label: 'Editor review-queue denial' });
    await request(fetcher, { ...ctx, session: reviewer, path: '/api/admin/chapters', expect: [403], label: 'Reviewer chapter denial' });
    await request(fetcher, { ...ctx, session: reviewer, path: '/api/admin/field-notes', expect: [403], label: 'Reviewer field-note denial' });
    await request(fetcher, { ...ctx, session: chief, path: '/api/admin/chapters', label: 'Chief chapter access' });
    await request(fetcher, { ...ctx, session: chief, path: '/api/admin/field-notes?limit=5', label: 'Chief field-note access' });
    pass('Role boundaries for ADMIN, Reviews, Chapters and Field Notes');

    const articleList = requireArray(dataOf(await request(fetcher, {
      ...ctx, session: editor, path: '/api/admin/articles?search=' + encodeURIComponent(DEMO_ARTICLE_SLUG) + '&limit=20', label: 'Demo article lookup',
    }), 'Demo article lookup'), 'Demo article lookup');
    const article = articleList.find((item) => item.slug === DEMO_ARTICLE_SLUG);
    requireDemoBaseline(article && article.status === 'NEEDS_CHANGES', 'Article workflow');
    const articleId = article.id;

    const patched = dataOf(await request(fetcher, {
      ...ctx, session: editor, method: 'PATCH', path: '/api/admin/articles/' + articleId,
      body: { sensitivityFlags: ['LEGAL_CONTENT'], sensitivityAssessed: true, changeReason: '[DEMO] Local role acceptance forces chief review.' },
      label: 'Editor prepares returned article',
    }), 'Editor prepares returned article');
    assertStatus(patched, 'NEEDS_CHANGES', 'Editor prepares returned article');

    await request(fetcher, { ...ctx, session: reviewer, method: 'POST', path: '/api/admin/articles/' + articleId + '/publish', body: {}, expect: [403], label: 'Reviewer publish denial' });
    assertStatus(dataOf(await request(fetcher, { ...ctx, session: editor, method: 'POST', path: '/api/admin/articles/' + articleId + '/submit', body: {}, label: 'Editor submits article' }), 'Editor submits article'), 'SUBMITTED', 'Editor submits article');

    const technicalQueue = dataOf(await request(fetcher, { ...ctx, session: reviewer, path: '/api/admin/reviews/queue?stage=TECHNICAL', label: 'Technical review queue' }), 'Technical review queue');
    if (!requireArray(technicalQueue?.articles, 'Technical review queue articles').some((item) => item.id === articleId)) throw new Error('Technical review queue: submitted demo article is missing');
    assertStatus(dataOf(await request(fetcher, { ...ctx, session: reviewer, method: 'POST', path: '/api/admin/reviews/articles/' + articleId + '/start', body: {}, label: 'Reviewer starts article review' }), 'Reviewer starts article review'), 'TECHNICAL_REVIEW', 'Reviewer starts article review');
    assertStatus(dataOf(await request(fetcher, {
      ...ctx, session: reviewer, method: 'POST', path: '/api/admin/reviews/articles/' + articleId + '/decision',
      body: { stage: 'TECHNICAL', decision: 'APPROVED', reason: '[DEMO] Acceptance technical review passed.' }, label: 'Technical approval',
    }), 'Technical approval'), 'EDITOR_IN_CHIEF_REVIEW', 'Technical approval');

    const chiefQueue = dataOf(await request(fetcher, { ...ctx, session: chief, path: '/api/admin/reviews/queue?stage=EDITOR_IN_CHIEF', label: 'Chief review queue' }), 'Chief review queue');
    if (!requireArray(chiefQueue?.articles, 'Chief review queue articles').some((item) => item.id === articleId)) throw new Error('Chief review queue: sensitive demo article is missing');
    assertStatus(dataOf(await request(fetcher, {
      ...ctx, session: chief, method: 'POST', path: '/api/admin/reviews/articles/' + articleId + '/decision',
      body: { stage: 'EDITOR_IN_CHIEF', decision: 'APPROVED', reason: '[DEMO] Acceptance chief review passed.' }, label: 'Chief approval',
    }), 'Chief approval'), 'APPROVED', 'Chief approval');
    await request(fetcher, { ...ctx, session: reviewer, method: 'POST', path: '/api/admin/articles/' + articleId + '/publish', body: {}, expect: [403], label: 'Reviewer publish denial after approval' });
    assertStatus(dataOf(await request(fetcher, { ...ctx, session: chief, method: 'POST', path: '/api/admin/articles/' + articleId + '/publish', body: {}, label: 'Chief publishes article' }), 'Chief publishes article'), 'PUBLISHED', 'Chief publishes article');

    const publicArticle = dataOf(await request(fetcher, { ...ctx, path: '/api/v1/articles/' + DEMO_ARTICLE_SLUG, label: 'Public article detail' }), 'Public article detail');
    if (publicArticle.id !== articleId) throw new Error('Public article detail: published article ID mismatch');
    const articleAudit = requireArray(dataOf(await request(fetcher, { ...ctx, session: admin, path: '/api/admin/audit?entityType=ARTICLE&entityId=' + articleId + '&limit=100', label: 'Article audit history' }), 'Article audit history'), 'Article audit history');
    const workflowActions = new Set(articleAudit.filter((event) => event.eventType === 'WORKFLOW').map((event) => event.action));
    for (const action of ['SUBMIT', 'REVIEW_STARTED', 'APPROVED', 'PUBLISH']) {
      if (!workflowActions.has(action)) throw new Error('Article audit history: missing workflow action ' + action);
    }
    pass('Article: Editor -> Technical Review -> Chief Review -> Publish -> Public + Audit');

    assertStatus(dataOf(await request(fetcher, {
      ...ctx, session: chief, method: 'POST', path: '/api/admin/articles/' + articleId + '/withdraw', body: { reason: '[DEMO] Acceptance cleanup after public verification.' }, label: 'Withdraw acceptance article',
    }), 'Withdraw acceptance article'), 'WITHDRAWN', 'Withdraw acceptance article');
    await request(fetcher, { ...ctx, path: '/api/v1/articles/' + DEMO_ARTICLE_SLUG, expect: [404], label: 'Withdrawn article hidden from public' });
    pass('Published acceptance article is hidden again after cleanup');

    const fieldList = requireArray(dataOf(await request(fetcher, { ...ctx, session: editor, path: '/api/admin/field-notes?search=' + encodeURIComponent(DEMO_FIELD_SLUG) + '&limit=20', label: 'Demo field-note lookup' }), 'Demo field-note lookup'), 'Demo field-note lookup');
    const field = fieldList.find((item) => item.slug === DEMO_FIELD_SLUG);
    requireDemoBaseline(field && field.status === 'DRAFT' && field.reviewReady === true, 'Field Note workflow');
    await request(fetcher, { ...ctx, session: editor, path: '/api/admin/field-notes/' + field.id, label: 'Editor reads field note' });
    assertStatus(dataOf(await request(fetcher, { ...ctx, session: editor, method: 'POST', path: '/api/admin/articles/' + field.articleId + '/submit', body: {}, label: 'Editor submits field note' }), 'Editor submits field note'), 'SUBMITTED', 'Editor submits field note');
    assertStatus(dataOf(await request(fetcher, { ...ctx, session: reviewer, method: 'POST', path: '/api/admin/reviews/articles/' + field.articleId + '/start', body: {}, label: 'Reviewer starts field-note review' }), 'Reviewer starts field-note review'), 'TECHNICAL_REVIEW', 'Reviewer starts field-note review');
    assertStatus(dataOf(await request(fetcher, {
      ...ctx, session: reviewer, method: 'POST', path: '/api/admin/reviews/articles/' + field.articleId + '/decision',
      body: { stage: 'TECHNICAL', decision: 'REQUEST_CHANGES', reason: '[DEMO] Acceptance returns field note for editor revision.' }, label: 'Reviewer returns field note',
    }), 'Reviewer returns field note'), 'NEEDS_CHANGES', 'Reviewer returns field note');
    const fieldAfter = dataOf(await request(fetcher, { ...ctx, session: editor, path: '/api/admin/field-notes/' + field.id, label: 'Returned field-note detail' }), 'Returned field-note detail');
    assertStatus(fieldAfter, 'NEEDS_CHANGES', 'Returned field-note detail');
    pass('Field Note readiness, submit, technical review and return-for-changes');

    const questions = requireArray(dataOf(await request(fetcher, { ...ctx, session: editor, path: '/api/admin/questions?status=IN_REVIEW&limit=100', label: 'Demo Q&A lookup' }), 'Demo Q&A lookup'), 'Demo Q&A lookup');
    const question = questions.find((item) => String(item.description || '').startsWith(DEMO_QUESTION_PREFIX));
    requireDemoBaseline(Boolean(question), 'Q&A workflow');
    const questionDetail = dataOf(await request(fetcher, { ...ctx, session: editor, path: '/api/admin/questions/' + question.id, label: 'Demo Q&A detail' }), 'Demo Q&A detail');
    requireDemoBaseline(questionDetail.answerStatus === 'NEEDS_CHANGES' && questionDetail.answerId, 'Q&A answer workflow');
    const answerId = questionDetail.answerId;
    const savedAnswer = dataOf(await request(fetcher, {
      ...ctx, session: editor, method: 'POST', path: '/api/admin/questions/' + question.id + '/answer',
      body: { body: '[DEMO] Acceptance Q&A answer after editor revision.', sensitivityFlags: ['LEGAL_CONTENT'], sensitivityAssessed: true }, label: 'Editor revises Q&A answer', expect: [201],
    }), 'Editor revises Q&A answer');
    assertStatus(savedAnswer, 'NEEDS_CHANGES', 'Editor revises Q&A answer');
    assertStatus(dataOf(await request(fetcher, { ...ctx, session: editor, method: 'POST', path: '/api/admin/questions/' + question.id + '/answer/submit', body: {}, label: 'Editor submits Q&A answer' }), 'Editor submits Q&A answer'), 'TECHNICAL_REVIEW', 'Editor submits Q&A answer');
    assertStatus(dataOf(await request(fetcher, {
      ...ctx, session: reviewer, method: 'POST', path: '/api/admin/reviews/question-answers/' + answerId + '/decision',
      body: { stage: 'TECHNICAL', decision: 'APPROVED', reason: '[DEMO] Acceptance Q&A technical review passed.' }, label: 'Q&A technical approval',
    }), 'Q&A technical approval'), 'EDITOR_IN_CHIEF_REVIEW', 'Q&A technical approval');
    assertStatus(dataOf(await request(fetcher, {
      ...ctx, session: chief, method: 'POST', path: '/api/admin/reviews/question-answers/' + answerId + '/decision',
      body: { stage: 'EDITOR_IN_CHIEF', decision: 'APPROVED', reason: '[DEMO] Acceptance Q&A chief review passed.' }, label: 'Q&A chief approval',
    }), 'Q&A chief approval'), 'APPROVED', 'Q&A chief approval');
    assertStatus(dataOf(await request(fetcher, { ...ctx, session: chief, method: 'POST', path: '/api/admin/questions/' + question.id + '/answer/publish', body: {}, label: 'Chief publishes Q&A answer' }), 'Chief publishes Q&A answer'), 'PUBLISHED', 'Q&A publishes');
    const publicQuestion = dataOf(await request(fetcher, { ...ctx, path: '/api/v1/questions/' + question.id, label: 'Public Q&A detail' }), 'Public Q&A detail');
    if (publicQuestion.id !== question.id) throw new Error('Public Q&A detail: published question ID mismatch');
    await request(fetcher, {
      ...ctx, session: editor, method: 'PATCH', path: '/api/admin/questions/' + question.id,
      body: { status: 'ARCHIVED', moderationNote: '[DEMO] Acceptance cleanup after public verification.' }, label: 'Archive acceptance Q&A',
    });
    await request(fetcher, { ...ctx, path: '/api/v1/questions/' + question.id, expect: [404], label: 'Archived Q&A hidden from public' });
    pass('Q&A: revise -> Technical Review -> Chief Review -> Publish -> Public -> Archive cleanup');

    const chapters = requireArray(dataOf(await request(fetcher, { ...ctx, session: editor, path: '/api/admin/chapters', label: 'Editor chapter list' }), 'Editor chapter list'), 'Editor chapter list');
    if (!chapters.length) throw new Error('Chapter acceptance: no documented chapter slots exist');
    const chapter = chapters.find((item) => item.articleId === null) || chapters[0];
    const originalTitle = chapter.title ?? null;
    const probeTitle = '[DEMO][ACCEPTANCE] Chapter slot write probe';
    const changedChapter = dataOf(await request(fetcher, {
      ...ctx, session: editor, method: 'PATCH', path: '/api/admin/chapters/' + chapter.id, body: { title: probeTitle }, label: 'Editor updates chapter slot',
    }), 'Editor updates chapter slot');
    if (changedChapter.title !== probeTitle) throw new Error('Chapter acceptance: title write did not persist');
    const restoredChapter = dataOf(await request(fetcher, {
      ...ctx, session: editor, method: 'PATCH', path: '/api/admin/chapters/' + chapter.id, body: { title: originalTitle }, label: 'Restore chapter slot title',
    }), 'Restore chapter slot title');
    if ((restoredChapter.title ?? null) !== originalTitle) throw new Error('Chapter acceptance: original title was not restored');
    pass('Chapter slot read/write permission and restoration');

    pass('CONSPACE local role acceptance completed. Run db:seed-demo again before repeating the workflow fixtures.');
  } finally {
    for (const session of sessions.reverse()) await logout(fetcher, ctx, session);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runLocalRoleAcceptance().catch((error) => {
    console.error('FAIL: ' + error.message);
    process.exitCode = 1;
  });
}
