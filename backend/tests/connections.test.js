import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createPublicConnectionsRouter } from '../src/routes/public-connections.js';
import { createConnectionsRouter } from '../src/routes/admin/connections.js';
import { encryptPrivateContact } from '../src/security/private-contact.js';
import { errorMiddleware } from '../src/http/validation.js';

const KEY='11'.repeat(32);
const ID='11111111-1111-4111-8111-111111111111';

async function listen(t,app){
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return 'http://127.0.0.1:'+server.address().port;
}

function publicDb(){
  const calls=[];
  const client={
    query:async(sql,params=[])=>{
      calls.push({sql,params});
      if(sql.includes('INSERT INTO conspace.connection_intakes')){
        return {rows:[{id:ID,status:'SUBMITTED',createdAt:'2026-11-14T00:00:00.000Z'}],rowCount:1};
      }
      return {rows:[],rowCount:1};
    },
    release(){},
  };
  return {calls,connect:async()=>client,query:client.query};
}

test('private Connection intake encrypts contact and never echoes plaintext',async(t)=>{
  const db=publicDb();
  const app=express();
  app.use(express.json());
  app.use('/api/v1/connections',createPublicConnectionsRouter(db,KEY));
  app.use(errorMiddleware);
  const base=await listen(t,app);
  const contact='0900000000 / inbox@example.test';
  const response=await fetch(base+'/api/v1/connections',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({
      type:'project',
      description:'Tôi cần trao đổi riêng về một dự án đang chuẩn bị triển khai.',
      region:'Hà Nội',
      contact,
    }),
  });
  assert.equal(response.status,201);
  const body=await response.json();
  assert.equal(body.data.status,'SUBMITTED');
  assert.ok(!JSON.stringify(body).includes(contact));
  const insert=db.calls.find(call=>call.sql.includes('INSERT INTO conspace.connection_intakes'));
  assert.equal(insert.params[0],'PROJECT');
  assert.ok(Buffer.isBuffer(insert.params[4]));
  assert.notEqual(insert.params[4].toString('utf8'),contact);
  const audit=db.calls.find(call=>call.sql.includes('INSERT INTO conspace.audit_logs'));
  assert.ok(audit);
  assert.ok(!JSON.stringify(audit.params).includes(contact));
});

test('private Connection intake fails closed without encryption key',async(t)=>{
  const app=express();
  app.use(express.json());
  app.use('/api/v1/connections',createPublicConnectionsRouter(publicDb(),''));
  app.use(errorMiddleware);
  const base=await listen(t,app);
  const response=await fetch(base+'/api/v1/connections',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({
      type:'join',
      description:'Tôi muốn tham gia đóng góp tư liệu và chuyên môn cho CONSPACE.',
      contact:'inbox@example.test',
    }),
  });
  assert.equal(response.status,503);
  assert.equal((await response.json()).error.code,'PRIVATE_CONTACT_UNAVAILABLE');
});

function adminDb(){
  const encrypted=encryptPrivateContact('editor-contact@example.test',KEY);
  const calls=[];
  const detail={
    id:ID,intake_type:'PROJECT',type:'PROJECT',description:'Nhu cầu thử nghiệm',
    region:'Hà Nội',status:'SUBMITTED',moderationNote:null,createdAt:'2026-11-14T00:00:00.000Z',
    contact_ciphertext:encrypted.ciphertext,contact_iv:encrypted.iv,contact_auth_tag:encrypted.authTag,
  };
  const query=async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.includes('SELECT c.*,c.intake_type')){
      return {rows:[{...detail}],rowCount:1};
    }
    if(sql.startsWith('SELECT c.id,c.intake_type')){
      return {rows:[{id:ID,type:'PROJECT',description:'Nhu cầu thử nghiệm',region:'Hà Nội',status:'SUBMITTED',createdAt:'2026-11-14T00:00:00.000Z'}]};
    }
    if(sql.startsWith('SELECT count(*)')) return {rows:[{total:1}]};
    if(sql.startsWith('SELECT * FROM conspace.connection_intakes')) return {rows:[{id:ID,status:'SUBMITTED',moderation_note:null}]};
    if(sql.startsWith('UPDATE conspace.connection_intakes')){
      return {rows:[{id:ID,type:'PROJECT',status:'IN_REVIEW',moderationNote:'Đã tiếp nhận thủ công',updatedAt:'2026-11-14T01:00:00.000Z'}]};
    }
    return {rows:[],rowCount:1};
  };
  const client={query,release(){}};
  return {calls,query,connect:async()=>client};
}

async function adminServer(t,db){
  const app=express();
  app.use(express.json());
  app.use((req,_res,next)=>{
    req.auth={id:'22222222-2222-4222-8222-222222222222',role:req.get('x-test-role')||'ADMIN',roles:[req.get('x-test-role')||'ADMIN']};
    next();
  });
  app.use('/api/admin/connections',createConnectionsRouter(db,{contactEncryptionKey:KEY}));
  app.use(errorMiddleware);
  return listen(t,app);
}

test('Connection CMS keeps reviewer out, audits contact access, and reserves triage writes for editor',async(t)=>{
  const db=adminDb();
  const base=await adminServer(t,db);

  const blocked=await fetch(base+'/api/admin/connections',{headers:{'x-test-role':'TECHNICAL_REVIEWER'}});
  assert.equal(blocked.status,403);

  const detail=await fetch(base+'/api/admin/connections/'+ID,{headers:{'x-test-role':'ADMIN'}});
  assert.equal(detail.status,200);
  const detailBody=await detail.json();
  assert.equal(detailBody.data.privateContact,'editor-contact@example.test');
  assert.ok(!Object.hasOwn(detailBody.data,'contact_ciphertext'));
  assert.ok(db.calls.some(call=>call.sql.includes('INSERT INTO conspace.audit_logs')&&call.params.includes('PRIVATE_CONTACT_ACCESSED')));

  const adminPatch=await fetch(base+'/api/admin/connections/'+ID,{
    method:'PATCH',headers:{'content-type':'application/json','x-test-role':'ADMIN'},
    body:JSON.stringify({status:'IN_REVIEW',moderationNote:'Đã tiếp nhận thủ công'}),
  });
  assert.equal(adminPatch.status,403);

  const editorPatch=await fetch(base+'/api/admin/connections/'+ID,{
    method:'PATCH',headers:{'content-type':'application/json','x-test-role':'EDITOR'},
    body:JSON.stringify({status:'IN_REVIEW',moderationNote:'Đã tiếp nhận thủ công'}),
  });
  assert.equal(editorPatch.status,200);
});
