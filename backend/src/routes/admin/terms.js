import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { RequestError, validate } from '../../http/validation.js';
import { asyncHandler, requireRoles, requireRolesOrPermissions } from '../../middleware/admin-auth.js';
import { inTransaction, writeAudit, writeWorkflowEvent } from '../../services/audit.js';

const uuid=z.string().uuid();
const termSchema=z.strictObject({
  term:z.string().trim().min(1).max(180),
  slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  definition:z.string().trim().min(1).max(10000),
  sourceRef:z.string().trim().min(3).max(1000),
  nicheIds:z.array(uuid).max(38).optional(),
});
const termPatch=termSchema.partial();
const reasonSchema=z.strictObject({reason:z.string().trim().min(3).max(1000)});

async function replaceNiches(client,termId,nicheIds){
  await client.query('DELETE FROM conspace.term_niches WHERE term_id=$1',[termId]);
  for(const nicheId of nicheIds){
    const inserted=await client.query(
      'INSERT INTO conspace.term_niches (term_id,niche_id) SELECT $1,id FROM conspace.niches WHERE id=$2 AND is_active=true',
      [termId,nicheId]
    );
    if(inserted.rowCount!==1) throw new RequestError(400,'INVALID_NICHE','One or more niches are unavailable');
  }
}

