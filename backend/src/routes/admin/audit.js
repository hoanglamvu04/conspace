import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { validate } from '../../http/validation.js';
import { asyncHandler, requireRoles } from '../../middleware/admin-auth.js';

const uuid=z.string().uuid();

export function createAuditRouter(db=pool){
  const router=Router();
  router.use(requireRoles('ADMIN','EDITOR','TECHNICAL_REVIEWER','EDITOR_IN_CHIEF'));

  router.get('/',asyncHandler(async(req,res)=>{
    const query=validate(z.strictObject({
      entityType:z.string().trim().max(80).optional(),
      entityId:uuid.optional(),
      action:z.string().trim().max(120).optional(),
      page:z.coerce.number().int().min(1).default(1),
      limit:z.coerce.number().int().min(1).max(100).default(30),
    }),req.query);
    const offset=(query.page-1)*query.limit;
    const params=[query.entityType??null,query.entityId??null,query.action??null,query.limit,offset];
    const base=`
      WITH events AS (
        SELECT 'AUDIT'::text AS "eventType",a.id::text AS id,a.entity_type AS "entityType",a.entity_id AS "entityId",
          a.action,NULL::text AS "fromStatus",NULL::text AS "toStatus",NULL::text AS reason,
          a.before_data AS "beforeData",a.after_data AS "afterData",'{}'::jsonb AS metadata,
          a.created_at AS "createdAt",u.id AS "actorUserId",u.display_name AS "actorName",u.email AS "actorEmail"
        FROM conspace.audit_logs a LEFT JOIN conspace.cms_users u ON u.id=a.actor_user_id
        UNION ALL
        SELECT 'WORKFLOW'::text,w.id::text,w.entity_type,w.entity_id,w.action,w.from_status,w.to_status,w.reason,
          NULL::jsonb,NULL::jsonb,w.metadata,w.created_at,u.id,u.display_name,u.email
        FROM conspace.workflow_events w LEFT JOIN conspace.cms_users u ON u.id=w.actor_user_id
      )
    `;
    const where=`
      WHERE ($1::text IS NULL OR "entityType"=$1)
        AND ($2::uuid IS NULL OR "entityId"=$2)
        AND ($3::text IS NULL OR action ILIKE '%' || $3 || '%')
    `;
    const result=await db.query(
      base+`SELECT * FROM events ${where} ORDER BY "createdAt" DESC,id DESC LIMIT $4 OFFSET $5`,
      params
    );
    const count=await db.query(
      base+`SELECT count(*)::integer AS total FROM events ${where}`,
      params.slice(0,3)
    );
    res.json({ok:true,data:result.rows,meta:{total:count.rows[0].total,page:query.page,limit:query.limit}});
  }));

  return router;
}
