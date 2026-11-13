import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeoState, SEO_DEFAULTS } from './seo.js';

test('SEO state uses production canonical origin and indexable robots by default',()=>{
  const state=buildSeoState({
    title:'Bài thử',
    description:'Mô tả thử',
    canonicalPath:'/bai-viet/bai-thu',
    type:'article',
    publishedTime:'2026-11-13T00:00:00.000Z',
  });
  assert.equal(state.finalTitle,'Bài thử | CONSPACE · Sự thật ngành Xây');
  assert.equal(state.canonicalUrl,'https://conspace.vn/bai-viet/bai-thu');
  assert.equal(state.robots,'index,follow,max-image-preview:large');
  assert.equal(state.type,'article');
});

test('SEO state marks unpublished or invalid surfaces noindex',()=>{
  const state=buildSeoState({
    title:'Chưa công khai',
    canonicalPath:'/bai-viet/chua-cong-khai',
    index:false,
  });
  assert.equal(state.robots,'noindex,nofollow');
  assert.equal(state.canonicalUrl,'https://conspace.vn/bai-viet/chua-cong-khai');
});

test('SEO defaults keep the canonical production origin stable',()=>{
  assert.equal(SEO_DEFAULTS.SITE_ORIGIN,'https://conspace.vn');
});
