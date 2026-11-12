import { Router } from 'express';
import { z } from 'zod';
import { RequestError, validate } from '../../http/validation.js';
import { requireAuth, requireCsrf, readCookie, setSessionCookie, clearSessionCookie } from '../../middleware/admin-auth.js';
import { verifyPassword, hashPassword } from '../../security/password.js';
import { writeAudit, inTransaction } from '../../services/audit.js';

const loginSchema = z.strictObject({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
});
const passwordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(14).max(256),
});

function trustedOrigin(req, config) {
  const origin = req.get('origin');
  const allowed = new Set([config.publicOrigin, ...config.corsOrigins].filter(Boolean));
  if ((origin && !allowed.has(origin)) || (!origin && config.nodeEnv === 'production')) {
    throw new RequestError(403,'ORIGIN_FORBIDDEN','Request origin is not allowed');
  }
}

export function createAdminAuthRouter({ authService, db, config }) {
  const router = Router();

  router.post('/login', async (req,res,next) => {
    try {
      trustedOrigin(req,config);
      const input=validate(loginSchema,req.body);
      const result=await authService.login({
        ...input,ip:req.ip,userAgent:req.get('user-agent'),
      });
      setSessionCookie(res,result.token,result.expiresAt);
      res.json({ok:true,data:{user:result.user,csrfToken:result.csrfToken,expiresAt:result.expiresAt}});
    } catch(error) { next(error); }
  });

  router.get('/session',requireAuth(authService),(req,res)=>{
    res.json({ok:true,data:{user:req.auth,csrfToken:req.session.csrfToken,expiresAt:req.session.expiresAt}});
  });

  router.post('/logout',requireAuth(authService),requireCsrf,async(req,res,next)=>{
    try {
      await authService.logout(req.sessionToken);
      clearSessionCookie(res);
      res.json({ok:true,data:{loggedOut:true}});
    } catch(error) { next(error); }
  });

  router.post('/password',requireAuth(authService),requireCsrf,async(req,res,next)=>{
    try {
      const input=validate(passwordSchema,req.body);
      const result=await db.query('SELECT password_hash FROM conspace.cms_users WHERE id=$1 AND is_active=true',[req.auth.id]);
      if(!result.rows[0] || !(await verifyPassword(input.currentPassword,result.rows[0].password_hash))) {
        throw new RequestError(400,'CURRENT_PASSWORD_INVALID','Current password is incorrect');
      }
      const passwordHash=await hashPassword(input.newPassword);
      await inTransaction(db,async(client)=>{
        await client.query('UPDATE conspace.cms_users SET password_hash=$2,must_change_password=false,updated_at=now() WHERE id=$1',[req.auth.id,passwordHash]);
        await client.query('DELETE FROM conspace.cms_sessions WHERE user_id=$1 AND token_hash<>$2',[req.auth.id,req.session.sessionTokenHash]);
        await writeAudit(client,{actorUserId:req.auth.id,action:'PASSWORD_CHANGED',entityType:'CMS_USER',entityId:req.auth.id,req});
      });
      res.json({ok:true,data:{passwordChanged:true}});
    } catch(error) { next(error); }
  });

  return router;
}
