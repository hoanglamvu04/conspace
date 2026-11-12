import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { RequestError, validate } from '../../http/validation.js';
import { asyncHandler, requireRoles, requireRolesOrPermissions } from '../../middleware/admin-auth.js';
import { decryptPrivateContact } from '../../security/private-contact.js';
import { inTransaction, writeAudit, writeWorkflowEvent } from '../../services/audit.js';

const uuid=z.string().uuid();
const answerSchema=z.strictObject({
  body:z.string().trim().min(1).max(50000),
  relatedArticleId:uuid.nullable().optional(),
  sensitivityFlags:z.array(z.enum(['INDUSTRY_DARK_SIDE','PRICE_OR_RATE','WARRANTY_PERIOD','IDENTIFIABLE_ENTITY_RISK','LEGAL_CONTENT'])).max(5).optional(),
  sensitivityAssessed:z.boolean().default(false),
});
const questionPatch=z.strictObject({
  status:z.enum(['IN_REVIEW','REJECTED','ARCHIVED']).optional(),
  moderationNote:z.string().max(2000).nullable().optional(),
});

export function createQuestionsRouter(db=pool,config){
  const router=Router();
  router.use(requireRolesOrPermissions(['ADMIN','EDITOR','TECHNICAL_REVIEWER','EDITOR_IN_CHIEF'],['CONTENT_PUBLISH']));

  router.get('/',asyncHandler(async(req,res)=>{
    const query=validate(z.strictObject({
      status:z.enum(['SUBMITTED','IN_REVIEW','ANSWERED','PUBLISHED','REJECTED','ARCHIVED']).optional(),
      page:z.coerce.number().int().min(1).default(1),
      limit:z.coerce.number().int().min(1).max(100).default(30),
    }),req.query);
    const result=await db.query(
      'SELECT q.id,q.description,q.status,q.request_private_reply AS "requestPrivateReply",q.created_at AS "createdAt",' +
      'n.slug AS "guessedNiche",a.status AS "answerStatus" FROM conspace.reader_questions q '+
      'LEFT JOIN conspace.niches n ON n.id=q.guessed_niche_id LEFT JOIN conspace.question_answers a ON a.question_id=q.id '+
      'WHERE ($1::text IS NULL OR q.status=$1) ORDER BY q.created_at DESC LIMIT $2 OFFSET $3',
      [query.status??null,query.limit,(query.page-1)*query.limit]
    );
    const count=await db.query('SELECT count(*)::integer AS total FROM conspace.reader_questions WHERE ($1::text IS NULL OR status=$1)',[query.status??null]);
    res.json({ok:true,data:result.rows,meta:{total:count.rows[0].total,page:query.page,limit:query.limit}});
  }));

  router.get('/:id',asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await db.query(
      'SELECT q.*,q.request_private_reply AS "requestPrivateReply",n.slug AS "guessedNiche",' +
      'COALESCE((SELECT json_agg(json_build_object(\'id\',m.id,\'filename\',m.original_filename,\'mimeType\',m.mime_type) ORDER BY qm.position) '+
      'FROM conspace.reader_question_media qm JOIN conspace.media_assets m ON m.id=qm.media_id WHERE qm.question_id=q.id AND m.deleted_at IS NULL),\'[]\'::json) AS media,'+
      'a.id AS "answerId",a.body AS "answerBody",a.status AS "answerStatus",a.published_at AS "answerPublishedAt" '+
      'FROM conspace.reader_questions q LEFT JOIN conspace.niches n ON n.id=q.guessed_niche_id '+
      'LEFT JOIN conspace.question_answers a ON a.question_id=q.id WHERE q.id=$1',
      [id]
    );
    const row=result.rows[0];
    if(!row) throw new RequestError(404,'NOT_FOUND','Question not found');
    if(row.request_private_reply && row.contact_ciphertext && ['ADMIN','EDITOR'].includes(req.auth.role)){
      row.privateContact=decryptPrivateContact({
        ciphertext:row.contact_ciphertext,iv:row.contact_iv,authTag:row.contact_auth_tag,
      },config.contactEncryptionKey);
      await db.query(
        "INSERT INTO conspace.audit_logs (actor_user_id,action,entity_type,entity_id,after_data,request_ip,user_agent) VALUES ($1,'PRIVATE_CONTACT_ACCESSED','QUESTION',$2,$3::jsonb,$4::inet,$5)",
        [req.auth.id,id,JSON.stringify({privateReplyRequested:true}),req.ip,req.get('user-agent')||null]
      );
    }
    delete row.contact_ciphertext;
    delete row.contact_iv;
    delete row.contact_auth_tag;
    res.json({ok:true,data:row});
  }));

  router.patch('/:id',requireRoles('EDITOR'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const input=validate(questionPatch,req.body);
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.reader_questions WHERE id=$1 FOR UPDATE',[id]);
      if(!current.rows[0]) throw new RequestError(404,'NOT_FOUND','Question not found');
      const before=current.rows[0];
      const updated=await client.query(
        'UPDATE conspace.reader_questions SET status=COALESCE($2,status),moderation_note=COALESCE($3,moderation_note),updated_at=now() WHERE id=$1 RETURNING id,status,moderation_note AS "moderationNote"',
        [id,input.status??null,input.moderationNote??null]
      );
      await writeWorkflowEvent(client,{entityType:'QUESTION',entityId:id,fromStatus:before.status,toStatus:updated.rows[0].status,action:'MODERATE',reason:input.moderationNote??null,actorUserId:req.auth.id});
      await writeAudit(client,{actorUserId:req.auth.id,action:'QUESTION_MODERATED',entityType:'QUESTION',entityId:id,before:{status:before.status},after:updated.rows[0],req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  router.post('/:id/answer',requireRoles('EDITOR'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const input=validate(answerSchema,req.body);
    const result=await inTransaction(db,async(client)=>{
      const question=await client.query('SELECT id,status FROM conspace.reader_questions WHERE id=$1 FOR UPDATE',[id]);
      if(!question.rows[0]) throw new RequestError(404,'NOT_FOUND','Question not found');
      if(['REJECTED','ARCHIVED'].includes(question.rows[0].status)) throw new RequestError(409,'INVALID_STATE','Question is not available for an answer');
      if(input.relatedArticleId){
        const article=await client.query("SELECT id FROM conspace.articles WHERE id=$1 AND status='PUBLISHED'",[input.relatedArticleId]);
        if(!article.rows[0]) throw new RequestError(400,'RELATED_ARTICLE_NOT_PUBLISHED','Related article must be published');
      }
      const flags=input.sensitivityFlags??[];
      const requiresChief=flags.length>0;
      const current=await client.query('SELECT * FROM conspace.question_answers WHERE question_id=$1 FOR UPDATE',[id]);
      let answer;
      if(current.rows[0]){
        if(!['DRAFT','NEEDS_CHANGES'].includes(current.rows[0].status)) throw new RequestError(409,'INVALID_STATE','Only draft or returned answers can be edited');
        const updated=await client.query(
          'UPDATE conspace.question_answers SET body=$2,related_article_id=$3,sensitivity_flags=$4,requires_chief_review=$5,sensitivity_assessed=$6,updated_by_user_id=$7,updated_at=now() WHERE id=$1 RETURNING *',
          [current.rows[0].id,input.body,input.relatedArticleId??null,flags,requiresChief,input.sensitivityAssessed,req.auth.id]
        );
        answer=updated.rows[0];
      }else{
        const inserted=await client.query(
          'INSERT INTO conspace.question_answers (question_id,body,related_article_id,sensitivity_flags,requires_chief_review,sensitivity_assessed,created_by_user_id,updated_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *',
          [id,input.body,input.relatedArticleId??null,flags,requiresChief,input.sensitivityAssessed,req.auth.id]
        );
        answer=inserted.rows[0];
      }
      await client.query("UPDATE conspace.reader_questions SET status='IN_REVIEW',updated_at=now() WHERE id=$1",[id]);
      await writeAudit(client,{actorUserId:req.auth.id,action:'QUESTION_ANSWER_SAVED',entityType:'QUESTION_ANSWER',entityId:answer.id,after:{status:answer.status,body:answer.body,requiresChiefReview:requiresChief},req});
      return answer;
    });
    res.status(201).json({ok:true,data:result});
  }));

  router.post('/:id/answer/submit',requireRoles('EDITOR'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.question_answers WHERE question_id=$1 FOR UPDATE',[id]);
      const answer=current.rows[0];
      if(!answer) throw new RequestError(404,'NOT_FOUND','Answer draft not found');
      if(!['DRAFT','NEEDS_CHANGES'].includes(answer.status)) throw new RequestError(409,'INVALID_STATE','Answer cannot be submitted from this state');
      if(!answer.sensitivity_assessed) throw new RequestError(409,'SENSITIVITY_ASSESSMENT_REQUIRED','Editor must explicitly assess sensitive-content flags before answer review');
      const updated=await client.query("UPDATE conspace.question_answers SET status='TECHNICAL_REVIEW',updated_at=now() WHERE id=$1 RETURNING *",[answer.id]);
      await writeWorkflowEvent(client,{entityType:'QUESTION_ANSWER',entityId:answer.id,fromStatus:answer.status,toStatus:'TECHNICAL_REVIEW',action:'SUBMIT',actorUserId:req.auth.id});
      await writeAudit(client,{actorUserId:req.auth.id,action:'QUESTION_ANSWER_SUBMITTED',entityType:'QUESTION_ANSWER',entityId:answer.id,before:{status:answer.status},after:{status:'TECHNICAL_REVIEW'},req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  router.post('/:id/answer/publish',requireRolesOrPermissions(['EDITOR_IN_CHIEF'],['CONTENT_PUBLISH']),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.question_answers WHERE question_id=$1 FOR UPDATE',[id]);
      const answer=current.rows[0];
      if(!answer) throw new RequestError(404,'NOT_FOUND','Answer not found');
      if(answer.status!=='APPROVED' || !answer.approved_by_user_id || !answer.approved_at) throw new RequestError(409,'INVALID_STATE','Answer needs review approval before publication');
      const imageRights=await client.query(
        'SELECT count(*)::integer AS total FROM conspace.reader_question_media qm JOIN conspace.media_assets m ON m.id=qm.media_id WHERE qm.question_id=$1 AND m.deleted_at IS NULL AND m.rights_confirmed=false',[id]
      );
      if(imageRights.rows[0].total>0) throw new RequestError(409,'MEDIA_RIGHTS_REQUIRED','Reader-submitted images must be rights-reviewed before the answer is published');
      const updated=await client.query("UPDATE conspace.question_answers SET status='PUBLISHED',published_at=now(),updated_at=now() WHERE id=$1 RETURNING *",[answer.id]);
      await client.query("UPDATE conspace.reader_questions SET status='PUBLISHED',updated_at=now() WHERE id=$1",[id]);
      await writeWorkflowEvent(client,{entityType:'QUESTION_ANSWER',entityId:answer.id,fromStatus:'APPROVED',toStatus:'PUBLISHED',action:'PUBLISH',actorUserId:req.auth.id});
      await writeAudit(client,{actorUserId:req.auth.id,action:'QUESTION_ANSWER_PUBLISHED',entityType:'QUESTION_ANSWER',entityId:answer.id,before:{status:answer.status},after:{status:'PUBLISHED'},req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  return router;
}
