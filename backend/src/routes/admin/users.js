import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { RequestError, validate } from '../../http/validation.js';
import { asyncHandler, requireRoles } from '../../middleware/admin-auth.js';
import { hashPassword } from '../../security/password.js';
import { inTransaction, writeAudit } from '../../services/audit.js';

const roles=['ADMIN','EDITOR','TECHNICAL_REVIEWER','EDITOR_IN_CHIEF'];
const createSchema=z.strictObject({
  email:z.string().trim().email().max(254),
  displayName:z.string().trim().min(2).max(120),
  role:z.enum(roles),
  password:z.string().min(14).max(256),
});
const updateSchema=z.strictObject({
  displayName:z.string().trim().min(2).max(120).optional(),
  role:z.enum(roles).optional(),
  isActive:z.boolean().optional(),
  password:z.string().min(14).max(256).optional(),
});

export function createUsersRouter(db=pool){
  const router=Router();
  router.use(requireRoles('ADMIN'));

  router.get('/',asyncHandler(async(req,res)=>{
    const result=await db.query(
      'SELECT id,email,display_name AS "displayName",role,is_active AS "isActive",' +
      'must_change_password AS "mustChangePassword",last_login_at AS "lastLoginAt",created_at AS "createdAt" '+
      'FROM conspace.cms_users ORDER BY created_at DESC'
    );
    res.json({ok:true,data:result.rows});
  }));

  router.post('/',asyncHandler(async(req,res)=>{
    const input=validate(createSchema,req.body);
    const passwordHash=await hashPassword(input.password);
    const user=await inTransaction(db,async(client)=>{
      const result=await client.query(
        'INSERT INTO conspace.cms_users (email,display_name,role,password_hash,created_by_user_id) '+
        'VALUES ($1,$2,$3,$4,$5) RETURNING id,email,display_name AS "displayName",role,is_active AS "isActive",created_at AS "createdAt"',
        [input.email.toLowerCase(),input.displayName,input.role,passwordHash,req.auth.id]
      );
      const row=result.rows[0];
      await client.query(
        'INSERT INTO conspace.authors (slug,display_name,user_id) VALUES ($1,$2,$3)',
        ['staff-'+row.id.replaceAll('-',''),row.displayName,row.id]
      );
      await writeAudit(client,{actorUserId:req.auth.id,action:'CMS_USER_CREATED',entityType:'CMS_USER',entityId:row.id,after:{email:row.email,role:row.role,displayName:row.displayName},req});
      return row;
    });
    res.status(201).json({ok:true,data:user});
  }));

  router.patch('/:id',asyncHandler(async(req,res)=>{
    const input=validate(updateSchema,req.body);
    const passwordHash=input.password ? await hashPassword(input.password) : null;
    const user=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT id,email,display_name,role,is_active FROM conspace.cms_users WHERE id=$1 FOR UPDATE',[req.params.id]);
      const before=current.rows[0];
      if(!before) throw new RequestError(404,'NOT_FOUND','User not found');
      const nextRole=input.role ?? before.role;
      const nextActive=input.isActive ?? before.is_active;
      if(before.role==='ADMIN' && before.is_active && (nextRole!=='ADMIN' || !nextActive)){
        const others=await client.query("SELECT count(*)::integer AS total FROM conspace.cms_users WHERE role='ADMIN' AND is_active=true AND id<>$1",[before.id]);
        if(others.rows[0].total===0) throw new RequestError(409,'LAST_ADMIN','Cannot disable or demote the last active admin');
      }
      const result=await client.query(
        'UPDATE conspace.cms_users SET display_name=COALESCE($2,display_name),role=$3,is_active=$4,'+
        'password_hash=COALESCE($5,password_hash),must_change_password=CASE WHEN $5::text IS NULL THEN must_change_password ELSE true END,updated_at=now() '+
        'WHERE id=$1 RETURNING id,email,display_name AS "displayName",role,is_active AS "isActive",must_change_password AS "mustChangePassword"',
        [before.id,input.displayName ?? null,nextRole,nextActive,passwordHash]
      );
      if(!nextActive || input.role || input.password) await client.query('DELETE FROM conspace.cms_sessions WHERE user_id=$1',[before.id]);
      const after=result.rows[0];
      await writeAudit(client,{actorUserId:req.auth.id,action:'CMS_USER_UPDATED',entityType:'CMS_USER',entityId:before.id,before:{role:before.role,isActive:before.is_active,displayName:before.display_name},after:{role:after.role,isActive:after.isActive,displayName:after.displayName,passwordReset:Boolean(passwordHash)},req});
      return after;
    });
    res.json({ok:true,data:user});
  }));

  return router;
}
