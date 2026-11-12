import { Router } from 'express';
import { decodeUpload } from '../../services/uploads.js';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { RequestError, validate } from '../../http/validation.js';
import { asyncHandler, requireRoles } from '../../middleware/admin-auth.js';
import { createMediaService } from '../../services/media.js';
import { inTransaction, writeAudit } from '../../services/audit.js';

const uuid=z.string().uuid();

export function createMediaRouter(db=pool,mediaService=createMediaService(db)){
  const router=Router();
  router.use(requireRoles('ADMIN','EDITOR','TECHNICAL_REVIEWER','EDITOR_IN_CHIEF'));

  router.get('/',asyncHandler(async(req,res)=>{
    const query=validate(z.strictObject({
      category:z.enum(['IMAGE','DOCUMENT']).optional(),
      page:z.coerce.number().int().min(1).default(1),
      limit:z.coerce.number().int().min(1).max(100).default(30),
    }),req.query);
    const result=await db.query(
      'SELECT m.id,m.original_filename AS "originalFilename",m.mime_type AS "mimeType",m.size_bytes AS "sizeBytes",'+
      'm.category,m.alt_text AS "altText",m.rights_confirmed AS "rightsConfirmed",m.rights_note AS "rightsNote",'+
      'm.created_at AS "createdAt",u.display_name AS "uploadedBy" FROM conspace.media_assets m '+
      'LEFT JOIN conspace.cms_users u ON u.id=m.uploaded_by_user_id WHERE m.deleted_at IS NULL AND ($1::text IS NULL OR m.category=$1) '+
      'ORDER BY m.created_at DESC LIMIT $2 OFFSET $3',
      [query.category??null,query.limit,(query.page-1)*query.limit]
    );
    res.json({ok:true,data:result.rows});
  }));

  router.post('/',requireRoles('EDITOR','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
    if(!req.body?.file) throw new RequestError(400,'FILE_REQUIRED','Upload one file in JSON field "file"');
    const file=decodeUpload(req.body.file);
    const rightsConfirmed=req.body.rightsConfirmed===true;
    if(rightsConfirmed && !String(req.body.rightsNote||'').trim()) throw new RequestError(400,'RIGHTS_NOTE_REQUIRED','A rights note is required when confirming usage rights');
    const item=await mediaService.save(file,req.auth.id,{
      rightsConfirmed,rightsNote:req.body.rightsNote||null,altText:req.body.altText||null,
    });
    await db.query(
      'INSERT INTO conspace.audit_logs (actor_user_id,action,entity_type,entity_id,after_data,request_ip,user_agent) '+
      "VALUES ($1,'MEDIA_UPLOADED','MEDIA',$2,$3::jsonb,$4::inet,$5)",
      [req.auth.id,item.id,JSON.stringify({mimeType:item.mimeType,sizeBytes:item.sizeBytes,rightsConfirmed}),req.ip,req.get('user-agent')||null]
    );
    res.status(201).json({ok:true,data:item});
  }));

  router.get('/:id/download',asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const file=await mediaService.read(id);
    const filename=String(file.originalFilename).replace(/["\r\n]/g,'_');
    res.setHeader('Content-Type',file.mimeType);
    res.setHeader('Content-Length',file.buffer.length);
    res.setHeader('Content-Disposition','attachment; filename="' + filename + '"');
    res.send(file.buffer);
  }));

  router.patch('/:id',requireRoles('EDITOR','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const input=validate(z.strictObject({
      altText:z.string().max(500).nullable().optional(),
      rightsConfirmed:z.boolean().optional(),
      rightsNote:z.string().max(2000).nullable().optional(),
    }),req.body);
    if(input.rightsConfirmed===true && !String(input.rightsNote||'').trim()) throw new RequestError(400,'RIGHTS_NOTE_REQUIRED','A rights note is required when confirming usage rights');
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.media_assets WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id]);
      if(!current.rows[0]) throw new RequestError(404,'NOT_FOUND','Media not found');
      const before=current.rows[0];
      const updated=await client.query(
        'UPDATE conspace.media_assets SET alt_text=COALESCE($2,alt_text),rights_confirmed=COALESCE($3,rights_confirmed),rights_note=COALESCE($4,rights_note) WHERE id=$1 RETURNING id,alt_text AS "altText",rights_confirmed AS "rightsConfirmed",rights_note AS "rightsNote"',
        [id,input.altText??null,input.rightsConfirmed??null,input.rightsNote??null]
      );
      await writeAudit(client,{actorUserId:req.auth.id,action:'MEDIA_METADATA_UPDATED',entityType:'MEDIA',entityId:id,before:{rightsConfirmed:before.rights_confirmed,altText:before.alt_text},after:updated.rows[0],req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  router.delete('/:id',requireRoles('EDITOR','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.media_assets WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id]);
      if(!current.rows[0]) throw new RequestError(404,'NOT_FOUND','Media not found');
      const linked=await client.query(
        "SELECT EXISTS(SELECT 1 FROM conspace.article_media am JOIN conspace.articles a ON a.id=am.article_id WHERE am.media_id=$1 AND a.status='PUBLISHED') OR "+
        "EXISTS(SELECT 1 FROM conspace.field_note_media fm JOIN conspace.field_notes f ON f.id=fm.field_note_id JOIN conspace.articles a ON a.id=f.article_id WHERE fm.media_id=$1 AND a.status='PUBLISHED') AS used_publicly",
        [id]
      );
      if(linked.rows[0].used_publicly) throw new RequestError(409,'MEDIA_IN_USE','Media linked to published content cannot be deleted');
      await client.query('UPDATE conspace.media_assets SET deleted_at=now() WHERE id=$1',[id]);
      await writeAudit(client,{actorUserId:req.auth.id,action:'MEDIA_DELETED',entityType:'MEDIA',entityId:id,before:{storageKey:current.rows[0].storage_key},after:{deleted:true},req});
      return {id,deleted:true};
    });
    res.json({ok:true,data:result});
  }));

  return router;
}
