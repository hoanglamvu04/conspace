import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createPublishingRouter } from '../src/routes/publishing.js';
import { createPublicSearchRouter } from '../src/routes/search.js';
import { createEditorialService } from '../src/services/editorial.js';
import { errorMiddleware } from '../src/http/validation.js';

const id='11111111-1111-4111-8111-111111111111';

async function serverFor(t,mount,router){
  const app=express();
  app.use(mount,router);
  app.use(errorMiddleware);
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return 'http://127.0.0.1:'+server.address().port;
}

test('homepage feed uses four database-driven published-only queries',async(t)=>{
  const queries=[];
  const db={query:async(sql,params=[])=>{queries.push({sql,params});return {rows:[]};}};
  const base=await serverFor(t,'/api/v1',createPublishingRouter(db));
  const response=await fetch(base+'/api/v1/feed?limit=4');
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).data,{books:[],articles:[],fieldNotes:[],questions:[]});
  assert.equal(queries.length,4);
  assert.equal(queries.every(q=>q.params[0]===4),true);
  assert.equal(queries.slice(0,3).every(q=>q.sql.includes("a.status='PUBLISHED'")&&q.sql.includes('a.approved_by IS NOT NULL')),true);
  assert.ok(queries[3].sql.includes("qa.status='PUBLISHED'"));
});

test('book chapters hide unpublished body and return 404',async(t)=>{
  const db={query:async()=>({rows:[]})};
  const base=await serverFor(t,'/api/v1',createPublishingRouter(db));
  const response=await fetch(base+'/api/v1/books/cam-nang-kien-truc-hoa-lac/chapters/9');
  assert.equal(response.status,404);
  assert.equal((await response.json()).error.code,'NOT_FOUND');
});

test('published book chapter exposes navigation only to other published chapters',async(t)=>{
  const sqls=[];
  const db={query:async(sql,params)=>{
    sqls.push(sql);
    if(sql.includes('SELECT b.id AS "bookId"'))return {rows:[{
      bookId:id,bookSlug:'cam-nang-kien-truc-hoa-lac',chapterNo:2,
      contentLabel:'REFERENCE',contentLabelVi:'Tài liệu tra cứu',body:'Real body',
    }]};
    if(sql.includes('SELECT bc.chapter_no AS "chapterNo"'))return {rows:[
      {chapterNo:1,displayLabel:'Phần 1'},
      {chapterNo:2,displayLabel:'Phần 2'},
      {chapterNo:4,displayLabel:'Phần 4'},
    ]};
    return {rows:[]};
  }};
  const base=await serverFor(t,'/api/v1',createPublishingRouter(db));
  const response=await fetch(base+'/api/v1/books/cam-nang-kien-truc-hoa-lac/chapters/2');
  assert.equal(response.status,200);
  const chapter=(await response.json()).data;
  assert.equal(chapter.body,'Real body');
  assert.equal(chapter.contentLabel,'REFERENCE');
  assert.equal(chapter.previous.chapterNo,1);
  assert.equal(chapter.next.chapterNo,4);
  assert.ok(sqls.every(sql=>sql.includes("a.status='PUBLISHED'")));
});

test('niche detail preserves 12 empty blocks and never fills gaps with fake content',async(t)=>{
  const db={query:async(sql)=>{
    if(sql.includes('FROM conspace.niches n LEFT JOIN'))return {rows:[{
      id,slug:'house',name:'HOUSE',group:'construction',templateType:'TEMPLATE_A',expectedSectionCount:12,summary:'',
    }]};
    if(sql.includes('FROM conspace.niche_template_blocks b'))return {rows:[
      {sectionNo:1,blockKey:'scope',title:'Ngách này làm gì',sharedContent:null,audienceRole:'homeowner',content:null},
      {sectionNo:1,blockKey:'scope',title:'Ngách này làm gì',sharedContent:null,audienceRole:'contractor',content:null},
      {sectionNo:2,blockKey:'sequence',title:'Trình tự',sharedContent:null,audienceRole:'architect',content:'Real published section'},
    ]};
    return {rows:[]};
  }};
  const base=await serverFor(t,'/api/v1',createPublishingRouter(db));
  const response=await fetch(base+'/api/v1/niches/house?role=architect');
  assert.equal(response.status,200);
  const data=(await response.json()).data;
  assert.equal(data.sections.length,12);
  assert.equal(data.templateType,'TEMPLATE_A');
  assert.deepEqual(data.sections[0].layers.map(x=>x.audienceRole).sort(),['contractor','homeowner']);
  assert.equal(data.sections[1].layers[0].content,'Real published section');
  assert.equal(data.preferredAudienceRole,'architect');
  assert.deepEqual(data.articles,[]);
  assert.equal(data.lens,'architect');
});

