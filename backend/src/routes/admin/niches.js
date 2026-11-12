import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { RequestError, validate } from '../../http/validation.js';
import { asyncHandler, requireRoles } from '../../middleware/admin-auth.js';
import { inTransaction, writeAudit } from '../../services/audit.js';

const uuid=z.string().uuid();
const slug=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const groupSchema=z.strictObject({
  slug,name:z.string().trim().min(1).max(120),sourceRef:z.string().trim().min(3).max(500),sortOrder:z.number().int().min(0).max(1000).optional(),
});
const groupPatch=groupSchema.partial();
const nicheSchema=z.strictObject({
  slug,name:z.string().trim().min(1).max(160),groupType:z.enum(['design','construction']),
  code:z.string().trim().max(30).nullable().optional(),summary:z.string().max(2000).optional(),
  sourceRef:z.string().trim().min(3).max(500),groupId:uuid.nullable().optional(),
  sortOrder:z.number().int().min(0).max(1000).optional(),isActive:z.boolean().optional(),
});
const nichePatch=nicheSchema.partial();
const sectionSchema=z.strictObject({
  audienceRole:z.enum(['homeowner','architect','contractor']).nullable().optional(),
  content:z.string().max(50000),sourceRef:z.string().max(1000).nullable().optional(),
  status:z.enum(['DRAFT','IN_REVIEW']).optional(),
});

