import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { RequestError, validate } from '../../http/validation.js';
import { asyncHandler, requireRoles } from '../../middleware/admin-auth.js';
import { createEditorialService } from '../../services/editorial.js';
import { writeAudit, inTransaction } from '../../services/audit.js';

const uuid=z.string().uuid();
const flag=z.enum(['INDUSTRY_DARK_SIDE','PRICE_OR_RATE','WARRANTY_PERIOD','IDENTIFIABLE_ENTITY_RISK','LEGAL_CONTENT']);
const tagSchema=z.strictObject({slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),name:z.string().trim().min(1).max(80)});
const sourceSchema=z.strictObject({title:z.string().trim().min(1).max(300),url:z.string().url().max(2000).nullable().optional(),citation:z.string().max(2000).nullable().optional()});
const articleSchema=z.strictObject({
  slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  title:z.string().trim().min(1).max(300),
  excerpt:z.string().max(1000).optional(),
  body:z.string().max(200000).optional(),
  coverImageUrl:z.string().url().max(2000).nullable().optional(),
  authorId:uuid.optional(),
  audienceRole:z.enum(['homeowner','architect','contractor']).nullable().optional(),
  contentType:z.enum(['REFERENCE','NON_FICTION','FICTIONALIZED','FIELD_CASE','Q_AND_A','REGULATION','EDITORIAL']).optional(),
  nicheIds:z.array(uuid).max(38).optional(),
  tags:z.array(tagSchema).max(30).optional(),
  sources:z.array(sourceSchema).max(50).optional(),
  mediaIds:z.array(uuid).max(50).optional(),
  sensitivityFlags:z.array(flag).max(5).optional(),
  sensitivityAssessed:z.boolean().optional(),
  changeReason:z.string().max(500).optional(),
});
const patchSchema=articleSchema.partial();
const querySchema=z.strictObject({
  status:z.enum(['DRAFT','SUBMITTED','TECHNICAL_REVIEW','EDITOR_IN_CHIEF_REVIEW','APPROVED','SCHEDULED','PUBLISHED','NEEDS_CHANGES','REJECTED','WITHDRAWN','ARCHIVED','IN_REVIEW']).optional(),
  role:z.enum(['homeowner','architect','contractor']).optional(),
  search:z.string().trim().max(120).optional(),
  page:z.coerce.number().int().min(1).default(1),
  limit:z.coerce.number().int().min(1).max(100).default(20),
});
const idSchema=z.strictObject({id:uuid});
const scheduleSchema=z.strictObject({scheduledAt:z.string().datetime({offset:true})});
const reasonSchema=z.strictObject({reason:z.string().trim().min(3).max(1000)});

export function createArticlesRouter(db=pool, editorial=createEditorialService(db)){
  const router=Router();
  router.use(requireRoles('ADMIN','EDITOR','TECHNICAL_REVIEWER','EDITOR_IN_CHIEF'));

  router.get('/',asyncHandler(async(req,res)=>{
    const query=validate(querySchema,req.query);
    const {rows,total}=await editorial.listArticles({status:query.status==='IN_REVIEW'?'TECHNICAL_REVIEW':query.status,role:query.role,search:query.search,page:query.page,limit:query.limit});
    res.json({ok:true,data:rows,meta:{total,page:query.page,limit:query.limit}});
  }));

  router.post('/',requireRoles('ADMIN','EDITOR'),asyncHandler(async(req,res)=>{
    const input=validate(articleSchema,req.body);
    const data=await editorial.createArticle(req.auth,input,req);
    res.status(201).json({ok:true,data});
  }));

  router.get('/:id/revisions',asyncHandler(async(req,res)=>{
    const {id}=validate(idSchema,req.params);
    const result=await db.query(
      'SELECT r.id,r.version_no AS "versionNo",r.snapshot,r.change_reason AS "changeReason",r.created_at AS "createdAt",u.display_name AS "createdBy" '+
      'FROM conspace.article_revisions r LEFT JOIN conspace.cms_users u ON u.id=r.created_by_user_id WHERE r.article_id=$1 ORDER BY r.version_no DESC',
      [id]
    );
    res.json({ok:true,data:result.rows});
  }));

  router.get('/:id',asyncHandler(async(req,res)=>{
    const {id}=validate(idSchema,req.params);
    const article=await editorial.getArticle(id);
    if(!article) throw new RequestError(404,'NOT_FOUND','Article not found');
    res.json({ok:true,data:article});
  }));

  router.patch('/:id',requireRoles('ADMIN','EDITOR'),asyncHandler(async(req,res)=>{
    const {id}=validate(idSchema,req.params);
    const input=validate(patchSchema,req.body);
    if(!Object.keys(input).length) throw new RequestError(400,'EMPTY_UPDATE','At least one field is required');
    const data=await editorial.updateArticle(req.auth,id,input,req);
    res.json({ok:true,data});
  }));

  router.delete('/:id',requireRoles('ADMIN'),asyncHandler(async(req,res)=>{
    const {id}=validate(idSchema,req.params);
    const data=await inTransaction(db,async(client)=>{
      const result=await client.query('SELECT status FROM conspace.articles WHERE id=$1 FOR UPDATE',[id]);
      const before=result.rows[0];
      if(!before) throw new RequestError(404,'NOT_FOUND','Article not found');
      if(!['DRAFT','NEEDS_CHANGES','REJECTED'].includes(before.status)) throw new RequestError(409,'INVALID_STATE','Only unpublished drafts can be archived');
      const updated=await client.query("UPDATE conspace.articles SET status='ARCHIVED',updated_by_user_id=$2,updated_at=now() WHERE id=$1 RETURNING id,status",[id,req.auth.id]);
      await writeAudit(client,{actorUserId:req.auth.id,action:'ARTICLE_ARCHIVED',entityType:'ARTICLE',entityId:id,before,after:updated.rows[0],req});
      return updated.rows[0];
    });
    res.json({ok:true,data});
  }));

  router.post('/:id/submit',requireRoles('ADMIN','EDITOR'),asyncHandler(async(req,res)=>{
    const {id}=validate(idSchema,req.params);
    const data=await editorial.submitArticle(req.auth,id,req);
    res.json({ok:true,data});
  }));

  router.post('/:id/schedule',requireRoles('ADMIN','EDITOR','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
    const {id}=validate(idSchema,req.params);
    const {scheduledAt}=validate(scheduleSchema,req.body);
    const data=await editorial.scheduleArticle(req.auth,id,scheduledAt,req);
    res.json({ok:true,data});
  }));

  router.post('/:id/publish',requireRoles('ADMIN','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
    const {id}=validate(idSchema,req.params);
    const data=await editorial.publishArticle(req.auth,id,req);
    res.json({ok:true,data});
  }));

  router.post('/:id/withdraw',requireRoles('ADMIN','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
    const {id}=validate(idSchema,req.params);
    const {reason}=validate(reasonSchema,req.body);
    const data=await editorial.withdrawArticle(req.auth,id,reason,req);
    res.json({ok:true,data});
  }));

  return router;
}
