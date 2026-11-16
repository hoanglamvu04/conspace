import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createAuthorsRouter } from '../src/routes/admin/authors.js';
import { errorMiddleware } from '../src/http/validation.js';

const authorId='11111111-1111-4111-8111-111111111111';
const actorId='22222222-2222-4222-8222-222222222222';

async function serverFor(t,db){
  const app=express();
  app.use(express.json());
  app.use((req,_res,next)=>{
    const role=req.get('x-test-role')||'EDITOR';
    req.auth={id:actorId,role,roles:[role]};
    next();
  });
  app.use('/api/admin/authors',createAuthorsRouter(db));
  app.use(errorMiddleware);
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return 'http://127.0.0.1:'+server.address().port;
}

function mockDb(){
  const calls=[];
  const client={
    query:async(sql,params=[])=>{
      calls.push({sql,params});
      if(sql.startsWith('SELECT * FROM conspace.authors WHERE id='))return {rows:[{
        id:authorId,slug:'tac-gia',display_name:'Tác giả',bio:'Bio',verified:false,active:true,
      }]};
      if(sql.startsWith('UPDATE conspace.authors SET'))return {rows:[{
        id:authorId,slug:'tac-gia',displayName:'Tác giả',bio:null,verified:true,active:true,userId:null,
      }]};
      if(sql.startsWith('INSERT INTO conspace.authors'))return {rows:[{
        id:authorId,slug:params[0],displayName:params[1],bio:params[2],verified:false,active:true,
      }]};
      if(sql.startsWith('SELECT a.id,a.slug'))return {rows:[{
        id:authorId,slug:'tac-gia',displayName:'Tác giả',bio:'Bio',verified:false,active:true,
        userId:null,accountEmail:null,articleCount:2,publishedCount:1,
      }]};
      return {rows:[],rowCount:1};
    },
    release(){},
  };
  return {calls,query:client.query,connect:async()=>client};
}

test('author RBAC lets ADMIN verify but not edit profile fields',async(t)=>{
  const db=mockDb();
  const base=await serverFor(t,db);

  const list=await fetch(base+'/api/admin/authors',{headers:{'x-test-role':'ADMIN'}});
  assert.equal(list.status,200);
  assert.equal((await list.json()).data[0].articleCount,2);

  const verify=await fetch(base+'/api/admin/authors/'+authorId,{
    method:'PATCH',headers:{'content-type':'application/json','x-test-role':'ADMIN'},
    body:JSON.stringify({verified:true}),
  });
  assert.equal(verify.status,200);

  const edit=await fetch(base+'/api/admin/authors/'+authorId,{
    method:'PATCH',headers:{'content-type':'application/json','x-test-role':'ADMIN'},
    body:JSON.stringify({displayName:'Không được sửa'}),
  });
  assert.equal(edit.status,403);
});

test('editor can create/edit profile but cannot set verification and can clear bio',async(t)=>{
  const db=mockDb();
  const base=await serverFor(t,db);

  const created=await fetch(base+'/api/admin/authors',{
    method:'POST',headers:{'content-type':'application/json','x-test-role':'EDITOR'},
    body:JSON.stringify({slug:'tac-gia-moi',displayName:'Tác giả mới',bio:'Bio'}),
  });
  assert.equal(created.status,201);

  const update=await fetch(base+'/api/admin/authors/'+authorId,{
    method:'PATCH',headers:{'content-type':'application/json','x-test-role':'EDITOR'},
    body:JSON.stringify({bio:null,active:true}),
  });
  assert.equal(update.status,200);
  const updateCall=db.calls.find(call=>call.sql.includes('bio=CASE WHEN $4::boolean'));
  assert.ok(updateCall);
  assert.equal(updateCall.params[3],true);
  assert.equal(updateCall.params[4],null);

  const verify=await fetch(base+'/api/admin/authors/'+authorId,{
    method:'PATCH',headers:{'content-type':'application/json','x-test-role':'EDITOR'},
    body:JSON.stringify({verified:true}),
  });
  assert.equal(verify.status,403);

  const reviewer=await fetch(base+'/api/admin/authors',{headers:{'x-test-role':'TECHNICAL_REVIEWER'}});
  assert.equal(reviewer.status,403);
});
