import test from 'node:test';
import assert from 'node:assert/strict';
import { adminPath, adminRequest, AdminApiError, adminList, hasPermission, formDateTime, uploadAdminImage, setAdminCsrf, clearAdminCsrf } from './api.js';
import { slugify, NICHE_BLOCKS, PERSPECTIVES, BOOK_REFERENCES } from './constants.js';

test('private API prefix is same-origin /api/admin, never /api/v1/admin', () => {
  assert.equal(adminPath('/articles', { status: 'DRAFT', page: 2 }), '/api/admin/articles?status=DRAFT&page=2');
  for (const path of ['https://evil.test', '//evil.test', '/../login', '/articles/../users', '/articles//edit','/x?redirect=//evil']) assert.throws(() => adminPath(path));
});
test('CSRF required for write; same-origin cookie only, no bearer or localStorage', async t => {
  const prev=globalThis.fetch; const seen=[];
  globalThis.fetch=async(url,init)=>{seen.push({url,init});return {ok:true,status:200,json:async()=>({ok:true,data:{id:'a'}})};};
  t.after(()=>{globalThis.fetch=prev;clearAdminCsrf();});
  clearAdminCsrf();
  await assert.rejects(()=>adminRequest('/articles',{method:'PATCH',data:{title:'A'}}),e=>e.code==='CSRF_MISSING');
  assert.equal(seen.length,0);
  setAdminCsrf('server-issued-csrf');
  await adminRequest('/articles/abcdef',{method:'PATCH',data:{title:'Đúng nguồn'}});
  assert.equal(seen[0].url,'/api/admin/articles/abcdef');
  assert.equal(seen[0].init.headers['X-CSRF-Token'],'server-issued-csrf');
  assert.equal(seen[0].init.headers.Authorization,undefined);
  assert.equal(seen[0].init.credentials,'same-origin');
  assert.deepEqual(JSON.parse(seen[0].init.body),{title:'Đúng nguồn'});
});
test('login is allowed without CSRF; subsequent reads are no-store', async t=>{
  const prev=globalThis.fetch;const seen=[];
  globalThis.fetch=async(url,opts)=>{seen.push({url,opts});return {ok:true,status:200,json:async()=>({ok:true,data:{user:{role:'ADMIN'}}})};};
  t.after(()=>{globalThis.fetch=prev;clearAdminCsrf();});
  clearAdminCsrf();
  await adminRequest('/auth/login',{method:'POST',data:{email:'editor@example.org',password:'example'}});
  await adminRequest('/auth/session');
  assert.equal(seen[0].opts.headers['X-CSRF-Token'],undefined);
  assert.equal(seen[1].opts.cache,'no-store');
});
test('backend errors 401/403/404 never produce simulated success',async t=>{
  const prev=globalThis.fetch;t.after(()=>{globalThis.fetch=prev;});
  for(const status of [401,403,404]){
    globalThis.fetch=async()=>({ok:false,status,json:async()=>({ok:false,error:{code:'DENIED'}})});
    await assert.rejects(()=>adminRequest('/auth/session'),e=>e instanceof AdminApiError&&e.status===status);
  }
});
test('roles are UI hints based on a real backend session; server is authority',()=>{
  assert.equal(hasPermission({role:'ADMIN'},'articles:publish'),false);
  assert.equal(hasPermission({role:'ADMIN'},'reviews:read'),false);
  assert.equal(hasPermission({role:'ADMIN'},'articles:create'),false);
  assert.equal(hasPermission({role:'ADMIN'},'users:write'),true);
  assert.equal(hasPermission({role:'ADMIN'},'books:read'),false);
  assert.equal(hasPermission({role:'ADMIN'},'media:read'),false);
  assert.equal(hasPermission({role:'EDITOR_IN_CHIEF'},'dictionary:publish'),true);
  assert.equal(hasPermission({role:'EDITOR'},'articles:publish'),false);
  assert.equal(hasPermission({role:'TECHNICAL_REVIEWER'},'reviews:technical:decide'),true);
  assert.equal(hasPermission({role:'EDITOR_IN_CHIEF'},'reviews:chief:decide'),true);
  assert.equal(hasPermission({role:'anonymous',permissions:['*']},'users:write'),false);
  assert.equal(hasPermission(null,'articles:read'),false);
});
test('list response rejects invalid data shape',async t=>{
  const prev=globalThis.fetch;t.after(()=>{globalThis.fetch=prev;});
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({ok:true,data:{rows:[]}})});
  await assert.rejects(()=>adminList('/articles'),/danh sách không hợp lệ/);
});
test('editorial blocks and books exactly reflect approved references',()=>{
  assert.equal(NICHE_BLOCKS.length,12);
  assert.deepEqual(PERSPECTIVES.find(x=>x.id==='homeowner').indexes,[0,2,3,4,6,10]);
  assert.equal(BOOK_REFERENCES.length,3);
  assert.equal(BOOK_REFERENCES[2].label,'Tự sự, có hư cấu');
  assert.equal(slugify('Chống thấm sàn mái nhà Ở'),'chong-tham-san-mai-nha-o');
  assert.equal(formDateTime('invalid'),'');
});
test('media upload rejects svg, gif, oversized and unlicensed confirmation locally',async()=>{
  await assert.rejects(()=>uploadAdminImage({type:'image/svg+xml',size:200}),/JPEG, PNG/);
  await assert.rejects(()=>uploadAdminImage({type:'image/gif',size:200}),/JPEG, PNG/);
  await assert.rejects(()=>uploadAdminImage({type:'image/png',size:11*1024*1024}),/10 MB/);
  await assert.rejects(()=>uploadAdminImage({type:'image/png',size:1},{rightsConfirmed:true}),/căn cứ quyền/);
});
test('media JSON upload uses actual backend shape, confirms server ID',async t=>{
  const prev=globalThis.fetch;t.after(()=>{globalThis.fetch=prev;clearAdminCsrf();});setAdminCsrf('session-token');let request;
  globalThis.fetch=async(url,init)=>{request={url,init};return {ok:true,status:201,json:async()=>({ok:true,data:{id:'real-uuid',originalFilename:'photo.png'}})};};
  const fake={name:'photo.png',type:'image/png',size:3,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};
  const result=await uploadAdminImage(fake,{rightsConfirmed:true,rightsNote:'Tác giả có đồng ý'});
  const body=JSON.parse(request.init.body);
  assert.equal(result.id,'real-uuid');
  assert.equal(request.url,'/api/admin/media');
  assert.equal(body.file.mimeType,'image/png');
  assert.equal(body.file.data,'AQID');
  assert.equal(body.rightsConfirmed,true);
  assert.equal(body.rightsNote,'Tác giả có đồng ý');
});
test('ok:false payload rejects even with HTTP 200',async t=>{
  const prev=globalThis.fetch;t.after(()=>{globalThis.fetch=prev;});
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({ok:false,error:{message:'Lỗi có thật'}})});
  await assert.rejects(()=>adminRequest('/articles'),/Lỗi có thật/);
});

