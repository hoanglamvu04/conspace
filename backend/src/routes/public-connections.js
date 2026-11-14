import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database/pool.js';
import { RequestError, validate } from '../http/validation.js';
import { asyncHandler } from '../middleware/admin-auth.js';
import { encryptPrivateContact } from '../security/private-contact.js';
import { inTransaction, writeAudit } from '../services/audit.js';

const submissionSchema=z.strictObject({
  type:z.enum(['project','architect','contractor','join']),
  description:z.string().trim().min(20).max(5000),
  region:z.string().trim().min(2).max(160).nullable().optional(),
  nicheId:z.string().uuid().nullable().optional(),
  contact:z.string().trim().min(6).max(200),
});
const TYPE_MAP=Object.freeze({
  project:'PROJECT',
  architect:'ARCHITECT',
  contractor:'CONTRACTOR',
  join:'JOIN',
});

export function createPublicConnectionsRouter(db=pool){
  const router=Router();
  if(!db){
    router.use((_req,_res,next)=>next(new RequestError(503,'DATABASE_UNAVAILABLE','Connection intake is temporarily unavailable')));
    return router;
  }

  router.post('/',asyncHandler(async(req,res)=>{
    const input=validate(submissionSchema,req.body);
    let encrypted;
    try { encrypted=encryptPrivateContact(input.contact); }
    catch { throw new RequestError(503,'PRIVATE_CONTACT_UNAVAILABLE','Private contact intake is temporarily unavailable'); }

    if(input.nicheId){
      const niche=await db.query('SELECT id FROM conspace.niches WHERE id=$1 AND is_active=true',[input.nicheId]);
      if(!niche.rows[0]) throw new RequestError(400,'INVALID_NICHE','Selected niche is unavailable');
    }

    const saved=await inTransaction(db,async(client)=>{
      const inserted=await client.query(
        'INSERT INTO conspace.connection_intakes(intake_type,description,region,niche_id,contact_ciphertext,contact_iv,contact_auth_tag) '+
        'VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status,created_at AS "createdAt"',
        [
          TYPE_MAP[input.type],input.description,input.region??null,input.nicheId??null,
          encrypted.ciphertext,encrypted.iv,encrypted.authTag,
        ]
      );
      await writeAudit(client,{
        action:'PUBLIC_CONNECTION_SUBMITTED',
        entityType:'CONNECTION_INTAKE',
        entityId:inserted.rows[0].id,
        after:{type:TYPE_MAP[input.type],region:input.region??null,nicheId:input.nicheId??null},
        req,
      });
      return inserted.rows[0];
    });

    res.status(201).json({
      ok:true,
      data:{
        ...saved,
        message:'Yêu cầu đã được tiếp nhận riêng tư và chuyển vào hàng đợi xử lý thủ công.',
      },
    });
  }));

  return router;
}
