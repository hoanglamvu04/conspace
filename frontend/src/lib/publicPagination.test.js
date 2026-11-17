import test from 'node:test';
import assert from 'node:assert/strict';
import {searchResultKey,appendUniqueSearchResults,hasMoreQuestionPage,hasMoreFieldPage} from './publicPagination.js';

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
