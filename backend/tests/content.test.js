import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createContentRouter } from '../src/routes/content.js';
import { errorMiddleware, decodeCursor, encodeCursor } from '../src/http/validation.js';
import { createContentRepository } from '../src/repositories/content.js';
import { confirmedDesignCategories } from '../src/database/seed.js';

const id = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const publishedAt = '2026-11-11T09:00:00.000Z';
const record = {
  id, slug: 'construction-facts', title: 'Verified content', excerpt: 'Verified excerpt',
  coverImage: null, niches: ['house'], publishedAt, preferenceRank: 0,
  updatedAt: publishedAt, body: 'Verified markdown',
  authorName: 'Reviewed author', authorVerified: true, sources: [],
};

function mockRouter(repository) {
  const app = express();
  app.use('/api/v1', createContentRouter(repository));
  app.use(errorMiddleware);
  return app;
}

async function withServer(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return 'http://127.0.0.1:' + server.address().port;
}

test('documented seed contains exactly eight design categories and no invented construction names', () => {
  assert.equal(confirmedDesignCategories.length, 8);
  assert.deepEqual(confirmedDesignCategories.map((value) => value.name), [
    'HOUSE', 'LUXURY', 'F&B', 'STAY', 'OFFICE', 'PROJECT', 'FACTORY', 'SACRED',
  ]);
});

test('GET niches returns the contract envelope, accepts group and rejects unknown parameters', async (t) => {
  const calls = [];
  const api = mockRouter({
    niches: async (group) => {
      calls.push(group);
      return [{ id, slug: 'house', name: 'HOUSE', group: 'design', templateType:'TEMPLATE_B', expectedSectionCount:7, summary: '', articleCount: 0 }];
    },
  });
  const base = await withServer(t, api);
  const response = await fetch(base + '/api/v1/niches?group=design');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).meta, { total: 1 });
  assert.deepEqual(calls, ['design']);
  for (const suffix of ['?group=invalid', '?unknown=value', '?group=construction&group=design']) {
    const invalid = await fetch(base + '/api/v1/niches' + suffix);
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
  }
});

test('GET articles supports keyset cursor with a strict limit and author mapping', async (t) => {
  const calls = [];
  const api = mockRouter({
    articles: async (params) => {
      calls.push(params);
      return [record, { ...record, id: secondId, slug: 'more' }];
    },
  });
  const base = await withServer(t, api);
  const response = await fetch(base + '/api/v1/articles?role=homeowner&niche=house&limit=1');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.length, 1);
  assert.deepEqual(body.data[0].author, { displayName: 'Reviewed author', verified: true });
  assert.ok(body.meta.nextCursor);
  const next = await fetch(base + '/api/v1/articles?role=homeowner&limit=1&cursor=' + body.meta.nextCursor);
  assert.equal(next.status, 200);
  assert.deepEqual(calls[0].cursor, null);
  assert.equal(calls[1].cursor.id, id);
  assert.equal(calls[1].cursor.v,2);
  assert.equal(calls[1].cursor.role,'homeowner');
  for (const suffix of ['?limit=51', '?limit=0', '?limit=abc', '?role=admin', '?niche=bad%27slug', '?cursor=not-base64']) {
    const invalid = await fetch(base + '/api/v1/articles' + suffix);
    assert.equal(invalid.status, 400, suffix);
  }
});

test('cursor round-trip and tampering protection', () => {
  const token = encodeCursor(record);
  assert.deepEqual(decodeCursor(token), { v: 1, id, publishedAt });
  const preferred=encodeCursor({...record,preferenceRank:0},'architect');
  assert.deepEqual(decodeCursor(preferred),{v:2,role:'architect',preferenceRank:0,id,publishedAt});
  assert.throws(() => decodeCursor(token + '!'), { status: 400 });
  assert.throws(() => decodeCursor(Buffer.from('{}').toString('base64url')), { status: 400 });
});

test('GET article detail returns full content and responds 404 for unpublished or missing items', async (t) => {
  const api = mockRouter({ articleBySlug: async (slug) => slug === record.slug ? record : null });
  const base = await withServer(t, api);
  const found = await fetch(base + '/api/v1/articles/' + record.slug);
  assert.equal(found.status, 200);
  const content = (await found.json()).data;
  assert.equal(content.body, record.body);
  assert.deepEqual(content.sources, []);
  assert.equal((await fetch(base + '/api/v1/articles/missing')).status, 404);
  assert.equal((await fetch(base + '/api/v1/articles/%27OR')).status, 400);
});

test('GET terms returns reviewable shape and validates search and limits', async (t) => {
  const api = mockRouter({
    terms: async (q, limit) => {
      assert.equal(q, 'móng');
      assert.equal(limit, 20);
      return { rows: [{ id, term: 'Móng', slug: 'mong', definition: 'Reviewed definition', niches: [] }], total: 1 };
    },
  });
  const base = await withServer(t, api);
  const response = await fetch(base + '/api/v1/terms?q=m%C3%B3ng');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).meta.total, 1);
  assert.equal((await fetch(base + '/api/v1/terms?limit=999')).status, 400);
});

test('database failures use a safe 500 envelope without revealing the driver message', async (t) => {
  const api = mockRouter({
    niches: async () => { throw new Error('password=never-expose postgres relation missing'); },
  });
  const base = await withServer(t, api);
  const response = await fetch(base + '/api/v1/niches');
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error.code, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify(body).includes('password'));
});

test('repository uses parameter placeholders for all public inputs', async () => {
  const calls = [];
  const db = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: sql.includes('COUNT(*)') ? [{ total: 0 }] : [] };
    },
  };
  const repository = createContentRepository(db);
  await repository.niches('construction');
  await repository.articles({
    role: 'contractor', niche: "x' OR TRUE --", limit: 12,
    cursor: { publishedAt, id },
  });
  await repository.articleBySlug("foo' OR TRUE --");
  await repository.terms("a'b", 20);
  assert.equal(calls.length, 5);
  assert.ok(calls.every(({ sql, params }) => Array.isArray(params) && !sql.includes("x' OR TRUE")));
  assert.ok(calls.some(({ params }) => params.includes("x' OR TRUE --")));
  assert.ok(calls.some(({ params }) => params.includes("foo' OR TRUE --")));
  assert.ok(calls.some(({ params }) => params.includes("a'b")));
  assert.match(calls[1].sql, /approved_at IS NOT NULL/);
  assert.match(calls[1].sql, /LIMIT \$6/);
  assert.equal(calls[1].params[5], 13);
});


test('reader lens is a ranking preference and does not filter other published audiences',async()=>{
 const calls=[],db={query:async(sql,params)=>{calls.push({sql,params});return {rows:[]};}};
 const repository=createContentRepository(db);
 await repository.articles({role:'homeowner',niche:null,limit:12,cursor:null});
 assert.equal(calls[0].params[0],'homeowner');
 assert.ok(calls[0].sql.includes('CASE WHEN $1::text IS NOT NULL AND a.audience_role=$1 THEN 0 ELSE 1 END'));
 assert.ok(!calls[0].sql.includes('AND ($1::text IS NULL OR a.audience_role=$1'));
});
