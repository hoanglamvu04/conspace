import test from 'node:test';
import assert from 'node:assert/strict';
import {searchResultKey,appendUniqueSearchResults,hasMoreQuestionPage,hasMoreFieldPage,questionAnswerTeaser,normalizePublicContentFilters,buildPublicContentFilterParams} from './publicPagination.js';

test('search key distinguishes reader lens, filter and search term',()=>{
  const baseline=searchResultKey('chống thấm','homeowner','all','');
  assert.equal(baseline,searchResultKey('chống thấm','homeowner','all',''));
  assert.notEqual(baseline,searchResultKey('chống thấm','architect','all',''));
  assert.notEqual(baseline,searchResultKey('chống thấm','homeowner','term',''));
  assert.notEqual(baseline,searchResultKey('chống thấm','homeowner','all','house'));
  assert.notEqual(baseline,searchResultKey('nứt tường','homeowner','all',''));
});

test('search load more keeps distinct entity types and deduplicates retried pages',()=>{
  const first=[{id:'a',type:'article',title:'Bài viết'},{id:'shared',type:'term',title:'Thuật ngữ'}];
  const second=[{id:'a',type:'article',title:'Trùng trang'},{id:'a',type:'niche',title:'Ngách'},{id:'z',type:'article',title:'Mới'}];
  const result=appendUniqueSearchResults(first,second);
  assert.deepEqual(result.map(x=>x.title),['Bài viết','Thuật ngữ','Ngách','Mới']);
  assert.deepEqual(appendUniqueSearchResults(result,second),result);
  assert.throws(()=>appendUniqueSearchResults([],null),TypeError);
});

test('Q&A pagination prevents advancing on stale metadata or last page',()=>{
  assert.equal(hasMoreQuestionPage({page:1,limit:10,total:35},1),true);
  assert.equal(hasMoreQuestionPage({page:1,limit:10,total:35},2),false);
  assert.equal(hasMoreQuestionPage({page:4,limit:10,total:35},4),false);
  assert.equal(hasMoreQuestionPage({page:1,limit:10,total:0},1),false);
  assert.equal(hasMoreQuestionPage(null,1),false);
});

test('Field Note pagination prevents advancing on stale metadata and empty pages',()=>{
  assert.equal(hasMoreFieldPage({offset:0,total:30},0,12),true);
  assert.equal(hasMoreFieldPage({offset:0,total:30},12,12),false);
  assert.equal(hasMoreFieldPage({offset:24,total:30},24,6),false);
  assert.equal(hasMoreFieldPage({offset:12,total:30},12,0),false);
});

test('published Q&A cards show a concise answer with the full detail untouched', () => {
  assert.equal(questionAnswerTeaser('  Bê tông   cần bảo dưỡng.  '), 'Bê tông cần bảo dưỡng.');
  const long = ('Câu trả lời kỹ thuật gồm các bước nghiệm thu. ').repeat(20);
  const teaser = questionAnswerTeaser(long);
  assert.ok(teaser.length <= 221);
  assert.ok(teaser.endsWith('…'));
  assert.ok(!teaser.includes('  '));
  assert.equal(questionAnswerTeaser(null), '');
});


test('shared Field/Q&A URL filters keep shareable safe fields and avoid one-letter searches', () => {
  const { q, niche } = normalizePublicContentFilters('q=ch%E1%BB%91ng+th%E1%BA%A5m&niche=house&admin=true');
  assert.equal(q, 'chống thấm');
  assert.equal(niche, 'house');
  const values = buildPublicContentFilterParams({q, niche, admin:'true'});
  assert.equal(values.toString(), 'q=ch%E1%BB%91ng+th%E1%BA%A5m&niche=house');
  assert.deepEqual(normalizePublicContentFilters('?q=a&niche=%2Fadmin'), {q:'',niche:''});
  assert.deepEqual(normalizePublicContentFilters('q=%25_%5C&niche=f-b'), {q:'%_\\',niche:'f-b'});
  assert.equal(buildPublicContentFilterParams({q:'',niche:''}).toString(),'');
});