export function createNichesRouter(db=pool){
  const router=Router();
  router.use(requireRoles('ADMIN','EDITOR','TECHNICAL_REVIEWER','EDITOR_IN_CHIEF'));

  router.get('/',asyncHandler(async(req,res)=>{
    const result=await db.query(
      'SELECT n.id,n.slug,n.name,n.group_type AS "groupType",n.code,n.summary,n.source_ref AS "sourceRef",' +
      'n.sort_order AS "sortOrder",n.is_active AS "isActive",n.niche_group_id AS "groupId",g.name AS "groupName" '+
      'FROM conspace.niches n LEFT JOIN conspace.niche_groups g ON g.id=n.niche_group_id '+
      'ORDER BY CASE n.group_type WHEN \'design\' THEN 0 ELSE 1 END,n.sort_order,n.name'
    );
    res.json({ok:true,data:result.rows,meta:{total:result.rows.length,designLimit:8,constructionLimit:30}});
  }));

  router.get('/groups',asyncHandler(async(req,res)=>{
    const result=await db.query(
      'SELECT g.id,g.slug,g.name,g.source_ref AS "sourceRef",g.sort_order AS "sortOrder",' +
      'count(n.id)::integer AS "nicheCount" FROM conspace.niche_groups g '+
      'LEFT JOIN conspace.niches n ON n.niche_group_id=g.id GROUP BY g.id ORDER BY g.sort_order,g.name'
    );
    res.json({ok:true,data:result.rows,meta:{total:result.rows.length,maximum:5}});
  }));

  router.post('/groups',requireRoles('ADMIN','EDITOR'),asyncHandler(async(req,res)=>{
    const input=validate(groupSchema,req.body);
    const result=await inTransaction(db,async(client)=>{
      const inserted=await client.query(
        'INSERT INTO conspace.niche_groups (slug,name,source_ref,sort_order) VALUES ($1,$2,$3,$4) RETURNING *',
        [input.slug,input.name,input.sourceRef,input.sortOrder??0]
      );
      await writeAudit(client,{actorUserId:req.auth.id,action:'NICHE_GROUP_CREATED',entityType:'NICHE_GROUP',entityId:inserted.rows[0].id,after:inserted.rows[0],req});
      return inserted.rows[0];
    });
    res.status(201).json({ok:true,data:result});
  }));

  router.patch('/groups/:id',requireRoles('ADMIN','EDITOR'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const input=validate(groupPatch,req.body);
    const result=await inTransaction(db,async(client)=>{
      const old=await client.query('SELECT * FROM conspace.niche_groups WHERE id=$1 FOR UPDATE',[id]);
      if(!old.rows[0]) throw new RequestError(404,'NOT_FOUND','Niche group not found');
      const before=old.rows[0];
      const updated=await client.query(
        'UPDATE conspace.niche_groups SET slug=COALESCE($2,slug),name=COALESCE($3,name),source_ref=COALESCE($4,source_ref),sort_order=COALESCE($5,sort_order),updated_at=now() WHERE id=$1 RETURNING *',
        [id,input.slug??null,input.name??null,input.sourceRef??null,input.sortOrder??null]
      );
      await writeAudit(client,{actorUserId:req.auth.id,action:'NICHE_GROUP_UPDATED',entityType:'NICHE_GROUP',entityId:id,before,after:updated.rows[0],req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  router.post('/',requireRoles('ADMIN','EDITOR'),asyncHandler(async(req,res)=>{
    const input=validate(nicheSchema,req.body);
    if(input.groupType==='construction' && !input.groupId) throw new RequestError(400,'GROUP_REQUIRED','Construction niche must belong to a documented group');
    if(input.groupType==='design' && input.groupId) throw new RequestError(400,'INVALID_GROUP','Design categories do not use construction groups');
    const result=await inTransaction(db,async(client)=>{
      const inserted=await client.query(
        'INSERT INTO conspace.niches (slug,name,group_type,code,summary,source_ref,sort_order,is_active,niche_group_id) '+
        'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
        [input.slug,input.name,input.groupType,input.code??null,input.summary??'',input.sourceRef,input.sortOrder??0,input.isActive??false,input.groupId??null]
      );
      await writeAudit(client,{actorUserId:req.auth.id,action:'NICHE_CREATED',entityType:'NICHE',entityId:inserted.rows[0].id,after:inserted.rows[0],req});
      return inserted.rows[0];
    });
    res.status(201).json({ok:true,data:result});
  }));

  router.patch('/:id',requireRoles('ADMIN','EDITOR'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const input=validate(nichePatch,req.body);
    const result=await inTransaction(db,async(client)=>{
      const old=await client.query('SELECT * FROM conspace.niches WHERE id=$1 FOR UPDATE',[id]);
      if(!old.rows[0]) throw new RequestError(404,'NOT_FOUND','Niche not found');
      const before=old.rows[0];
      const groupType=input.groupType??before.group_type;
      const groupId=input.groupId===undefined?before.niche_group_id:input.groupId;
      if(groupType==='construction' && !groupId) throw new RequestError(400,'GROUP_REQUIRED','Construction niche must belong to a documented group');
      if(groupType==='design' && groupId) throw new RequestError(400,'INVALID_GROUP','Design categories do not use construction groups');
      const updated=await client.query(
        'UPDATE conspace.niches SET slug=COALESCE($2,slug),name=COALESCE($3,name),group_type=$4,'+
        'code=COALESCE($5,code),summary=COALESCE($6,summary),source_ref=COALESCE($7,source_ref),'+
        'sort_order=COALESCE($8,sort_order),is_active=COALESCE($9,is_active),niche_group_id=$10,updated_at=now() '+
        'WHERE id=$1 RETURNING *',
        [id,input.slug??null,input.name??null,groupType,input.code??null,input.summary??null,input.sourceRef??null,input.sortOrder??null,input.isActive??null,groupId]
      );
      await writeAudit(client,{actorUserId:req.auth.id,action:'NICHE_UPDATED',entityType:'NICHE',entityId:id,before,after:updated.rows[0],req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  router.delete('/:id',requireRoles('ADMIN'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await inTransaction(db,async(client)=>{
      const old=await client.query('SELECT * FROM conspace.niches WHERE id=$1 FOR UPDATE',[id]);
      if(!old.rows[0]) throw new RequestError(404,'NOT_FOUND','Niche not found');
      const updated=await client.query('UPDATE conspace.niches SET is_active=false,updated_at=now() WHERE id=$1 RETURNING id,slug,is_active AS "isActive"',[id]);
      await writeAudit(client,{actorUserId:req.auth.id,action:'NICHE_DEACTIVATED',entityType:'NICHE',entityId:id,before:old.rows[0],after:updated.rows[0],req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  router.get('/:id/sections',asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await db.query(
      'SELECT b.section_no AS "sectionNo",b.block_key AS "blockKey",b.title,b.source_description AS "sourceDescription",' +
      'l.audience_role AS "audienceRole",s.content,s.source_ref AS "sourceRef",s.status '+
      'FROM conspace.niche_template_blocks b '+
      'LEFT JOIN conspace.niche_template_layers l ON l.section_no=b.section_no '+
      'LEFT JOIN conspace.niche_sections s ON s.niche_id=$1 AND s.section_no=b.section_no AND s.audience_role IS NOT DISTINCT FROM l.audience_role '+
      'ORDER BY b.section_no,l.audience_role',
      [id]
    );
    res.json({ok:true,data:result.rows});
  }));

  router.put('/:id/sections/:sectionNo',requireRoles('ADMIN','EDITOR'),asyncHandler(async(req,res)=>{
    const params=validate(z.strictObject({id:uuid,sectionNo:z.coerce.number().int().min(1).max(12)}),req.params);
    const input=validate(sectionSchema,req.body);
    const block=await db.query('SELECT section_no FROM conspace.niche_template_blocks WHERE section_no=$1',[params.sectionNo]);
    if(!block.rows[0]) throw new RequestError(404,'NOT_FOUND','Niche template block not found');
    const result=await inTransaction(db,async(client)=>{
      const saved=await client.query(
        'INSERT INTO conspace.niche_sections (niche_id,section_no,audience_role,content,source_ref,status,updated_by_user_id) '+
        'VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (niche_id,section_no,audience_role) DO UPDATE SET '+
        'content=EXCLUDED.content,source_ref=EXCLUDED.source_ref,status=EXCLUDED.status,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now() '+
        'RETURNING *',
        [params.id,params.sectionNo,input.audienceRole??null,input.content,input.sourceRef??null,input.status??'DRAFT',req.auth.id]
      );
      await writeAudit(client,{actorUserId:req.auth.id,action:'NICHE_SECTION_SAVED',entityType:'NICHE',entityId:params.id,after:saved.rows[0],req});
      return saved.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  router.post('/:id/sections/:sectionNo/publish',requireRoles('ADMIN','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
    const params=validate(z.strictObject({id:uuid,sectionNo:z.coerce.number().int().min(1).max(12)}),req.params);
    const input=validate(z.strictObject({
      audienceRole:z.enum(['homeowner','architect','contractor']).nullable().optional(),
      reason:z.string().trim().min(3).max(1000),
    }),req.body);
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query(
        'SELECT * FROM conspace.niche_sections WHERE niche_id=$1 AND section_no=$2 AND audience_role IS NOT DISTINCT FROM $3::text FOR UPDATE',
        [params.id,params.sectionNo,input.audienceRole??null]
      );
      const section=current.rows[0];
      if(!section) throw new RequestError(404,'NOT_FOUND','Niche section not found');
      if(section.status!=='IN_REVIEW') throw new RequestError(409,'INVALID_STATE','Section must be submitted for review before publication');
      if(section.updated_by_user_id===req.auth.id) throw new RequestError(403,'AUTHOR_CANNOT_APPROVE','You cannot publish a section you last edited');
      if(!section.content.trim() || !section.source_ref) throw new RequestError(409,'SOURCE_REQUIRED','A section requires content and a source before publication');
      const updated=await client.query(
        "UPDATE conspace.niche_sections SET status='PUBLISHED',updated_at=now() WHERE id=$1 RETURNING *",
        [section.id]
      );
      await client.query(
        'INSERT INTO conspace.workflow_events (entity_type,entity_id,from_status,to_status,action,reason,actor_user_id) '+
        "VALUES ('NICHE_SECTION',$1,$2,'PUBLISHED','APPROVE_AND_PUBLISH',$3,$4)",
        [section.id,section.status,input.reason,req.auth.id]
      );
      await writeAudit(client,{actorUserId:req.auth.id,action:'NICHE_SECTION_PUBLISHED',entityType:'NICHE_SECTION',entityId:section.id,before:{status:section.status},after:{status:'PUBLISHED',reason:input.reason},req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));


  return router;
}