test('primary role permissions remain available when delegated grants are empty', () => {
  assert.equal(hasPermission({ role: 'ADMIN', permissions: [] }, 'dashboard:read'), true);
  assert.equal(hasPermission({ role: 'ADMIN', permissions: [] }, 'articles:read'), true);
  assert.equal(hasPermission({ role: 'ADMIN', permissions: [] }, 'users:read'), true);
  assert.equal(hasPermission({ role: 'ADMIN', permissions: [] }, 'users:write'), true);
  assert.equal(hasPermission({ role: 'ADMIN', permissions: [] }, 'articles:publish'), false);
  assert.equal(hasPermission({ role: 'ADMIN', permissions: [] }, 'reviews:read'), false);
  assert.equal(hasPermission({ role: 'EDITOR_IN_CHIEF', permissions: [] }, 'articles:publish'), true);
});

test('delegated backend permissions add only their mapped UI capabilities', () => {
  assert.equal(hasPermission({ role: 'ADMIN', permissions: ['CONTENT_PUBLISH'] }, 'articles:publish'), true);
  assert.equal(hasPermission({ role: 'ADMIN', permissions: ['CONTENT_PUBLISH'] }, 'niches:publish'), true);
  assert.equal(hasPermission({ role: 'ADMIN', permissions: ['CONTENT_WITHDRAW'] }, 'articles:withdraw'), true);
  assert.equal(hasPermission({ role: 'ADMIN', grants: ['users:write'] }, 'users:write'), true);
});
