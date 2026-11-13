import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { RequestError, validate } from '../../http/validation.js';
import { asyncHandler, requireRoles } from '../../middleware/admin-auth.js';
import { hashPassword } from '../../security/password.js';
import { inTransaction, writeAudit } from '../../services/audit.js';

const roles=['ADMIN','EDITOR','TECHNICAL_REVIEWER','EDITOR_IN_CHIEF'];
const permissionValues=['CONTENT_PUBLISH','CONTENT_WITHDRAW'];
const roleSchema=z.enum(roles);
const permissionSchema=z.enum(permissionValues);
const roleList=z.array(roleSchema).min(1).max(4).refine(values=>new Set(values).size===values.length);
const permissionList=z.array(permissionSchema).max(2).refine(values=>new Set(values).size===values.length);
const createSchema=z.strictObject({
  email:z.string().trim().email().max(254),displayName:z.string().trim().min(2).max(120),
  role:roleSchema,roles:roleList.optional(),roleReason:z.string().trim().min(3).max(500).optional(),
  personId:z.string().uuid().optional(),identityReason:z.string().trim().min(3).max(500).optional(),permissions:permissionList.optional(),
  permissionReason:z.string().trim().min(3).max(500).optional(),password:z.string().min(14).max(256),
}).superRefine((v,ctx)=>{
  if(new Set([v.role,...(v.roles??[])]).size>1&&!v.roleReason)ctx.addIssue({code:'custom',path:['roleReason'],message:'A reason is required for additional role assignments'});
  if(v.personId&&!v.identityReason)ctx.addIssue({code:'custom',path:['identityReason'],message:'A reason is required when linking an existing staff identity'});
  if((v.permissions??[]).length&&!v.permissionReason)ctx.addIssue({code:'custom',path:['permissionReason'],message:'A reason is required for delegated permissions'});
});
const updateSchema=z.strictObject({
  displayName:z.string().trim().min(2).max(120).optional(),role:roleSchema.optional(),
  roles:roleList.optional(),roleReason:z.string().trim().min(3).max(500).optional(),
  personId:z.string().uuid().optional(),identityReason:z.string().trim().min(3).max(500).optional(),permissions:permissionList.optional(),
  permissionReason:z.string().trim().min(3).max(500).optional(),
  isActive:z.boolean().optional(),password:z.string().min(14).max(256).optional(),
}).superRefine((v,ctx)=>{
  if((v.role!==undefined||v.roles!==undefined)&&!v.roleReason)ctx.addIssue({code:'custom',path:['roleReason'],message:'A reason is required when changing role assignments'});
  if(v.personId!==undefined&&!v.identityReason)ctx.addIssue({code:'custom',path:['identityReason'],message:'A reason is required when changing staff identity linkage'});
  if(v.permissions!==undefined&&!v.permissionReason)ctx.addIssue({code:'custom',path:['permissionReason'],message:'A reason is required when changing delegated permissions'});
});
const roleSql="COALESCE((SELECT json_agg(r.role ORDER BY r.role) FROM conspace.cms_user_roles r WHERE r.user_id=u.id),'[]'::json) AS roles";
const permissionSql="COALESCE((SELECT json_agg(p.permission ORDER BY p.permission) FROM conspace.cms_user_permissions p WHERE p.user_id=u.id),'[]'::json) AS permissions";
const roleAssignmentSql="COALESCE((SELECT json_agg(json_build_object('role',r.role,'grantSource',r.grant_source,'grantReason',r.grant_reason,'legacyCompat',r.legacy_compat,'grantedAt',r.created_at,'grantedBy',g.display_name) ORDER BY r.role) FROM conspace.cms_user_roles r LEFT JOIN conspace.cms_users g ON g.id=r.granted_by_user_id WHERE r.user_id=u.id),'[]'::json) AS \"roleAssignments\"";
const permissionAssignmentSql="COALESCE((SELECT json_agg(json_build_object('permission',p.permission,'grantReason',p.grant_reason,'grantedAt',p.created_at,'grantedBy',g.display_name) ORDER BY p.permission) FROM conspace.cms_user_permissions p LEFT JOIN conspace.cms_users g ON g.id=p.granted_by_user_id WHERE p.user_id=u.id),'[]'::json) AS \"permissionAssignments\"";
const sessionSql="(SELECT count(*)::integer FROM conspace.cms_sessions s WHERE s.user_id=u.id AND s.expires_at>now()) AS \"activeSessionCount\"";

