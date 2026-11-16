import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { RequestError, validate } from '../../http/validation.js';
import { asyncHandler, requireRoles } from '../../middleware/admin-auth.js';
import { inTransaction, writeAudit } from '../../services/audit.js';

const uuid=z.string().uuid();
const authorSchema=z.strictObject({
  slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  displayName:z.string().trim().min(1).max(160),
  bio:z.string().max(5000).nullable().optional(),
});
const authorPatch=authorSchema.partial().extend({
  verified:z.boolean().optional(),
  active:z.boolean().optional(),
});

export function createAuthorsRouter(db=pool){
  const router=Router();
  const rolesOf=(req)=>Array.isArray(req.auth?.roles)&&req.auth.roles.length?req.auth.roles:[req.auth?.role].filter(Boolean);
  const hasRole=(req,role)=>rolesOf(req).includes(role);

  router.get('/',requireRoles('ADMIN','EDITOR','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
    const result=await db.query(
      'SELECT a.id,a.slug,a.display_name AS "displayName",a.bio,a.verified,a.active,a.user_id AS "userId",' +
      'u.email AS "accountEmail",a.created_at AS "createdAt",a.updated_at AS "updatedAt",' +
      '(SELECT count(*)::integer FROM conspace.articles ar WHERE ar.author_id=a.id) AS "articleCount",' +
      "(SELECT count(*)::integer FROM conspace.articles ar WHERE ar.author_id=a.id AND ar.status='PUBLISHED') AS \"publishedCount\" " +
      'FROM conspace.authors a LEFT JOIN conspace.cms_users u ON u.id=a.user_id ORDER BY a.display_name'
    );
    res.json({ok:true,data:result.rows});
  }));

  router.post('/',requireRoles('EDITOR','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
    const input=validate(authorSchema,req.body);
    const result=await inTransaction(db,async(client)=>{
      const inserted=await client.query(
        'INSERT INTO conspace.authors (slug,display_name,bio) VALUES ($1,$2,$3) RETURNING id,slug,display_name AS "displayName",bio,verified,active',
        [input.slug,input.displayName,input.bio??null]
      );
      await writeAudit(client,{actorUserId:req.auth.id,action:'AUTHOR_CREATED',entityType:'AUTHOR',entityId:inserted.rows[0].id,after:inserted.rows[0],req});
      return inserted.rows[0];
    });
    res.status(201).json({ok:true,data:result});
  }));

  router.patch('/:id',requireRoles('ADMIN','EDITOR','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const input=validate(authorPatch,req.body);
    const isAdmin=hasRole(req,'ADMIN');
    const isEditorial=hasRole(req,'EDITOR')||hasRole(req,'EDITOR_IN_CHIEF');
    if(input.verified!==undefined && !isAdmin) throw new RequestError(403,'FORBIDDEN','Only admin can change author verification');
    if(['slug','displayName','bio','active'].some(key=>input[key]!==undefined) && !isEditorial) throw new RequestError(403,'FORBIDDEN','Only editorial staff can change author profile fields');
    if(!Object.keys(input).length) throw new RequestError(400,'EMPTY_UPDATE','At least one author field is required');
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.authors WHERE id=$1 FOR UPDATE',[id]);
      if(!current.rows[0]) throw new RequestError(404,'NOT_FOUND','Author not found');
      const before=current.rows[0];
      const updated=await client.query(
        'UPDATE conspace.authors SET slug=COALESCE($2,slug),display_name=COALESCE($3,display_name),'+
        'bio=CASE WHEN $4::boolean THEN $5 ELSE bio END,verified=COALESCE($6,verified),active=COALESCE($7,active),updated_at=now() WHERE id=$1 '+
        'RETURNING id,slug,display_name AS "displayName",bio,verified,active,user_id AS "userId"',
        [id,input.slug??null,input.displayName??null,input.bio!==undefined,input.bio??null,input.verified??null,input.active??null]
      );
      await writeAudit(client,{actorUserId:req.auth.id,action:'AUTHOR_UPDATED',entityType:'AUTHOR',entityId:id,before,after:updated.rows[0],req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  router.delete('/:id',requireRoles('EDITOR','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.authors WHERE id=$1 FOR UPDATE',[id]);
      if(!current.rows[0]) throw new RequestError(404,'NOT_FOUND','Author not found');
      const updated=await client.query('UPDATE conspace.authors SET active=false,verified=false,updated_at=now() WHERE id=$1 RETURNING id,active,verified',[id]);
      await writeAudit(client,{actorUserId:req.auth.id,action:'AUTHOR_DEACTIVATED',entityType:'AUTHOR',entityId:id,before:current.rows[0],after:updated.rows[0],req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  return router;
}
