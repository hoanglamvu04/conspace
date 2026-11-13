import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { RequestError, validate } from '../../http/validation.js';
import { asyncHandler, requireRoles } from '../../middleware/admin-auth.js';
import { createEditorialService } from '../../services/editorial.js';
import { inTransaction, writeAudit, writeWorkflowEvent } from '../../services/audit.js';

const uuid=z.string().uuid();
async function assertDifferentPerson(client,authorId,reviewer){
 if(!authorId)return;
 const r=await client.query('SELECT a.person_id AS author_person_id,v.person_id AS reviewer_person_id FROM conspace.cms_users a JOIN conspace.cms_users v ON v.id=$2 WHERE a.id=$1',[authorId,reviewer.id]);
 if(r.rows[0]?.author_person_id===r.rows[0]?.reviewer_person_id)throw new RequestError(403,'AUTHOR_CANNOT_APPROVE','The author and reviewer must be different people');
}
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
  router.use(requireRoles('TECHNICAL_REVIEWER','EDITOR_IN_CHIEF'));

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
    const nicheSections=await db.query(
      'SELECT s.id,s.niche_id AS "nicheId",s.section_no AS "sectionNo",s.audience_role AS "audienceRole",n.name || \' · \' || b.title AS title,s.status,s.submitted_at AS "submittedAt",n.template_key AS "templateType",\'NICHE_SECTION\' AS "entityType" '+
      'FROM conspace.niche_sections s JOIN conspace.niches n ON n.id=s.niche_id JOIN conspace.niche_template_blocks b ON b.section_no=s.section_no WHERE s.status=ANY($1::text[]) '+
      'UNION ALL '+
      'SELECT s.id,s.niche_id AS "nicheId",s.section_no AS "sectionNo",NULL::text AS "audienceRole",n.name || \' · \' || b.title AS title,s.status,s.submitted_at AS "submittedAt",n.template_key AS "templateType",\'NICHE_SECTION\' AS "entityType" '+
      'FROM conspace.architectural_sections s JOIN conspace.niches n ON n.id=s.niche_id JOIN conspace.architectural_template_blocks b ON b.section_no=s.section_no WHERE s.status=ANY($1::text[]) '+
      'ORDER BY "submittedAt" ASC NULLS LAST',
      [statuses]
    );
    res.json({ok:true,data:{articles:articles.rows,terms:terms.rows,answers:answers.rows,nicheSections:nicheSections.rows}});
  }));

  router.post('/articles/:id/start',requireRoles('TECHNICAL_REVIEWER'),asyncHandler(async(req,res)=>{
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

  router.post('/terms/:id/start',requireRoles('TECHNICAL_REVIEWER'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.terms WHERE id=$1 FOR UPDATE',[id]);
      const term=current.rows[0];
      if(!term) throw new RequestError(404,'NOT_FOUND','Term not found');
      if(term.status!=='SUBMITTED') throw new RequestError(409,'INVALID_STATE','Term is not waiting for technical review');
      await assertDifferentPerson(client,term.created_by_user_id,req.auth);
      const updated=await client.query("UPDATE conspace.terms SET status='TECHNICAL_REVIEW',updated_by_user_id=$2,updated_at=now() WHERE id=$1 RETURNING *",[id,req.auth.id]);
      await writeWorkflowEvent(client,{entityType:'TERM',entityId:id,fromStatus:'SUBMITTED',toStatus:'TECHNICAL_REVIEW',action:'REVIEW_STARTED',actorUserId:req.auth.id});
      await writeAudit(client,{actorUserId:req.auth.id,action:'TERM_REVIEW_STARTED',entityType:'TERM',entityId:id,before:{status:'SUBMITTED'},after:{status:'TECHNICAL_REVIEW'},req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  router.post('/terms/:id/decision',requireRoles('TECHNICAL_REVIEWER'),asyncHandler(async(req,res)=>{
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
      await assertDifferentPerson(client,term.created_by_user_id,req.auth);
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
      const assigned=Array.isArray(req.auth.roles)&&req.auth.roles.length?req.auth.roles:[req.auth.role];
      const allowed=technical?assigned.includes('TECHNICAL_REVIEWER'):assigned.includes('EDITOR_IN_CHIEF');
      if(!allowed) throw new RequestError(403,'FORBIDDEN','Reviewer role required');
      const expected=technical?'TECHNICAL_REVIEW':'EDITOR_IN_CHIEF_REVIEW';
      if(answer.status!==expected) throw new RequestError(409,'INVALID_STATE','Answer is not at this review stage');
      await assertDifferentPerson(client,answer.created_by_user_id,req.auth);
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

  const nicheSectionInput=z.strictObject({templateType:z.enum(['TEMPLATE_A','TEMPLATE_B'])});
  router.post('/niche-sections/:id/start',requireRoles('TECHNICAL_REVIEWER'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const {templateType}=validate(nicheSectionInput,req.body);
    const table=templateType==='TEMPLATE_B'?'conspace.architectural_sections':'conspace.niche_sections';
    const result=await inTransaction(db,async(client)=>{
      const found=await client.query('SELECT * FROM '+table+' WHERE id=$1 FOR UPDATE',[id]);
      const section=found.rows[0];if(!section)throw new RequestError(404,'NOT_FOUND','Niche section not found');
      if(!['SUBMITTED','IN_REVIEW'].includes(section.status))throw new RequestError(409,'INVALID_STATE','Section must be submitted before technical review');
      await assertDifferentPerson(client,section.created_by_user_id??section.updated_by_user_id,req.auth);
      const updated=await client.query("UPDATE "+table+" SET status='TECHNICAL_REVIEW',updated_at=now() WHERE id=$1 RETURNING *",[id]);
      await writeWorkflowEvent(client,{entityType:templateType==='TEMPLATE_B'?'ARCHITECTURAL_SECTION':'NICHE_SECTION',entityId:id,fromStatus:section.status,toStatus:'TECHNICAL_REVIEW',action:'START_TECHNICAL_REVIEW',reason:null,actorUserId:req.auth.id});
      await writeAudit(client,{actorUserId:req.auth.id,action:'NICHE_SECTION_TECHNICAL_REVIEW_STARTED',entityType:templateType==='TEMPLATE_B'?'ARCHITECTURAL_SECTION':'NICHE_SECTION',entityId:id,before:{status:section.status},after:{status:'TECHNICAL_REVIEW'},req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  const nicheDecisionSchema=z.strictObject({
    templateType:z.enum(['TEMPLATE_A','TEMPLATE_B']),
    stage:z.enum(['TECHNICAL','EDITOR_IN_CHIEF']),
    decision:z.enum(['APPROVED','REQUEST_CHANGES','REJECTED']),
    reason:z.string().trim().min(3).max(1000),
  });
  router.post('/niche-sections/:id/decision',asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const input=validate(nicheDecisionSchema,req.body);
    const assigned=Array.isArray(req.auth.roles)&&req.auth.roles.length?req.auth.roles:[req.auth.role];
    const technical=input.stage==='TECHNICAL';
    if(technical&&!assigned.includes('TECHNICAL_REVIEWER'))throw new RequestError(403,'FORBIDDEN','Technical reviewer role is required');
    if(!technical&&!assigned.includes('EDITOR_IN_CHIEF'))throw new RequestError(403,'FORBIDDEN','Editor-in-chief role is required for chief review');
    const table=input.templateType==='TEMPLATE_B'?'conspace.architectural_sections':'conspace.niche_sections';
    const entityType=input.templateType==='TEMPLATE_B'?'ARCHITECTURAL_SECTION':'NICHE_SECTION';
    const result=await inTransaction(db,async(client)=>{
      const found=await client.query('SELECT * FROM '+table+' WHERE id=$1 FOR UPDATE',[id]);
      const section=found.rows[0];if(!section)throw new RequestError(404,'NOT_FOUND','Niche section not found');
      const expected=technical?'TECHNICAL_REVIEW':'EDITOR_IN_CHIEF_REVIEW';
      if(section.status!==expected)throw new RequestError(409,'INVALID_STATE','Section is not at the requested review stage');
      await assertDifferentPerson(client,section.created_by_user_id??section.updated_by_user_id,req.auth);
      const next=input.decision==='APPROVED'
        ? (technical&&section.requires_chief_review?'EDITOR_IN_CHIEF_REVIEW':'APPROVED')
        : input.decision==='REQUEST_CHANGES'?'NEEDS_CHANGES':'REJECTED';
      const updated=technical
        ? await client.query(
          "UPDATE "+table+" SET status=$2,technical_reviewed_by_user_id=$3,technical_reviewed_at=now(),approved_by_user_id=CASE WHEN $2='APPROVED' THEN $3 ELSE approved_by_user_id END,approved_at=CASE WHEN $2='APPROVED' THEN now() ELSE approved_at END,updated_at=now() WHERE id=$1 RETURNING *",
          [id,next,req.auth.id])
        : await client.query(
          "UPDATE "+table+" SET status=$2,chief_reviewed_by_user_id=$3,chief_reviewed_at=now(),approved_by_user_id=CASE WHEN $2='APPROVED' THEN $3 ELSE approved_by_user_id END,approved_at=CASE WHEN $2='APPROVED' THEN now() ELSE approved_at END,updated_at=now() WHERE id=$1 RETURNING *",
          [id,next,req.auth.id]);
      await client.query('INSERT INTO conspace.editorial_reviews(entity_type,entity_id,stage,decision,reason,reviewer_user_id) VALUES($1,$2,$3,$4,$5,$6)',[entityType,id,input.stage,input.decision,input.reason,req.auth.id]);
      await writeWorkflowEvent(client,{entityType,entityId:id,fromStatus:section.status,toStatus:next,action:input.decision,reason:input.reason,actorUserId:req.auth.id});
      await writeAudit(client,{actorUserId:req.auth.id,action:'NICHE_SECTION_REVIEW_DECIDED',entityType,entityId:id,before:{status:section.status},after:{status:next,stage:input.stage,decision:input.decision,reason:input.reason},req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  return router;
}
