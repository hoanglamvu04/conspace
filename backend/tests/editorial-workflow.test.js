import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createEditorialService } from '../src/services/editorial.js';
import { createArticlesRouter } from '../src/routes/admin/articles.js';
import { errorMiddleware } from '../src/http/validation.js';

const articleId='11111111-1111-4111-8111-111111111111';
const authorId='22222222-2222-4222-8222-222222222222';
const creatorId='33333333-3333-4333-8333-333333333333';
const actorId='44444444-4444-4444-8444-444444444444';

function workflowDb(article,authorUserId=creatorId){
  const calls=[];
  const client={
    query:async(sql,params=[])=>{
      calls.push({sql,params});
      if(sql.startsWith('SELECT * FROM conspace.articles')) return {rows:[article]};
      if(sql.startsWith('SELECT user_id FROM conspace.authors')) return {rows:[{user_id:authorUserId}]};
      if(sql.startsWith('SELECT id FROM conspace.authors WHERE user_id')) return {rows:[]};
      if(sql.startsWith('INSERT INTO conspace.authors')) return {rows:[{id:authorId}]};
      if(sql.startsWith('UPDATE conspace.articles SET status=$2')) return {rows:[{...article,status:params[1]}]};
      if(sql.startsWith('UPDATE conspace.articles SET status=$2,approved_by')) return {rows:[{...article,status:params[1],approved_by:params[2]}]};
      return {rows:[],rowCount:1};
    },
    release(){},
  };
  return {calls,connect:async()=>client};
}

test('author cannot approve their own article even if they have reviewer role',async()=>{
  const article={id:articleId,status:'TECHNICAL_REVIEW',created_by_user_id:actorId,author_id:authorId,requires_chief_review:false};
  const db=workflowDb(article);
  const service=createEditorialService(db);
  await assert.rejects(service.decideArticle(
    {id:actorId,role:'TECHNICAL_REVIEWER',displayName:'Author'},
    articleId,{stage:'TECHNICAL',decision:'APPROVED',reason:'Reviewed'},
  ),{status:403,code:'AUTHOR_CANNOT_APPROVE'});
  assert.ok(db.calls.some((call)=>call.sql==='ROLLBACK'));
  assert.ok(!db.calls.some((call)=>call.sql.startsWith('INSERT INTO conspace.editorial_reviews')));
});

test('technical approval routes sensitive articles to editor-in-chief review',async()=>{
  const article={id:articleId,status:'TECHNICAL_REVIEW',created_by_user_id:creatorId,author_id:authorId,requires_chief_review:true};
  const db=workflowDb(article);
  const service=createEditorialService(db);
  const result=await service.decideArticle(
    {id:actorId,role:'TECHNICAL_REVIEWER',displayName:'Reviewer'},
    articleId,{stage:'TECHNICAL',decision:'APPROVED',reason:'Technical review complete'},
  );
  assert.equal(result.status,'EDITOR_IN_CHIEF_REVIEW');
  assert.ok(db.calls.some((call)=>call.sql.includes('INSERT INTO conspace.editorial_reviews')));
  assert.ok(db.calls.some((call)=>call.sql.includes('INSERT INTO conspace.workflow_events')));
});

test('technical approval of non-sensitive article reaches APPROVED with reviewer author identity',async()=>{
  const article={id:articleId,status:'TECHNICAL_REVIEW',created_by_user_id:creatorId,author_id:authorId,requires_chief_review:false};
  const db=workflowDb(article);
  const service=createEditorialService(db);
  const result=await service.decideArticle(
    {id:actorId,role:'TECHNICAL_REVIEWER',displayName:'Reviewer'},
    articleId,{stage:'TECHNICAL',decision:'APPROVED',reason:'Sources and calculations checked'},
  );
  assert.equal(result.status,'APPROVED');
  const update=db.calls.find((call)=>call.sql.startsWith('UPDATE conspace.articles SET status=$2,approved_by'));
  assert.equal(update.params[2],authorId);
});

test('editor must explicitly assess sensitivity before submitting an article',async()=>{
  const article={id:articleId,status:'DRAFT',sensitivity_assessed:false,content_type:'EDITORIAL'};
  const db=workflowDb(article);
  const service=createEditorialService(db);
  await assert.rejects(service.submitArticle(
    {id:actorId,role:'EDITOR',displayName:'Editor'},articleId,
  ),{status:409,code:'SENSITIVITY_ASSESSMENT_REQUIRED'});
  assert.ok(db.calls.some((call)=>call.sql==='ROLLBACK'));
});

async function start(t,app){
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>new Promise((resolve)=>server.close(resolve)));
  return 'http://127.0.0.1:'+server.address().port;
}

test('admin article API enforces role permissions for creation and publication',async(t)=>{
  const editorial={
    createArticle:async(_actor,input)=>({id:articleId,slug:input.slug,status:'DRAFT'}),
    publishArticle:async()=>({id:articleId,status:'PUBLISHED'}),
  };
  const app=express();
  app.use(express.json());
  app.use((req,_res,next)=>{req.auth={id:actorId,role:req.get('x-role')||'GUEST',displayName:'Test'};next();});
  app.use('/api/admin/articles',createArticlesRouter({query:async()=>({rows:[]})},editorial));
  app.use(errorMiddleware);
  const base=await start(t,app);
  const body={slug:'field-case-1',title:'A documented case',sensitivityAssessed:true};
  const denied=await fetch(base+'/api/admin/articles',{method:'POST',headers:{'content-type':'application/json','x-role':'TECHNICAL_REVIEWER'},body:JSON.stringify(body)});
  assert.equal(denied.status,403);
  const created=await fetch(base+'/api/admin/articles',{method:'POST',headers:{'content-type':'application/json','x-role':'EDITOR'},body:JSON.stringify(body)});
  assert.equal(created.status,201);
  const editorPublish=await fetch(base+'/api/admin/articles/'+articleId+'/publish',{method:'POST',headers:{'x-role':'EDITOR'}});
  assert.equal(editorPublish.status,403);
  const chiefPublish=await fetch(base+'/api/admin/articles/'+articleId+'/publish',{method:'POST',headers:{'x-role':'EDITOR_IN_CHIEF'}});
  assert.equal(chiefPublish.status,200);
});
