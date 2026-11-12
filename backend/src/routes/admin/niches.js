import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { RequestError, validate } from '../../http/validation.js';
import { asyncHandler, requireRoles, requireRolesOrPermissions } from '../../middleware/admin-auth.js';
import { inTransaction, writeAudit } from '../../services/audit.js';
const uuid=z.string().uuid(),slug=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const groupSchema=z.strictObject({slug,name:z.string().trim().min(1).max(120),sourceRef:z.string().trim().min(3).max(500),sortOrder:z.number().int().min(0).max(1000).optional()});
const nicheSchema=z.strictObject({slug,name:z.string().trim().min(1).max(160),groupType:z.enum(['design','construction']),code:z.string().trim().max(30).nullable().optional(),summary:z.string().max(2000).optional(),sourceRef:z.string().trim().min(3).max(500),groupId:uuid.nullable().optional(),sortOrder:z.number().int().min(0).max(1000).optional(),isActive:z.boolean().optional()});
const sectionSchema=z.strictObject({audienceRole:z.enum(['homeowner','architect','contractor']).nullable().optional(),content:z.string().max(50000),sourceRef:z.string().max(1000).nullable().optional(),sensitivityAssessed:z.boolean().default(false),sensitivityFlags:z.array(z.enum(['INDUSTRY_DARK_SIDE','PRICE_OR_RATE','WARRANTY_PERIOD','IDENTIFIABLE_ENTITY_RISK','LEGAL_CONTENT'])).max(5).default([])});
async function assertDifferentPeople(client,authorId,reviewerId){
 if(!authorId)return;
 const r=await client.query('SELECT a.person_id AS author_person_id,v.person_id AS reviewer_person_id FROM conspace.cms_users a JOIN conspace.cms_users v ON v.id=$2 WHERE a.id=$1',[authorId,reviewerId]);
 if(r.rows[0]?.author_person_id===r.rows[0]?.reviewer_person_id)throw new RequestError(403,'AUTHOR_CANNOT_APPROVE','The section author and reviewer must be different people');
}
export function createNichesRouter(db=pool){
 const router=Router();router.use(requireRoles('ADMIN','EDITOR','TECHNICAL_REVIEWER','EDITOR_IN_CHIEF'));
 router.get('/',asyncHandler(async(_req,res)=>{
  const r=await db.query('SELECT n.id,n.slug,n.name,n.group_type AS "groupType",n.template_key AS "templateType",CASE n.template_key WHEN \'TEMPLATE_A\' THEN 12 ELSE 7 END AS "expectedSectionCount",n.code,n.summary,n.source_ref AS "sourceRef",n.sort_order AS "sortOrder",n.is_active AS "isActive",n.niche_group_id AS "groupId",g.name AS "groupName" FROM conspace.niches n LEFT JOIN conspace.niche_groups g ON g.id=n.niche_group_id ORDER BY CASE n.group_type WHEN \'design\' THEN 0 ELSE 1 END,n.sort_order,n.name');
  res.json({ok:true,data:r.rows,meta:{total:r.rows.length,designLimit:8,constructionLimit:30}});
 }));
 router.get('/groups',asyncHandler(async(_req,res)=>{
  const r=await db.query('SELECT g.id,g.slug,g.name,g.source_ref AS "sourceRef",g.sort_order AS "sortOrder",count(n.id)::integer AS "nicheCount" FROM conspace.niche_groups g LEFT JOIN conspace.niches n ON n.niche_group_id=g.id GROUP BY g.id ORDER BY g.sort_order,g.name');
  res.json({ok:true,data:r.rows,meta:{total:r.rows.length,maximum:5}});
 }));
 router.post('/groups',requireRoles('EDITOR','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
  const x=validate(groupSchema,req.body),r=await db.query('INSERT INTO conspace.niche_groups(slug,name,source_ref,sort_order) VALUES($1,$2,$3,$4) RETURNING *',[x.slug,x.name,x.sourceRef,x.sortOrder??0]);
  await db.query('INSERT INTO conspace.audit_logs(actor_user_id,action,entity_type,entity_id,after_data) VALUES($1,\'NICHE_GROUP_CREATED\',\'NICHE_GROUP\',$2,$3::jsonb)',[req.auth.id,r.rows[0].id,JSON.stringify(r.rows[0])]);
  res.status(201).json({ok:true,data:r.rows[0]});
 }));
 router.post('/',requireRoles('EDITOR','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
  const x=validate(nicheSchema,req.body);
  if(x.groupType==='construction'&&!x.groupId)throw new RequestError(400,'GROUP_REQUIRED','Construction niche must belong to a documented group');
  if(x.groupType==='design'&&x.groupId)throw new RequestError(400,'INVALID_GROUP','Design categories do not use construction groups');
  const key=x.groupType==='design'?'TEMPLATE_B':'TEMPLATE_A';
  const r=await db.query('INSERT INTO conspace.niches(slug,name,group_type,template_key,code,summary,source_ref,sort_order,is_active,niche_group_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[x.slug,x.name,x.groupType,key,x.code??null,x.summary??'',x.sourceRef,x.sortOrder??0,x.isActive??false,x.groupId??null]);
  res.status(201).json({ok:true,data:r.rows[0]});
 }));
 router.patch('/:id',requireRoles('EDITOR','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
  const id=validate(z.strictObject({id:uuid}),req.params).id,x=validate(nicheSchema.partial(),req.body);
  const old=await db.query('SELECT * FROM conspace.niches WHERE id=$1',[id]);if(!old.rows[0])throw new RequestError(404,'NOT_FOUND','Niche not found');
  const before=old.rows[0],group=x.groupType??before.group_type,groupId=x.groupId===undefined?before.niche_group_id:x.groupId;
  if(group==='construction'&&!groupId)throw new RequestError(400,'GROUP_REQUIRED','Construction niche must belong to a documented group');
  if(group==='design'&&groupId)throw new RequestError(400,'INVALID_GROUP','Design categories do not use construction groups');
  const key=group==='design'?'TEMPLATE_B':'TEMPLATE_A';
  const r=await db.query('UPDATE conspace.niches SET slug=COALESCE($2,slug),name=COALESCE($3,name),group_type=$4,template_key=$5,code=COALESCE($6,code),summary=COALESCE($7,summary),source_ref=COALESCE($8,source_ref),sort_order=COALESCE($9,sort_order),is_active=COALESCE($10,is_active),niche_group_id=$11,updated_at=now() WHERE id=$1 RETURNING *',[id,x.slug??null,x.name??null,group,key,x.code??null,x.summary??null,x.sourceRef??null,x.sortOrder??null,x.isActive??null,groupId]);
  await db.query('INSERT INTO conspace.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,\'NICHE_UPDATED\',\'NICHE\',$2,$3::jsonb,$4::jsonb)',[req.auth.id,id,JSON.stringify(before),JSON.stringify(r.rows[0])]);
  res.json({ok:true,data:r.rows[0]});
 }));
 router.delete('/:id',requireRoles('EDITOR','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
  const id=validate(z.strictObject({id:uuid}),req.params).id;
  const r=await db.query('UPDATE conspace.niches SET is_active=false,updated_at=now() WHERE id=$1 RETURNING id,slug,is_active AS "isActive"',[id]);
  if(!r.rows[0])throw new RequestError(404,'NOT_FOUND','Niche not found');
  res.json({ok:true,data:r.rows[0]});
 }));
 router.get('/:id/sections',asyncHandler(async(req,res)=>{
  const id=validate(z.strictObject({id:uuid}),req.params).id;
  const niche=await db.query('SELECT template_key FROM conspace.niches WHERE id=$1',[id]);if(!niche.rows[0])throw new RequestError(404,'NOT_FOUND','Niche not found');
  if(niche.rows[0].template_key==='TEMPLATE_B'){
   const r=await db.query('SELECT b.section_no AS "sectionNo",b.block_key AS "blockKey",b.title,b.source_description AS "sourceDescription",s.content,s.source_ref AS "sourceRef",s.status,s.updated_by_user_id AS "updatedByUserId",s.sensitivity_assessed AS "sensitivityAssessed",s.sensitivity_flags AS "sensitivityFlags",s.requires_chief_review AS "requiresChiefReview" FROM conspace.architectural_template_blocks b LEFT JOIN conspace.architectural_sections s ON s.niche_id=$1 AND s.section_no=b.section_no ORDER BY b.section_no',[id]);
   return res.json({ok:true,data:{templateType:'TEMPLATE_B',expectedSectionCount:7,sections:r.rows}});
  }
  const r=await db.query('SELECT b.section_no AS "sectionNo",b.block_key AS "blockKey",b.title,b.source_description AS "sourceDescription",l.audience_role AS "audienceRole",s.content,s.source_ref AS "sourceRef",s.status,s.updated_by_user_id AS "updatedByUserId",s.sensitivity_assessed AS "sensitivityAssessed",s.sensitivity_flags AS "sensitivityFlags",s.requires_chief_review AS "requiresChiefReview",(s.audience_role IS NULL) AS "sharedContent" FROM conspace.niche_template_blocks b LEFT JOIN conspace.niche_template_layers l ON l.section_no=b.section_no LEFT JOIN LATERAL(SELECT ns.content,ns.source_ref,ns.status,ns.updated_by_user_id,ns.audience_role FROM conspace.niche_sections ns WHERE ns.niche_id=$1 AND ns.section_no=b.section_no AND (ns.audience_role=l.audience_role OR ns.audience_role IS NULL) ORDER BY CASE WHEN ns.audience_role=l.audience_role THEN 0 ELSE 1 END LIMIT 1)s ON true ORDER BY b.section_no,l.audience_role',[id]);
  res.json({ok:true,data:{templateType:'TEMPLATE_A',expectedSectionCount:12,sections:r.rows}});
 }));
 router.put('/:id/sections/:sectionNo',requireRoles('EDITOR'),asyncHandler(async(req,res)=>{
  const p=validate(z.strictObject({id:uuid,sectionNo:z.coerce.number().int().min(1).max(12)}),req.params),x=validate(sectionSchema,req.body);
  const niche=await db.query('SELECT template_key FROM conspace.niches WHERE id=$1',[p.id]);if(!niche.rows[0])throw new RequestError(404,'NOT_FOUND','Niche not found');
  if(niche.rows[0].template_key==='TEMPLATE_B'){
   if(p.sectionNo>7)throw new RequestError(404,'NOT_FOUND','Architectural template has seven sections');
   if(x.audienceRole!==undefined&&x.audienceRole!==null)throw new RequestError(400,'TEMPLATE_LAYER_NOT_SUPPORTED','Template B uses shared sections only');
   const r=await db.query(`INSERT INTO conspace.architectural_sections(niche_id,section_no,content,source_ref,status,updated_by_user_id,sensitivity_assessed,sensitivity_flags,requires_chief_review) VALUES($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8) ON CONFLICT(niche_id,section_no) DO UPDATE SET content=EXCLUDED.content,source_ref=EXCLUDED.source_ref,status='DRAFT',updated_by_user_id=EXCLUDED.updated_by_user_id,sensitivity_assessed=EXCLUDED.sensitivity_assessed,sensitivity_flags=EXCLUDED.sensitivity_flags,requires_chief_review=EXCLUDED.requires_chief_review,updated_at=now() RETURNING *`,[p.id,p.sectionNo,x.content,x.sourceRef??null,req.auth.id,x.sensitivityAssessed,x.sensitivityFlags,x.sensitivityFlags.length>0]);
   await writeAudit(db,{actorUserId:req.auth.id,action:'ARCHITECTURAL_SECTION_UPDATED',entityType:'ARCHITECTURAL_SECTION',entityId:r.rows[0].id,after:{sectionNo:p.sectionNo,status:r.rows[0].status,sensitivityFlags:r.rows[0].sensitivity_flags,sourceRef:r.rows[0].source_ref},req});
   return res.json({ok:true,data:{...r.rows[0],templateType:'TEMPLATE_B'}});
  }
  const r=await db.query(`INSERT INTO conspace.niche_sections(niche_id,section_no,audience_role,content,source_ref,status,updated_by_user_id,sensitivity_assessed,sensitivity_flags,requires_chief_review) VALUES($1,$2,$3,$4,$5,'DRAFT',$6,$7,$8,$9) ON CONFLICT(niche_id,section_no,audience_role) DO UPDATE SET content=EXCLUDED.content,source_ref=EXCLUDED.source_ref,status='DRAFT',updated_by_user_id=EXCLUDED.updated_by_user_id,sensitivity_assessed=EXCLUDED.sensitivity_assessed,sensitivity_flags=EXCLUDED.sensitivity_flags,requires_chief_review=EXCLUDED.requires_chief_review,updated_at=now() RETURNING *`,[p.id,p.sectionNo,x.audienceRole??null,x.content,x.sourceRef??null,req.auth.id,x.sensitivityAssessed,x.sensitivityFlags,x.sensitivityFlags.length>0]);
  await writeAudit(db,{actorUserId:req.auth.id,action:'NICHE_SECTION_UPDATED',entityType:'NICHE_SECTION',entityId:r.rows[0].id,after:{sectionNo:p.sectionNo,audienceRole:x.audienceRole??null,status:r.rows[0].status,sensitivityFlags:r.rows[0].sensitivity_flags,sourceRef:r.rows[0].source_ref},req});
  res.json({ok:true,data:{...r.rows[0],templateType:'TEMPLATE_A'}});
 }));

 router.post('/:id/sections/:sectionNo/submit',requireRoles('EDITOR'),asyncHandler(async(req,res)=>{
  const p=validate(z.strictObject({id:uuid,sectionNo:z.coerce.number().int().min(1).max(12)}),req.params);
  const x=validate(z.strictObject({audienceRole:z.enum(['homeowner','architect','contractor']).nullable().optional(),reason:z.string().trim().min(3).max(1000)}),req.body);
  const result=await inTransaction(db,async(client)=>{
   const niche=await client.query('SELECT template_key FROM conspace.niches WHERE id=$1',[p.id]);if(!niche.rows[0])throw new RequestError(404,'NOT_FOUND','Niche not found');
   const isB=niche.rows[0].template_key==='TEMPLATE_B';if(isB&&p.sectionNo>7)throw new RequestError(404,'NOT_FOUND','Architectural template has seven sections');if(isB&&x.audienceRole)throw new RequestError(400,'TEMPLATE_LAYER_NOT_SUPPORTED','Template B has shared content only');
   const table=isB?'conspace.architectural_sections':'conspace.niche_sections';
   const q=isB?await client.query('SELECT * FROM '+table+' WHERE niche_id=$1 AND section_no=$2 FOR UPDATE',[p.id,p.sectionNo]):await client.query('SELECT * FROM '+table+' WHERE niche_id=$1 AND section_no=$2 AND audience_role IS NOT DISTINCT FROM $3::text FOR UPDATE',[p.id,p.sectionNo,x.audienceRole??null]);
   const section=q.rows[0];if(!section)throw new RequestError(404,'NOT_FOUND','Niche section not found');
   if(!['DRAFT','NEEDS_CHANGES'].includes(section.status))throw new RequestError(409,'INVALID_STATE','Only draft or returned sections can be submitted');
   if(!section.sensitivity_assessed)throw new RequestError(409,'SENSITIVITY_ASSESSMENT_REQUIRED','Editor must assess sensitivity before submission');
   if(!section.content.trim()||!section.source_ref)throw new RequestError(409,'SOURCE_REQUIRED','Section content and source are required before technical review');
   const updated=await client.query("UPDATE "+table+" SET status='SUBMITTED',submitted_at=now(),updated_at=now() WHERE id=$1 RETURNING *",[section.id]);
   const entityType=isB?'ARCHITECTURAL_SECTION':'NICHE_SECTION';
   await writeWorkflowEvent(client,{entityType,entityId:section.id,fromStatus:section.status,toStatus:'SUBMITTED',action:'SUBMIT_FOR_TECHNICAL_REVIEW',reason:x.reason,actorUserId:req.auth.id});
   await writeAudit(client,{actorUserId:req.auth.id,action:'NICHE_SECTION_SUBMITTED',entityType,entityId:section.id,before:{status:section.status},after:{status:'SUBMITTED',reason:x.reason},req});
   return updated.rows[0];
  });
  res.json({ok:true,data:result});
 }));

 router.post('/:id/sections/:sectionNo/publish',requireRolesOrPermissions(['EDITOR_IN_CHIEF'],['CONTENT_PUBLISH']),asyncHandler(async(req,res)=>{
  const p=validate(z.strictObject({id:uuid,sectionNo:z.coerce.number().int().min(1).max(12)}),req.params),x=validate(z.strictObject({audienceRole:z.enum(['homeowner','architect','contractor']).nullable().optional(),reason:z.string().trim().min(3).max(1000)}),req.body);
  const result=await inTransaction(db,async(client)=>{
   const niche=await client.query('SELECT template_key FROM conspace.niches WHERE id=$1',[p.id]);if(!niche.rows[0])throw new RequestError(404,'NOT_FOUND','Niche not found');
   const isB=niche.rows[0].template_key==='TEMPLATE_B';if(isB&&p.sectionNo>7)throw new RequestError(404,'NOT_FOUND','Architectural template has seven sections');if(isB&&x.audienceRole)throw new RequestError(400,'TEMPLATE_LAYER_NOT_SUPPORTED','Template B has no audience-specific layers');
   const q=isB
    ? await client.query('SELECT * FROM conspace.architectural_sections WHERE niche_id=$1 AND section_no=$2 FOR UPDATE',[p.id,p.sectionNo])
    : await client.query('SELECT * FROM conspace.niche_sections WHERE niche_id=$1 AND section_no=$2 AND audience_role IS NOT DISTINCT FROM $3::text FOR UPDATE',[p.id,p.sectionNo,x.audienceRole??null]);
   const section=q.rows[0];if(!section)throw new RequestError(404,'NOT_FOUND','Niche section not found');
   if(section.status!=='APPROVED'||!section.approved_by_user_id||!section.approved_at)throw new RequestError(409,'INVALID_STATE','Section must pass technical and required chief review before publication');
   await assertDifferentPeople(client,section.updated_by_user_id,req.auth.id);
   if(!section.content.trim()||!section.source_ref)throw new RequestError(409,'SOURCE_REQUIRED','A section requires content and a source before publication');
   const updated=isB
    ? await client.query("UPDATE conspace.architectural_sections SET status='PUBLISHED',published_by_user_id=$2,published_at=now(),updated_at=now() WHERE id=$1 RETURNING *",[section.id,req.auth.id])
    : await client.query("UPDATE conspace.niche_sections SET status='PUBLISHED',published_by_user_id=$2,published_at=now(),updated_at=now() WHERE id=$1 RETURNING *",[section.id,req.auth.id]);
   await client.query("INSERT INTO conspace.workflow_events(entity_type,entity_id,from_status,to_status,action,reason,actor_user_id) VALUES($1,$2,$3,'PUBLISHED','APPROVE_AND_PUBLISH',$4,$5)",[isB?'ARCHITECTURAL_SECTION':'NICHE_SECTION',section.id,section.status,x.reason,req.auth.id]);
   await writeAudit(client,{actorUserId:req.auth.id,action:isB?'ARCHITECTURAL_SECTION_PUBLISHED':'NICHE_SECTION_PUBLISHED',entityType:isB?'ARCHITECTURAL_SECTION':'NICHE_SECTION',entityId:section.id,before:{status:section.status},after:{status:'PUBLISHED',reason:x.reason},req});
   return {...updated.rows[0],templateType:isB?'TEMPLATE_B':'TEMPLATE_A'};
  });
  res.json({ok:true,data:result});
 }));
 return router;
}
