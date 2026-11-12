import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword, verifyPassword } from '../src/security/password.js';
import { encryptPrivateContact, decryptPrivateContact } from '../src/security/private-contact.js';
import { createMediaService, sniffMime } from '../src/services/media.js';
import { requireRoles, requireRolesOrPermissions, requireCsrf } from '../src/middleware/admin-auth.js';
import { errorMiddleware, RequestError } from '../src/http/validation.js';

async function start(t, app) {
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise((resolve)=>server.close(resolve)));
  return 'http://127.0.0.1:'+server.address().port;
}

test('scrypt password hash is salted, verifiable and never stores plaintext', async()=>{
  const password='A-long-unique-CMS-password-2026';
  const encoded=await hashPassword(password);
  assert.match(encoded,/^scrypt\$32768\$8\$1\$/);
  assert.notEqual(encoded,password);
  assert.equal(await verifyPassword(password,encoded),true);
  assert.equal(await verifyPassword('incorrect-password',encoded),false);
  assert.equal(await verifyPassword(password,'not-a-hash'),false);
  await assert.rejects(hashPassword('short'),/14 and 256/);
});

test('private Q&A contact is authenticated AES-256-GCM ciphertext',()=>{
  const key='ab'.repeat(32);
  const record=encryptPrivateContact('+84901234567',key);
  assert.notEqual(record.ciphertext.toString('utf8'),'+84901234567');
  assert.equal(decryptPrivateContact(record,key),'+84901234567');
  const tampered={...record,ciphertext:Buffer.from(record.ciphertext)};
  tampered.ciphertext[0]^=1;
  assert.throws(()=>decryptPrivateContact(tampered,key));
});

test('MIME sniffing rejects spoofed and unsupported file contents',()=>{
  assert.equal(sniffMime(Buffer.from([0xff,0xd8,0xff,0x00])),'image/jpeg');
  assert.equal(sniffMime(Buffer.from([137,80,78,71,13,10,26,10])),'image/png');
  assert.equal(sniffMime(Buffer.from('RIFF0000WEBP')),'image/webp');
  assert.equal(sniffMime(Buffer.from('%PDF-1.7')),'application/pdf');
  assert.equal(sniffMime(Buffer.from('not an image')),null);
});

test('media storage uses generated names, restrictive storage and cleanup',async(t)=>{
  const dir=await mkdtemp(join(tmpdir(),'conspace-media-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const queries=[];
  const db={query:async(sql,params)=>{
    queries.push({sql,params});
    if(sql.startsWith('INSERT INTO conspace.media_assets')){
      return {rows:[{id:'11111111-1111-4111-8111-111111111111',originalFilename:params[1],mimeType:params[2],sizeBytes:params[3],category:params[5],rightsConfirmed:params[8]}]};
    }
    if(sql.startsWith('SELECT id,storage_key')) return {rows:[{id:queries[0].params[0],storage_key:queries[0].params[0]}]};
    return {rows:[]};
  }};
  const service=createMediaService(db,dir);
  const buffer=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const saved=await service.save({buffer,size:buffer.length,mimetype:'image/png',originalname:'../../unsafe.png'},'22222222-2222-4222-8222-222222222222',{rightsConfirmed:true,rightsNote:'Photographer licence'});
  assert.equal(saved.category,'IMAGE');
  assert.equal(saved.rightsConfirmed,true);
  const names=await readdir(dir);
  assert.equal(names.length,1);
  assert.match(names[0],/^[0-9a-f-]{36}\.png$/);
  assert.equal(queries[0].params[1],'.._.._unsafe.png');
  await service.cleanup([saved.id]);
  assert.equal((await readdir(dir)).length,0);
});

test('media service rejects MIME mismatch and non-image upload on image-only route',async(t)=>{
  const dir=await mkdtemp(join(tmpdir(),'conspace-media-invalid-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const service=createMediaService({query:async()=>({rows:[]})},dir);
  const pdf=Buffer.from('%PDF-1.7');
  await assert.rejects(service.save({buffer:pdf,size:pdf.length,mimetype:'image/png',originalname:'bad.png'},null),{status:415});
  await assert.rejects(service.save({buffer:pdf,size:pdf.length,mimetype:'application/pdf',originalname:'doc.pdf'},null,{imagesOnly:true}),{status:415});
});

test('RBAC denies missing or insufficient role',async(t)=>{
  const app=express();
  app.use((req,_res,next)=>{const role=req.get('x-role')||'GUEST';const roles=(req.get('x-roles')||'').split(',').filter(Boolean);const permissions=(req.get('x-permissions')||'').split(',').filter(Boolean);req.auth={role,roles:roles.length?roles:[role],permissions};next();});
  app.get('/admin',requireRoles('ADMIN'),(_req,res)=>res.json({ok:true}));
  app.get('/review',requireRoles('TECHNICAL_REVIEWER'),(_req,res)=>res.json({ok:true}));
  app.get('/publish',requireRolesOrPermissions(['EDITOR_IN_CHIEF'],['CONTENT_PUBLISH']),(_req,res)=>res.json({ok:true}));
  app.use(errorMiddleware);
  const base=await start(t,app);
  assert.equal((await fetch(base+'/admin')).status,403);
  assert.equal((await fetch(base+'/admin',{headers:{'x-role':'EDITOR'}})).status,403);
  assert.equal((await fetch(base+'/admin',{headers:{'x-role':'ADMIN'}})).status,200);
  assert.equal((await fetch(base+'/review',{headers:{'x-role':'ADMIN'}})).status,403);
  assert.equal((await fetch(base+'/review',{headers:{'x-role':'ADMIN','x-roles':'ADMIN,TECHNICAL_REVIEWER'}})).status,200);
  assert.equal((await fetch(base+'/publish',{headers:{'x-role':'ADMIN'}})).status,403);
  assert.equal((await fetch(base+'/publish',{headers:{'x-role':'ADMIN','x-permissions':'CONTENT_PUBLISH'}})).status,200);
});

test('CSRF middleware rejects missing token and accepts the session token',async(t)=>{
  const app=express();
  app.use(express.json());
  app.use((req,_res,next)=>{req.session={csrfToken:'secure-random-token'};next();});
  app.post('/mutate',requireCsrf,(_req,res)=>res.json({ok:true}));
  app.use(errorMiddleware);
  const base=await start(t,app);
  assert.equal((await fetch(base+'/mutate',{method:'POST'})).status,403);
  assert.equal((await fetch(base+'/mutate',{method:'POST',headers:{'x-csrf-token':'wrong'}})).status,403);
  assert.equal((await fetch(base+'/mutate',{method:'POST',headers:{'x-csrf-token':'secure-random-token'}})).status,200);
});

test('error middleware does not expose database messages',async(t)=>{
  const app=express();
  app.get('/failure',(_req,_res,next)=>next(Object.assign(new Error('password=secret SQL SELECT *'),{code:'23505'})));
  app.use(errorMiddleware);
  const base=await start(t,app);
  const response=await fetch(base+'/failure');
  assert.equal(response.status,409);
  const body=await response.json();
  assert.equal(body.error.code,'CONFLICT');
  assert.ok(!JSON.stringify(body).includes('password'));
  assert.ok(!JSON.stringify(body).includes('SELECT'));
});