test('PostgreSQL public search uses published-only checks for all private entities',async(t)=>{
  const queries=[];
  const db={query:async(sql,params=[])=>{
    queries.push({sql,params});
    if(sql.startsWith('SELECT count'))return {rows:[{total:0}]};
    return {rows:[]};
  }};
  const base=await serverFor(t,'/api/v1/search',createPublicSearchRouter(db));
  const response=await fetch(base+'/api/v1/search?q=bao%20hanh&type=all&limit=7&page=2&role=homeowner');
  assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual(body.data,[]);
  assert.equal(body.meta.total,0);
  assert.equal(queries.length,2);
  assert.ok(queries[0].sql.includes("a.status='PUBLISHED'"));
  assert.ok(queries[0].sql.includes("t.status='PUBLISHED'"));
  assert.ok(queries[0].sql.includes("f.unit_anonymized=true"));
  assert.equal(queries[0].params[2],'homeowner');
  assert.ok(queries[0].sql.includes('CASE WHEN $3::text IS NOT NULL AND a.audience_role=$3 THEN 0 ELSE 1 END'));
  assert.ok(!queries[0].sql.includes('AND ($3::text IS NULL OR a.audience_role=$3'));
  assert.equal(queries[0].params[4],7);
  assert.equal(queries[0].params[5],7);
});

test('publishing scheduler commits only due, reviewed articles and writes an audit event',async()=>{
  const calls=[];
  const due={id,slug:'real-article',content_type:'EDITORIAL',status:'SCHEDULED',
    approved_by:id,approved_at:new Date('2026-11-11')};
  const client={
    query:async(sql,params=[])=>{
      calls.push({sql,params});
      if(sql.startsWith('SELECT * FROM conspace.articles WHERE status='))return {rows:[due]};
      if(sql.startsWith('SELECT count(*)::integer AS total FROM conspace.article_media'))return {rows:[{total:0}]};
      return {rows:[],rowCount:1};
    },
    release(){},
  };
  const db={connect:async()=>client};
  const total=await createEditorialService(db).publishDueArticles();
  assert.equal(total,1);
  assert.ok(calls.some(c=>c.sql.includes("SET status='PUBLISHED',published_at=now()")));
  assert.ok(calls.some(c=>c.params?.includes("SYSTEM_AUTO_PUBLISH")));
  assert.equal(calls.at(-1).sql,'COMMIT');
});


test('Template B returns seven shared blocks and no invented perspective layers',async(t)=>{
 const db={query:async(sql)=>{
  if(sql.includes('FROM conspace.niches n LEFT JOIN'))return {rows:[{id,slug:'house',name:'HOUSE',group:'design',templateType:'TEMPLATE_B',expectedSectionCount:7}]};
  if(sql.includes('FROM conspace.architectural_template_blocks b'))return {rows:Array.from({length:7},(_,i)=>({sectionNo:i+1,blockKey:'block-'+(i+1),title:'Template block '+(i+1),content:i===1?'Sourced block':null,sourceRef:i===1?'IA v1.0':null}))};
  return {rows:[]};
 }};
 const base=await serverFor(t,'/api/v1',createPublishingRouter(db));
 const response=await fetch(base+'/api/v1/niches/house?role=contractor');
 assert.equal(response.status,200);
 const data=(await response.json()).data;
 assert.equal(data.templateType,'TEMPLATE_B');assert.equal(data.sections.length,7);
 assert.equal(data.sections[0].content,null);assert.deepEqual(data.sections[0].layers,[]);
 assert.equal(data.sections[1].content,'Sourced block');assert.equal(data.preferredAudienceRole,'contractor');
});

test('homepage and books rank the selected audience without filtering other roles',async(t)=>{
 const calls=[],db={query:async(sql,params=[])=>{calls.push({sql,params});return {rows:[]};}};
 const base=await serverFor(t,'/api/v1',createPublishingRouter(db));
 const feed=await fetch(base+'/api/v1/feed?role=architect&limit=5');
 assert.equal(feed.status,200);assert.equal((await feed.json()).meta.preferredAudienceRole,'architect');
 assert.ok(calls.slice(0,3).every(q=>q.params[1]==='architect'));
 assert.ok(calls[0].sql.includes('CASE WHEN $2::text IS NOT NULL AND b.audience_role=$2'));
 assert.ok(calls[1].sql.includes('CASE WHEN $2::text IS NOT NULL AND a.audience_role=$2'));
 const books=await fetch(base+'/api/v1/books?role=contractor');
 assert.equal(books.status,200);assert.equal((await books.json()).meta.preferredAudienceRole,'contractor');
 assert.equal(calls[4].params[0],'contractor');
});

test('field-note list ranks selected perspective and keeps other published cases',async(t)=>{
 const calls=[],db={query:async(sql,params=[])=>{calls.push({sql,params});return {rows:sql.startsWith('SELECT count')?[{total:0}]:[]};}};
 const base=await serverFor(t,'/api/v1',createPublishingRouter(db));
 const response=await fetch(base+'/api/v1/field-notes?role=architect&limit=5');
 assert.equal(response.status,200);assert.equal((await response.json()).meta.preferredAudienceRole,'architect');
 assert.equal(calls[0].params[1],'architect');
 assert.ok(calls[0].sql.includes('CASE WHEN $2::text IS NOT NULL AND a.audience_role=$2'));
});
