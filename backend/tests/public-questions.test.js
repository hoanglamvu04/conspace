import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createPublicQuestionsRouter } from '../src/routes/public-questions.js';
import { errorMiddleware } from '../src/http/validation.js';

async function serverFor(t,db,mediaService){
  const app=express();
  app.use(express.json({limit:'35mb'}));
  app.use('/api/v1/questions',createPublicQuestionsRouter(db,mediaService));
  app.use(errorMiddleware);
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return 'http://127.0.0.1:'+server.address().port;
}

function dbMock(){
  const calls=[];
  const client={
    query:async(sql,params=[])=>{
      calls.push({sql,params});
      if(sql.includes('INSERT INTO conspace.reader_questions')){
        return {rows:[{id:'11111111-1111-4111-8111-111111111111',status:'SUBMITTED',createdAt:'2026-11-12T00:00:00Z'}]};
      }
      return {rows:[],rowCount:1};
    },
    release(){},
  };
  return {calls,connect:async()=>client,query:client.query};
}

test('anonymous Q&A intake never retains optional phone without opt-in',async(t)=>{
  const db=dbMock();
  const base=await serverFor(t,db,{save:async()=>{throw Error('unexpected upload');},cleanup:async()=>{}});
  const res=await fetch(base+'/api/v1/questions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
    description:'Tường bị nứt sau khi sơn. Tôi cần kiểm tra ở đâu?',
    requestPrivateReply:'false',
    phone:'0900000000',
  })});
  assert.equal(res.status,201);
  const body=await res.json();
  assert.equal(body.data.status,'SUBMITTED');
  assert.ok(!JSON.stringify(body).includes('0900000000'));
  const insert=db.calls.find(c=>c.sql.includes('INSERT INTO conspace.reader_questions'));
  assert.equal(insert.params[2],false);
  assert.equal(insert.params[3],null);
  assert.equal(insert.params[4],null);
  assert.equal(insert.params[5],null);
});

test('private contact fails closed when encryption is not configured',async(t)=>{
  const base=await serverFor(t,dbMock(),{save:async()=>{},cleanup:async()=>{}});
  const res=await fetch(base+'/api/v1/questions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
    description:'Tường bị nứt sau khi sơn. Tôi muốn được trả lời riêng.',
    requestPrivateReply:'true',
    phone:'0900000000',
  })});
  assert.equal(res.status,503);
  assert.equal((await res.json()).error.code,'PRIVATE_REPLY_UNAVAILABLE');
});

test('public question image limit and media validation are enforced',async(t)=>{
  const base=await serverFor(t,dbMock(),{save:async()=>({id:'1'}),cleanup:async()=>{}});
  const image={filename:'test.png',mimeType:'image/png',data:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')};
  const res=await fetch(base+'/api/v1/questions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
    description:'Tường bị nứt sau khi sơn. Tôi cần kiểm tra ở đâu?',
    images:Array.from({length:6},()=>image),
  })});
  assert.equal(res.status,400);
});

test('public questions list filters to published question AND published answer',async(t)=>{
  const db=dbMock();
  const base=await serverFor(t,db,{save:async()=>{},cleanup:async()=>{}});
  const res=await fetch(base+'/api/v1/questions');
  assert.equal(res.status,200);
  const query=db.calls.find(c=>c.sql.includes('FROM conspace.reader_questions q JOIN conspace.question_answers'));
  assert.match(query.sql,/q\.status='PUBLISHED'/);
  assert.match(query.sql,/a\.status='PUBLISHED'/);
});

test('public Q&A paging provides a real total, deterministic order and only published records',async(t)=>{
  const calls=[];
  const record={id:'22222222-2222-4222-8222-222222222222',description:'Câu hỏi đã xuất bản',answer:'Đã duyệt'};
  const db={query:async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.startsWith('SELECT count('))return {rows:[{total:35}]};
    return {rows:[record]};
  }};
  const base=await serverFor(t,db,{save:async()=>{},cleanup:async()=>{}});
  const response=await fetch(base+'/api/v1/questions?page=2&limit=10');
  assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual(body.data,[record]);
  assert.deepEqual(body.meta,{total:35,page:2,limit:10,hasMore:true});
  const list=calls.find(c=>c.sql.includes('LIMIT $1 OFFSET $2'));
  assert.deepEqual(list?.params,[10,10]);
  assert.match(list.sql,/ORDER BY a\.published_at DESC,q\.id DESC/);
  for(const c of calls){
    assert.match(c.sql,/q\.status='PUBLISHED'/);
    assert.match(c.sql,/a\.status='PUBLISHED'/);
    assert.match(c.sql,/a\.approved_by_user_id IS NOT NULL/);
    assert.match(c.sql,/a\.approved_at IS NOT NULL/);
    assert.match(c.sql,/a\.published_at<=now\(\)/);
  }
});

test('public Q&A rejects invalid and unexpected paging arguments',async(t)=>{
  const db=dbMock();
  const base=await serverFor(t,db,{save:async()=>{},cleanup:async()=>{}});
  for(const query of ['page=0','page=1001','limit=0','limit=51','page=1&admin=true']){
    const response=await fetch(base+'/api/v1/questions?'+query);
    assert.equal(response.status,400,query);
    assert.equal((await response.json()).error.code,'VALIDATION_ERROR');
  }
  assert.equal(db.calls.length,0);
});
