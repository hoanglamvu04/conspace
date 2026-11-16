import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createChaptersRouter } from '../src/routes/admin/books.js';
import { errorMiddleware } from '../src/http/validation.js';

const chapterId='11111111-1111-4111-8111-111111111111';
const bookId='22222222-2222-4222-8222-222222222222';
const articleId='33333333-3333-4333-8333-333333333333';
const actorId='44444444-4444-4444-8444-444444444444';

async function serverFor(t,db){
  const app=express();
  app.use(express.json());
  app.use((req,_res,next)=>{req.auth={id:actorId,role:'EDITOR',roles:['EDITOR']};next();});
  app.use('/api/admin/chapters',createChaptersRouter(db));
  app.use(errorMiddleware);
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return 'http://127.0.0.1:'+server.address().port;
}

function transactionalDb({linked=true}={}){
  const calls=[];
  const client={
    query:async(sql,params=[])=>{
      calls.push({sql,params});
      if(sql.startsWith('SELECT * FROM conspace.book_chapters WHERE id=')) return {rows:[{
        id:chapterId,book_id:bookId,article_id:linked?articleId:null,status:null,
      }]};
      if(sql.startsWith('UPDATE conspace.book_chapters SET')) return {rows:[{
        id:chapterId,book_id:bookId,article_id:null,scheduled_at:null,title:null,
      }]};
      if(sql.startsWith('DELETE FROM conspace.book_chapters')) return {rows:[],rowCount:1};
      return {rows:[],rowCount:1};
    },
    release(){},
  };
  return {calls,connect:async()=>client,query:client.query};
}

test('chapter PATCH can explicitly detach article and clear schedule/title',async(t)=>{
  const db=transactionalDb({linked:true});
  const base=await serverFor(t,db);
  const response=await fetch(base+'/api/admin/chapters/'+chapterId,{
    method:'PATCH',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({articleId:null,scheduledAt:null,title:null}),
  });
  assert.equal(response.status,200);
  const update=db.calls.find(call=>call.sql.startsWith('UPDATE conspace.book_chapters SET'));
  assert.ok(update);
  assert.ok(update.sql.includes('article_id=CASE WHEN $4::boolean THEN $5::uuid ELSE article_id END'));
  assert.ok(update.sql.includes('scheduled_at=CASE WHEN $6::boolean THEN $7::timestamptz ELSE scheduled_at END'));
  assert.deepEqual(update.params.slice(1),[true,null,true,null,true,null]);
});

test('chapter DELETE refuses a linked article and allows an empty slot',async(t)=>{
  const linked=transactionalDb({linked:true});
  let base=await serverFor(t,linked);
  let response=await fetch(base+'/api/admin/chapters/'+chapterId,{method:'DELETE'});
  assert.equal(response.status,409);
  assert.equal((await response.json()).error.code,'CHAPTER_HAS_ARTICLE');

  const empty=transactionalDb({linked:false});
  base=await serverFor(t,empty);
  response=await fetch(base+'/api/admin/chapters/'+chapterId,{method:'DELETE'});
  assert.equal(response.status,200);
  assert.ok(empty.calls.some(call=>call.sql.startsWith('DELETE FROM conspace.book_chapters')));
});
