import test from 'node:test';
import assert from 'node:assert/strict';
import { onlyLocal, PUBLIC_ROUTES, assertPublishedOnly } from '../scripts/public-acceptance.mjs';

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
