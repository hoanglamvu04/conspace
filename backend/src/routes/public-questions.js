import { Router } from 'express';
import { decodeUpload, uploadSchema } from '../services/uploads.js';
import { z } from 'zod';
import { pool } from '../database/pool.js';
import { RequestError, validate } from '../http/validation.js';
import { asyncHandler } from '../middleware/admin-auth.js';
import { createMediaService } from '../services/media.js';
import { encryptPrivateContact } from '../security/private-contact.js';
import { env } from '../config/env.js';
import { inTransaction, writeAudit } from '../services/audit.js';

const submissionSchema=z.strictObject({
  description:z.string().trim().min(10).max(10000),
  guessedNicheId:z.string().uuid().nullable().optional(),
  requestPrivateReply:z.enum(['true','false']).default('false'),
  phone:z.string().trim().max(40).optional(),
  images:z.array(uploadSchema).max(5).optional(),
});

export function createPublicQuestionsRouter(db=pool,mediaService=createMediaService(db)){
  const router=Router();
  if(!db){
    router.use((_req,_res,next)=>next(new RequestError(503,'DATABASE_UNAVAILABLE','Public question intake is temporarily unavailable')));
    return router;
  }

  router.post('/',asyncHandler(async(req,res)=>{
    const input=validate(submissionSchema,req.body);
    const wantsPrivate=input.requestPrivateReply==='true';
    let contact=null;
    if(wantsPrivate){
      if(!input.phone || input.phone.length<6) throw new RequestError(400,'PHONE_REQUIRED','A phone number is required when private reply is requested');
      try { contact=encryptPrivateContact(input.phone); }
      catch { throw new RequestError(503,'PRIVATE_REPLY_UNAVAILABLE','Private reply intake is temporarily unavailable'); }
    }
    const files=(input.images??[]).map(file=>decodeUpload(file,{maxBytes:5*1024*1024,imagesOnly:true}));
    if(files.length>5) throw new RequestError(400,'TOO_MANY_IMAGES','At most five images are allowed');
    const saved=[];
    try {
      for(const file of files){
        saved.push(await mediaService.save(file,null,{imagesOnly:true,rightsConfirmed:false,rightsNote:'Reader-submitted image; publication rights require editorial confirmation'}));
      }
    } catch(error) {
      await mediaService.cleanup(saved.map((item)=>item.id)).catch(()=>{});
      throw error;
    }
    let question;
    try {
      question=await inTransaction(db,async(client)=>{
      const result=await client.query(
        'INSERT INTO conspace.reader_questions (description,guessed_niche_id,request_private_reply,contact_ciphertext,contact_iv,contact_auth_tag) '+
        'VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,status,created_at AS "createdAt"',
        [input.description,input.guessedNicheId??null,wantsPrivate,contact?.ciphertext??null,contact?.iv??null,contact?.authTag??null]
      );
      for(const [index,item] of saved.entries()){
        await client.query(
          'INSERT INTO conspace.reader_question_media (question_id,media_id,position) VALUES ($1,$2,$3)',
          [result.rows[0].id,item.id,index+1]
        );
      }
      await writeAudit(client,{action:'PUBLIC_QUESTION_SUBMITTED',entityType:'QUESTION',entityId:result.rows[0].id,after:{description:input.description,guessedNicheId:input.guessedNicheId??null,privateReplyRequested:wantsPrivate,imageCount:saved.length},req});
      return result.rows[0];
      });
    } catch(error) {
      await mediaService.cleanup(saved.map((item)=>item.id)).catch(()=>{});
      throw error;
    }
    res.status(201).json({ok:true,data:{...question,message:'Câu hỏi đã được tiếp nhận. Thông tin liên hệ chỉ được dùng khi bạn yêu cầu trả lời riêng.'}});
  }));

  router.get('/',asyncHandler(async(req,res)=>{
    const result=await db.query(
      "SELECT q.id,q.description,n.slug AS \"niche\",a.body AS answer,a.published_at AS \"publishedAt\", " +
      "COALESCE((SELECT json_agg('/api/v1/media/' || m.id::text ORDER BY qm.position) FROM conspace.reader_question_media qm JOIN conspace.media_assets m ON m.id=qm.media_id WHERE qm.question_id=q.id AND m.rights_confirmed=true AND m.deleted_at IS NULL),'[]'::json) AS images " +
      "FROM conspace.reader_questions q JOIN conspace.question_answers a ON a.question_id=q.id "+
      "LEFT JOIN conspace.niches n ON n.id=q.guessed_niche_id "+
      "WHERE q.status='PUBLISHED' AND a.status='PUBLISHED' AND a.approved_by_user_id IS NOT NULL AND a.approved_at IS NOT NULL AND a.published_at<=now() ORDER BY a.published_at DESC LIMIT 50"
    );
    res.json({ok:true,data:result.rows});
  }));

  router.get('/:id',asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:z.string().uuid()}),req.params).id;
    const result=await db.query(
      "SELECT q.id,q.description,n.slug AS \"niche\",a.body AS answer,a.published_at AS \"publishedAt\",a.related_article_id AS \"relatedArticleId\", " +
      "COALESCE((SELECT json_agg('/api/v1/media/' || m.id::text ORDER BY qm.position) FROM conspace.reader_question_media qm JOIN conspace.media_assets m ON m.id=qm.media_id WHERE qm.question_id=q.id AND m.rights_confirmed=true AND m.deleted_at IS NULL),'[]'::json) AS images " +
      "FROM conspace.reader_questions q JOIN conspace.question_answers a ON a.question_id=q.id "+
      "LEFT JOIN conspace.niches n ON n.id=q.guessed_niche_id "+
      "WHERE q.id=$1 AND q.status='PUBLISHED' AND a.status='PUBLISHED' AND a.approved_by_user_id IS NOT NULL AND a.approved_at IS NOT NULL AND a.published_at<=now() LIMIT 1",
      [id]
    );
    if(!result.rows[0]) throw new RequestError(404,'NOT_FOUND','Published answer not found');
    res.json({ok:true,data:result.rows[0]});
  }));

  return router;
}