export function createTermsRouter(db=pool){
  const router=Router();
  router.use(requireRoles('EDITOR','TECHNICAL_REVIEWER','EDITOR_IN_CHIEF'));

  router.get('/',asyncHandler(async(req,res)=>{
    const query=validate(z.strictObject({
      status:z.enum(['DRAFT','SUBMITTED','TECHNICAL_REVIEW','APPROVED','PUBLISHED','NEEDS_CHANGES','REJECTED','ARCHIVED']).optional(),
      search:z.string().trim().max(120).optional(),
      page:z.coerce.number().int().min(1).default(1),
      limit:z.coerce.number().int().min(1).max(100).default(30),
    }),req.query);
    const offset=(query.page-1)*query.limit;
    const result=await db.query(
      'SELECT t.id,t.term,t.slug,t.definition,t.status,t.source_ref AS "sourceRef",t.updated_at AS "updatedAt",' +
      'u.display_name AS "updatedBy",COALESCE((SELECT json_agg(n.slug) FROM conspace.term_niches tn JOIN conspace.niches n ON n.id=tn.niche_id WHERE tn.term_id=t.id),\'[]\'::json) AS niches '+
      'FROM conspace.terms t LEFT JOIN conspace.cms_users u ON u.id=t.updated_by_user_id '+
      "WHERE ($1::text IS NULL OR t.status=$1) AND ($2::text IS NULL OR t.term ILIKE '%'||$2||'%' OR t.definition ILIKE '%'||$2||'%') "+
      'ORDER BY t.updated_at DESC LIMIT $3 OFFSET $4',
      [query.status??null,query.search??null,query.limit,offset]
    );
    const count=await db.query(
      "SELECT count(*)::integer AS total FROM conspace.terms t WHERE ($1::text IS NULL OR t.status=$1) AND ($2::text IS NULL OR t.term ILIKE '%'||$2||'%' OR t.definition ILIKE '%'||$2||'%')",
      [query.status??null,query.search??null]
    );
    res.json({ok:true,data:result.rows,meta:{total:count.rows[0].total,page:query.page,limit:query.limit}});
  }));

  router.post('/',requireRoles('EDITOR'),asyncHandler(async(req,res)=>{
    const input=validate(termSchema,req.body);
    const result=await inTransaction(db,async(client)=>{
      const inserted=await client.query(
        'INSERT INTO conspace.terms (term,slug,definition,source_ref,created_by_user_id,updated_by_user_id) '+
        'VALUES ($1,$2,$3,$4,$5,$5) RETURNING *',
        [input.term,input.slug,input.definition,input.sourceRef,req.auth.id]
      );
      if(input.nicheIds) await replaceNiches(client,inserted.rows[0].id,input.nicheIds);
      await writeAudit(client,{actorUserId:req.auth.id,action:'TERM_CREATED',entityType:'TERM',entityId:inserted.rows[0].id,after:inserted.rows[0],req});
      return inserted.rows[0];
    });
    res.status(201).json({ok:true,data:result});
  }));

  router.get('/:id',asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await db.query(
      "SELECT t.*,COALESCE((SELECT json_agg(n.id) FROM conspace.term_niches tn JOIN conspace.niches n ON n.id=tn.niche_id WHERE tn.term_id=t.id),'[]'::json) AS \"nicheIds\" "+
      'FROM conspace.terms t WHERE t.id=$1',[id]
    );
    if(!result.rows[0]) throw new RequestError(404,'NOT_FOUND','Term not found');
    res.json({ok:true,data:result.rows[0]});
  }));

  router.patch('/:id',requireRoles('EDITOR'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const input=validate(termPatch,req.body);
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.terms WHERE id=$1 FOR UPDATE',[id]);
      const before=current.rows[0];
      if(!before) throw new RequestError(404,'NOT_FOUND','Term not found');
      if(!['DRAFT','NEEDS_CHANGES'].includes(before.status)) throw new RequestError(409,'INVALID_STATE','Only draft or returned terms can be edited');
      const updated=await client.query(
        'UPDATE conspace.terms SET term=COALESCE($2,term),slug=COALESCE($3,slug),definition=COALESCE($4,definition),source_ref=COALESCE($5,source_ref),updated_by_user_id=$6,updated_at=now() WHERE id=$1 RETURNING *',
        [id,input.term??null,input.slug??null,input.definition??null,input.sourceRef??null,req.auth.id]
      );
      if(input.nicheIds!==undefined) await replaceNiches(client,id,input.nicheIds);
      await writeAudit(client,{actorUserId:req.auth.id,action:'TERM_UPDATED',entityType:'TERM',entityId:id,before,after:updated.rows[0],req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  router.delete('/:id',requireRoles('EDITOR'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.terms WHERE id=$1 FOR UPDATE',[id]);
      if(!current.rows[0]) throw new RequestError(404,'NOT_FOUND','Term not found');
      if(current.rows[0].status==='PUBLISHED') throw new RequestError(409,'INVALID_STATE','Published terms must be withdrawn by editorial review');
      const updated=await client.query("UPDATE conspace.terms SET status='ARCHIVED',updated_by_user_id=$2,updated_at=now() WHERE id=$1 RETURNING id,status",[id,req.auth.id]);
      await writeAudit(client,{actorUserId:req.auth.id,action:'TERM_ARCHIVED',entityType:'TERM',entityId:id,before:current.rows[0],after:updated.rows[0],req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  router.post('/:id/submit',requireRoles('EDITOR'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.terms WHERE id=$1 FOR UPDATE',[id]);
      const term=current.rows[0];
      if(!term) throw new RequestError(404,'NOT_FOUND','Term not found');
      if(!['DRAFT','NEEDS_CHANGES'].includes(term.status)) throw new RequestError(409,'INVALID_STATE','Term cannot be submitted from its current state');
      if(!term.source_ref) throw new RequestError(409,'SOURCE_REQUIRED','A reviewed source is required before term review');
      const updated=await client.query("UPDATE conspace.terms SET status='SUBMITTED',submitted_at=now(),updated_by_user_id=$2,updated_at=now() WHERE id=$1 RETURNING *",[id,req.auth.id]);
      await writeWorkflowEvent(client,{entityType:'TERM',entityId:id,fromStatus:term.status,toStatus:'SUBMITTED',action:'SUBMIT',actorUserId:req.auth.id});
      await writeAudit(client,{actorUserId:req.auth.id,action:'TERM_SUBMITTED',entityType:'TERM',entityId:id,before:{status:term.status},after:{status:'SUBMITTED'},req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  router.post('/:id/publish',requireRoles('ADMIN','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.terms WHERE id=$1 FOR UPDATE',[id]);
      const term=current.rows[0];
      if(!term) throw new RequestError(404,'NOT_FOUND','Term not found');
      if(term.status!=='APPROVED' || !term.reviewed_by || !term.reviewed_at || !term.source_ref) throw new RequestError(409,'INVALID_STATE','Term needs technical approval and a source before publication');
      const updated=await client.query("UPDATE conspace.terms SET status='PUBLISHED',updated_by_user_id=$2,updated_at=now() WHERE id=$1 RETURNING *",[id,req.auth.id]);
      await writeWorkflowEvent(client,{entityType:'TERM',entityId:id,fromStatus:'APPROVED',toStatus:'PUBLISHED',action:'PUBLISH',actorUserId:req.auth.id});
      await writeAudit(client,{actorUserId:req.auth.id,action:'TERM_PUBLISHED',entityType:'TERM',entityId:id,before:{status:term.status},after:{status:'PUBLISHED'},req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  return router;
}
