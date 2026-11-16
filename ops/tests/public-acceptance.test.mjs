import test from 'node:test';
import assert from 'node:assert/strict';
import { onlyLocal, PUBLIC_ROUTES, assertPublishedOnly } from '../scripts/public-acceptance.mjs';
import { apiUrl } from '../../frontend/src/lib/api.js';

test('public acceptance refuses remote URLs and credentials',()=>{
  assert.equal(onlyLocal('http://127.0.0.1:5088/','API').hostname,'127.0.0.1');
  for(const candidate of ['https://conspace.vn/','http://103.149.170.146/','http://a:b@localhost:5088/','http://localhost:5088/api']) {
    assert.throws(()=>onlyLocal(candidate,'API'),/local HTTP loopback/);
  }
});
test('public acceptance has core reader journeys',()=>{
  for(const path of ['/','/ngach','/mang/house','/tu-sach','/hoi-dap','/tra-nhanh','/ket-noi'])assert.ok(PUBLIC_ROUTES.includes(path));
  assert.equal(new Set(PUBLIC_ROUTES).size,PUBLIC_ROUTES.length);
});
test('public acceptance rejects unpublished fixture leakage',()=>{
  const baseline={published:{slug:'demo-public-design-overview'},draft:{status:404},fieldDraft:{status:404},listedQuestions:[]};
  assert.doesNotThrow(()=>assertPublishedOnly(baseline));
  assert.throws(()=>assertPublishedOnly({...baseline,draft:{status:200}}),/Unpublished article/);
  assert.throws(()=>assertPublishedOnly({...baseline,listedQuestions:[{description:'[DEMO] Câu hỏi mô phỏng'}]}),/Unpublished demo question/);
});

test('public acceptance covers the Dictionary detail API and slug-based Field Notes',()=>{
  assert.ok(PUBLIC_ROUTES.includes('/tu-dien/demo-thuat-ngu-cong-khai'));
  assert.equal(apiUrl('/terms/demo-thuat-ngu-cong-khai'),'/api/v1/terms/demo-thuat-ngu-cong-khai');
  assert.equal(apiUrl('/field-notes/demo-field-ready'),'/api/v1/field-notes/demo-field-ready');
});
