import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { RequestError, validate } from '../../http/validation.js';
import { asyncHandler, requireRoles } from '../../middleware/admin-auth.js';
import { decryptPrivateContact } from '../../security/private-contact.js';
import { inTransaction, writeAudit, writeWorkflowEvent } from '../../services/audit.js';

const uuid=z.string().uuid();
const type=z.enum(['PROJECT','ARCHITECT','CONTRACTOR','JOIN']);
const status=z.enum(['SUBMITTED','IN_REVIEW','CLOSED','REJECTED']);

export function createConnectionsRouter(db=pool,config){
  const router=Router();
  router.use(requireRoles('ADMIN','EDITOR'));

  router.get('/',asyncHandler(async(req,res)=>{
    const query=validate(z.strictObject({
      status:status.optional(),
      type:type.optional(),
      search:z.string().trim().max(120).optional(),
      page:z.coerce.number().int().min(1).default(1),
      limit:z.coerce.number().int().min(1).max(100).default(30),
    }),req.query);
    const offset=(query.page-1)*query.limit;
    const params=[query.status??null,query.type??null,query.search??null,query.limit,offset];
    const where="WHERE ($1::text IS NULL OR c.status=$1) AND ($2::text IS NULL OR c.intake_type=$2) "+
      "AND ($3::text IS NULL OR c.description ILIKE '%'||$3||'%' OR c.region ILIKE '%'||$3||'%' OR n.name ILIKE '%'||$3||'%')";
    const [rows,count]=await Promise.all([
      db.query(
        'SELECT c.id,c.intake_type AS "type",c.description,c.region,c.status,c.created_at AS "createdAt",c.updated_at AS "updatedAt",'+
        'n.slug AS "nicheSlug",n.name AS "nicheName",u.display_name AS "updatedBy" '+
        'FROM conspace.connection_intakes c LEFT JOIN conspace.niches n ON n.id=c.niche_id '+
        'LEFT JOIN conspace.cms_users u ON u.id=c.updated_by_user_id '+where+
        ' ORDER BY c.created_at DESC,c.id DESC LIMIT $4 OFFSET $5',
        params
      ),
      db.query(
        'SELECT count(*)::integer AS total FROM conspace.connection_intakes c LEFT JOIN conspace.niches n ON n.id=c.niche_id '+where,
        params.slice(0,3)
      ),
    ]);
    res.json({ok:true,data:rows.rows,meta:{total:count.rows[0].total,page:query.page,limit:query.limit}});
  }));

  router.get('/:id',asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await db.query(
      'SELECT c.*,c.intake_type AS "type",c.moderation_note AS "moderationNote",c.created_at AS "createdAt",c.updated_at AS "updatedAt",'+
      'n.slug AS "nicheSlug",n.name AS "nicheName" FROM conspace.connection_intakes c '+
      'LEFT JOIN conspace.niches n ON n.id=c.niche_id WHERE c.id=$1',
      [id]
    );
    const row=result.rows[0];
    if(!row) throw new RequestError(404,'NOT_FOUND','Connection intake not found');
    try{
      row.privateContact=decryptPrivateContact({
        ciphertext:row.contact_ciphertext,iv:row.contact_iv,authTag:row.contact_auth_tag,
      },config.contactEncryptionKey);
    }catch{
      throw new RequestError(503,'PRIVATE_CONTACT_UNAVAILABLE','Private contact cannot be decrypted');
    }
    await writeAudit(db,{
      actorUserId:req.auth.id,
      action:'PRIVATE_CONTACT_ACCESSED',
      entityType:'CONNECTION_INTAKE',
      entityId:id,
      after:{type:row.type},
      req,
    });
    delete row.contact_ciphertext;
    delete row.contact_iv;
    delete row.contact_auth_tag;
    res.json({ok:true,data:row});
  }));

  router.patch('/:id',requireRoles('EDITOR'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const input=validate(z.strictObject({
      status:status.optional(),
      moderationNote:z.string().trim().min(3).max(2000).nullable().optional(),
    }),req.body);
    if(input.status===undefined&&input.moderationNote===undefined){
      throw new RequestError(400,'VALIDATION_ERROR','At least one triage field is required');
    }
    const updated=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.connection_intakes WHERE id=$1 FOR UPDATE',[id]);
      const before=current.rows[0];
      if(!before) throw new RequestError(404,'NOT_FOUND','Connection intake not found');
      const next=await client.query(
        'UPDATE conspace.connection_intakes SET status=COALESCE($2,status),moderation_note=CASE WHEN $3::boolean THEN $4 ELSE moderation_note END,'+
        'updated_by_user_id=$5,updated_at=now() WHERE id=$1 '+
        'RETURNING id,intake_type AS "type",status,moderation_note AS "moderationNote",updated_at AS "updatedAt"',
        [id,input.status??null,input.moderationNote!==undefined,input.moderationNote??null,req.auth.id]
      );
      const row=next.rows[0];
      await writeWorkflowEvent(client,{
        entityType:'CONNECTION_INTAKE',entityId:id,fromStatus:before.status,toStatus:row.status,
        action:'TRIAGE',reason:input.moderationNote??null,actorUserId:req.auth.id,
      });
      await writeAudit(client,{
        actorUserId:req.auth.id,action:'CONNECTION_INTAKE_TRIAGED',entityType:'CONNECTION_INTAKE',entityId:id,
        before:{status:before.status,moderationNote:before.moderation_note},
        after:{status:row.status,moderationNote:row.moderationNote},req,
      });
      return row;
    });
    res.json({ok:true,data:updated});
  }));

  return router;
}
