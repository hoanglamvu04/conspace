import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { RequestError, validate } from '../../http/validation.js';
import { asyncHandler, requireRoles } from '../../middleware/admin-auth.js';
import { createEditorialService } from '../../services/editorial.js';
import { inTransaction, writeAudit, writeWorkflowEvent } from '../../services/audit.js';

const uuid=z.string().uuid();
const decisionSchema=z.strictObject({
  stage:z.enum(['TECHNICAL','EDITOR_IN_CHIEF']),
  decision:z.enum(['APPROVED','REQUEST_CHANGES','REJECTED']),
  reason:z.string().trim().min(3).max(1000),
});

async function reviewerAuthor(client,user){
  const current=await client.query('SELECT id FROM conspace.authors WHERE user_id=$1',[user.id]);
  if(current.rows[0]) return current.rows[0].id;
  const inserted=await client.query(
    'INSERT INTO conspace.authors (slug,display_name,user_id) VALUES ($1,$2,$3) RETURNING id',
    ['staff-'+user.id.replaceAll('-',''),user.displayName,user.id]
  );
  return inserted.rows[0].id;
}

export function createReviewsRouter(db=pool,editorial=createEditorialService(db)){
  const router=Router();
  router.use(requireRoles('ADMIN','TECHNICAL_REVIEWER','EDITOR_IN_CHIEF'));

  router.get('/queue',asyncHandler(async(req,res)=>{
    const stage=validate(z.strictObject({stage:z.enum(['TECHNICAL','EDITOR_IN_CHIEF']).default('TECHNICAL')}),req.query).stage;
    const statuses=stage==='TECHNICAL'?['SUBMITTED','TECHNICAL_REVIEW']:['EDITOR_IN_CHIEF_REVIEW'];
    const articles=await db.query(
      'SELECT id,slug,title,status,requires_chief_review AS "requiresChiefReview",sensitivity_flags AS "sensitivityFlags",submitted_at AS "submittedAt",\'ARTICLE\' AS "entityType" '+
      'FROM conspace.articles WHERE status=ANY($1::text[]) ORDER BY submitted_at ASC NULLS LAST',
      [statuses]
    );
    const terms=stage==='TECHNICAL'?await db.query(
      "SELECT id,term AS title,status,submitted_at AS \"submittedAt\",'TERM' AS \"entityType\" FROM conspace.terms WHERE status=ANY($1::text[]) ORDER BY submitted_at ASC NULLS LAST",
      [statuses]
    ): {rows:[]};
    const answers=await db.query(
      'SELECT id,question_id AS "questionId",status,requires_chief_review AS "requiresChiefReview",created_at AS "submittedAt",\'QUESTION_ANSWER\' AS "entityType" '+
      'FROM conspace.question_answers WHERE status=$1 ORDER BY created_at ASC',
      [stage==='TECHNICAL'?'TECHNICAL_REVIEW':'EDITOR_IN_CHIEF_REVIEW']
    );
    res.json({ok:true,data:{articles:articles.rows,terms:terms.rows,answers:answers.rows}});
  }));

  router.post('/articles/:id/start',requireRoles('ADMIN','TECHNICAL_REVIEWER'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const data=await editorial.startArticleReview(req.auth,id,'TECHNICAL',req);
    res.json({ok:true,data});
  }));

  router.post('/articles/:id/decision',asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const input=validate(decisionSchema,req.body);
    const data=await editorial.decideArticle(req.auth,id,input,req);
    res.json({ok:true,data});
  }));

  router.post('/terms/:id/start',requireRoles('ADMIN','TECHNICAL_REVIEWER'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.terms WHERE id=$1 FOR UPDATE',[id]);
      const term=current.rows[0];
      if(!term) throw new RequestError(404,'NOT_FOUND','Term not found');
      if(term.status!=='SUBMITTED') throw new RequestError(409,'INVALID_STATE','Term is not waiting for technical review');
      if(term.created_by_user_id===req.auth.id) throw new RequestError(403,'AUTHOR_CANNOT_REVIEW','The term author cannot review their own term');
      const updated=await client.query("UPDATE conspace.terms SET status='TECHNICAL_REVIEW',updated_by_user_id=$2,updated_at=now() WHERE id=$1 RETURNING *",[id,req.auth.id]);
      await writeWorkflowEvent(client,{entityType:'TERM',entityId:id,fromStatus:'SUBMITTED',toStatus:'TECHNICAL_REVIEW',action:'REVIEW_STARTED',actorUserId:req.auth.id});
      await writeAudit(client,{actorUserId:req.auth.id,action:'TERM_REVIEW_STARTED',entityType:'TERM',entityId:id,before:{status:'SUBMITTED'},after:{status:'TECHNICAL_REVIEW'},req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  router.post('/terms/:id/decision',requireRoles('ADMIN','TECHNICAL_REVIEWER'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const input=validate(z.strictObject({
      decision:z.enum(['APPROVED','REQUEST_CHANGES','REJECTED']),
      reason:z.string().trim().min(3).max(1000),
    }),req.body);
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.terms WHERE id=$1 FOR UPDATE',[id]);
      const term=current.rows[0];
      if(!term) throw new RequestError(404,'NOT_FOUND','Term not found');
      if(term.status!=='TECHNICAL_REVIEW') throw new RequestError(409,'INVALID_STATE','Term is not in technical review');
      if(term.created_by_user_id===req.auth.id) throw new RequestError(403,'AUTHOR_CANNOT_APPROVE','Authors cannot approve their own terms');
      const next=input.decision==='APPROVED'?'APPROVED':input.decision==='REQUEST_CHANGES'?'NEEDS_CHANGES':'REJECTED';
      const authorId=input.decision==='APPROVED'?await reviewerAuthor(client,req.auth):null;
      const updated=await client.query(
        'UPDATE conspace.terms SET status=$2,reviewed_by=CASE WHEN $3::uuid IS NULL THEN reviewed_by ELSE $3 END,'+
        'reviewed_at=CASE WHEN $3::uuid IS NULL THEN reviewed_at ELSE now() END,'+
        'approved_by_user_id=CASE WHEN $3::uuid IS NULL THEN approved_by_user_id ELSE $4 END,'+
        'approved_at=CASE WHEN $3::uuid IS NULL THEN approved_at ELSE now() END,'+
        'updated_by_user_id=$4,updated_at=now() WHERE id=$1 RETURNING *',
        [id,next,authorId,req.auth.id]
      );
      await client.query(
        'INSERT INTO conspace.editorial_reviews (entity_type,entity_id,stage,decision,reason,reviewer_user_id) VALUES (\'TERM\',$1,\'TECHNICAL\',$2,$3,$4)',
        [id,input.decision,input.reason,req.auth.id]
      );
      await writeWorkflowEvent(client,{entityType:'TERM',entityId:id,fromStatus:'TECHNICAL_REVIEW',toStatus:next,action:input.decision,reason:input.reason,actorUserId:req.auth.id});
      await writeAudit(client,{actorUserId:req.auth.id,action:'TERM_REVIEW_DECIDED',entityType:'TERM',entityId:id,before:{status:term.status},after:{status:next,decision:input.decision},req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  router.post('/question-answers/:id/decision',asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const input=validate(decisionSchema,req.body);
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.question_answers WHERE id=$1 FOR UPDATE',[id]);
      const answer=current.rows[0];
      if(!answer) throw new RequestError(404,'NOT_FOUND','Question answer not found');
      const technical=input.stage==='TECHNICAL';
      const allowed=req.auth.role==='ADMIN' || (technical?req.auth.role==='TECHNICAL_REVIEWER':req.auth.role==='EDITOR_IN_CHIEF');
      if(!allowed) throw new RequestError(403,'FORBIDDEN','Reviewer role required');
      const expected=technical?'TECHNICAL_REVIEW':'EDITOR_IN_CHIEF_REVIEW';
      if(answer.status!==expected) throw new RequestError(409,'INVALID_STATE','Answer is not at this review stage');
      if(answer.created_by_user_id===req.auth.id) throw new RequestError(403,'AUTHOR_CANNOT_APPROVE','Authors cannot approve their own answers');
      let next;
      if(input.decision==='APPROVED') next=technical && answer.requires_chief_review?'EDITOR_IN_CHIEF_REVIEW':'APPROVED';
      else next=input.decision==='REQUEST_CHANGES'?'NEEDS_CHANGES':'REJECTED';
      const updated=await client.query(
        'UPDATE conspace.question_answers SET status=$2,approved_by_user_id=CASE WHEN $3 THEN $4 ELSE approved_by_user_id END,'+
        'approved_at=CASE WHEN $3 THEN now() ELSE approved_at END,updated_at=now() WHERE id=$1 RETURNING *',
        [id,next,input.decision==='APPROVED' && next==='APPROVED',req.auth.id]
      );
      await client.query(
        'INSERT INTO conspace.editorial_reviews (entity_type,entity_id,stage,decision,reason,reviewer_user_id) VALUES (\'QUESTION_ANSWER\',$1,$2,$3,$4,$5)',
        [id,input.stage,input.decision,input.reason,req.auth.id]
      );
      await writeWorkflowEvent(client,{entityType:'QUESTION_ANSWER',entityId:id,fromStatus:answer.status,toStatus:next,action:input.decision,reason:input.reason,actorUserId:req.auth.id,metadata:{stage:input.stage}});
      await writeAudit(client,{actorUserId:req.auth.id,action:'QUESTION_ANSWER_REVIEW_DECIDED',entityType:'QUESTION_ANSWER',entityId:id,before:{status:answer.status},after:{status:next,decision:input.decision},req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  return router;
}