export function createUsersRouter(db=pool){
  const router=Router();router.use(requireRoles('ADMIN'));
  router.get('/',asyncHandler(async(_req,res)=>{
    const result=await db.query('SELECT u.id,u.email,u.display_name AS "displayName",u.role,u.person_id AS "personId",u.is_active AS "isActive",u.must_change_password AS "mustChangePassword",u.last_login_at AS "lastLoginAt",u.created_at AS "createdAt",'+roleSql+','+permissionSql+','+roleAssignmentSql+','+permissionAssignmentSql+','+sessionSql+' FROM conspace.cms_users u ORDER BY u.created_at DESC');
    res.json({ok:true,data:result.rows});
  }));
  router.post('/',asyncHandler(async(req,res)=>{
    const input=validate(createSchema,req.body);
    const assigned=[...new Set([input.role,...(input.roles??[])])];
    const assignedPermissions=input.permissions??[];
    const passwordHash=await hashPassword(input.password);
    const user=await inTransaction(db,async(client)=>{
      const actor=await client.query('SELECT person_id FROM conspace.cms_users WHERE id=$1',[req.auth.id]);
      if(input.personId&&input.personId===actor.rows[0]?.person_id&&(assigned.some(x=>x!=='ADMIN')||assignedPermissions.length)){
        throw new RequestError(403,'SELF_IDENTITY_CHANGE','An administrator cannot create a more privileged account linked to their own identity');
      }
      const result=await client.query('INSERT INTO conspace.cms_users(email,display_name,role,password_hash,created_by_user_id,person_id) VALUES($1,$2,$3,$4,$5,COALESCE($6,gen_random_uuid())) RETURNING id,email,display_name AS "displayName",role,person_id AS "personId",is_active AS "isActive",created_at AS "createdAt"',
        [input.email.toLowerCase(),input.displayName,input.role,passwordHash,req.auth.id,input.personId??null]);
      const row=result.rows[0],roleReason=input.roleReason??'Primary role assigned at account creation';
      for(const role of assigned)await client.query("INSERT INTO conspace.cms_user_roles(user_id,role,granted_by_user_id,grant_source,grant_reason) VALUES($1,$2,$3,'ADMIN_ASSIGNMENT',$4)",[row.id,role,req.auth.id,roleReason]);
      for(const permission of assignedPermissions)await client.query('INSERT INTO conspace.cms_user_permissions(user_id,permission,granted_by_user_id,grant_reason) VALUES($1,$2,$3,$4)',[row.id,permission,req.auth.id,input.permissionReason]);
      await client.query('INSERT INTO conspace.authors(slug,display_name,user_id) VALUES($1,$2,$3)',['staff-'+row.id.replaceAll('-',''),row.displayName,row.id]);
      await writeAudit(client,{actorUserId:req.auth.id,action:'CMS_USER_CREATED',entityType:'CMS_USER',entityId:row.id,after:{email:row.email,role:row.role,roles:assigned,permissions:assignedPermissions,personId:row.personId,roleReason,identityReason:input.identityReason??null,permissionReason:input.permissionReason??null},req});
      return {...row,roles:assigned,permissions:assignedPermissions};
    });
    res.status(201).json({ok:true,data:user});
  }));
  router.patch('/:id',asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:z.string().uuid()}),req.params).id;
    const input=validate(updateSchema,req.body),passwordHash=input.password?await hashPassword(input.password):null;
    const user=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT u.id,u.email,u.display_name,u.role,u.person_id,u.is_active,'+roleSql+','+permissionSql+' FROM conspace.cms_users u WHERE u.id=$1 FOR UPDATE',[id]);
      const before=current.rows[0];if(!before)throw new RequestError(404,'NOT_FOUND','User not found');
      const existingRoles=Array.isArray(before.roles)?before.roles:[before.role],existingPermissions=Array.isArray(before.permissions)?before.permissions:[];
      const nextPrimary=input.role??before.role;
      const nextRoles=input.roles!==undefined?[...new Set([nextPrimary,...input.roles])]:input.role!==undefined?[...new Set([...existingRoles.filter(x=>x!==before.role),nextPrimary])]:existingRoles;
      const nextPermissions=input.permissions!==undefined?input.permissions:existingPermissions;
      const nextActive=input.isActive??before.is_active,nextPerson=input.personId??before.person_id;
      const addedRoles=nextRoles.filter(x=>!existingRoles.includes(x)),addedPermissions=nextPermissions.filter(x=>!existingPermissions.includes(x));
      const actor=await client.query('SELECT person_id FROM conspace.cms_users WHERE id=$1',[req.auth.id]);
      if(req.auth.id===before.id&&input.personId!==undefined&&input.personId!==before.person_id)throw new RequestError(403,'SELF_IDENTITY_CHANGE','An administrator cannot change their own staff identity');
      if(before.id!==req.auth.id&&nextPerson===actor.rows[0]?.person_id)throw new RequestError(403,'SELF_IDENTITY_CHANGE','An administrator cannot link another account to their own staff identity');
      if(req.auth.id===before.id&&addedRoles.length)throw new RequestError(403,'SELF_ROLE_ESCALATION','An administrator cannot grant additional roles to their own account');
      if(req.auth.id===before.id&&addedPermissions.length)throw new RequestError(403,'SELF_PERMISSION_ESCALATION','An administrator cannot delegate publishing permissions to their own account');
      if(existingRoles.includes('ADMIN')&&before.is_active&&(!nextRoles.includes('ADMIN')||!nextActive)){
        const others=await client.query("SELECT count(*)::integer AS total FROM conspace.cms_user_roles r JOIN conspace.cms_users u ON u.id=r.user_id WHERE r.role='ADMIN' AND u.is_active=true AND u.id<>$1",[before.id]);
        if(others.rows[0].total===0)throw new RequestError(409,'LAST_ADMIN','Cannot disable or remove the last active ADMIN membership');
      }
      if(input.roles!==undefined||input.role!==undefined){
        await client.query('DELETE FROM conspace.cms_user_roles WHERE user_id=$1 AND NOT(role=ANY($2::text[]))',[before.id,nextRoles]);
        for(const role of addedRoles)await client.query("INSERT INTO conspace.cms_user_roles(user_id,role,granted_by_user_id,grant_source,grant_reason) VALUES($1,$2,$3,'ADMIN_ASSIGNMENT',$4) ON CONFLICT(user_id,role) DO NOTHING",[before.id,role,req.auth.id,input.roleReason]);
      }
      if(input.permissions!==undefined){
        await client.query('DELETE FROM conspace.cms_user_permissions WHERE user_id=$1 AND NOT(permission=ANY($2::text[]))',[before.id,nextPermissions]);
        for(const permission of addedPermissions)await client.query('INSERT INTO conspace.cms_user_permissions(user_id,permission,granted_by_user_id,grant_reason) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,permission) DO NOTHING',[before.id,permission,req.auth.id,input.permissionReason]);
      }
      const result=await client.query('UPDATE conspace.cms_users SET display_name=COALESCE($2,display_name),role=$3,is_active=$4,person_id=$5,password_hash=COALESCE($6,password_hash),must_change_password=CASE WHEN $6::text IS NULL THEN must_change_password ELSE true END,updated_at=now() WHERE id=$1 RETURNING id,email,display_name AS "displayName",role,person_id AS "personId",is_active AS "isActive",must_change_password AS "mustChangePassword"',
        [before.id,input.displayName??null,nextPrimary,nextActive,nextPerson,passwordHash]);
      if(!nextActive||input.role!==undefined||input.roles!==undefined||input.personId!==undefined||input.permissions!==undefined||input.password)await client.query('DELETE FROM conspace.cms_sessions WHERE user_id=$1',[before.id]);
      const after=result.rows[0];
      await writeAudit(client,{actorUserId:req.auth.id,action:'CMS_USER_UPDATED',entityType:'CMS_USER',entityId:before.id,
        before:{role:before.role,roles:existingRoles,permissions:existingPermissions,isActive:before.is_active,personId:before.person_id},
        after:{role:after.role,roles:nextRoles,permissions:nextPermissions,isActive:after.isActive,personId:after.personId,passwordReset:Boolean(passwordHash),roleReason:input.roleReason??null,identityReason:input.identityReason??null,permissionReason:input.permissionReason??null},req});
      return {...after,roles:nextRoles,permissions:nextPermissions};
    });
    res.json({ok:true,data:user});
  }));
  router.post('/:id/revoke-sessions',asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:z.string().uuid()}),req.params).id;
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT id,email,display_name AS "displayName" FROM conspace.cms_users WHERE id=$1 FOR UPDATE',[id]);
      if(!current.rows[0]) throw new RequestError(404,'NOT_FOUND','User not found');
      const sessions=await client.query('DELETE FROM conspace.cms_sessions WHERE user_id=$1',[id]);
      await writeAudit(client,{actorUserId:req.auth.id,action:'CMS_USER_SESSIONS_REVOKED',entityType:'CMS_USER',entityId:id,after:{revokedSessions:sessions.rowCount},req});
      return {id,revokedSessions:sessions.rowCount};
    });
    res.json({ok:true,data:result});
  }));

  return router;
}
