import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database/pool.js';
import { RequestError, validate } from '../http/validation.js';
import { asyncHandler } from '../middleware/admin-auth.js';
import { createMediaService } from '../services/media.js';

export function createPublicMediaRouter(db=pool,mediaService=createMediaService(db)){
  const router=Router();
  if(!db){
    router.use((_req,_res,next)=>next(new RequestError(503,'DATABASE_UNAVAILABLE','Public media is temporarily unavailable')));
    return router;
  }
  router.get('/:id',asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:z.string().uuid()}),req.params).id;
    const allowed=await db.query(
      "SELECT m.mime_type FROM conspace.media_assets m WHERE m.id=$1 AND m.deleted_at IS NULL "+
      "AND m.rights_confirmed=true AND m.mime_type LIKE 'image/%' AND ("+
      "EXISTS(SELECT 1 FROM conspace.article_media am JOIN conspace.articles a ON a.id=am.article_id WHERE am.media_id=m.id AND a.status='PUBLISHED') OR "+
      "EXISTS(SELECT 1 FROM conspace.field_note_media fm JOIN conspace.field_notes f ON f.id=fm.field_note_id JOIN conspace.articles a ON a.id=f.article_id WHERE fm.media_id=m.id AND a.status='PUBLISHED') OR "+
      "EXISTS(SELECT 1 FROM conspace.reader_question_media qm JOIN conspace.reader_questions q ON q.id=qm.question_id JOIN conspace.question_answers qa ON qa.question_id=q.id WHERE qm.media_id=m.id AND q.status='PUBLISHED' AND qa.status='PUBLISHED'))",
      [id]
    );
    if(!allowed.rows[0]) throw new RequestError(404,'NOT_FOUND','Published media not found');
    const file=await mediaService.read(id);
    res.setHeader('Content-Type',file.mimeType);
    res.setHeader('Content-Length',file.buffer.length);
    res.setHeader('Content-Disposition','inline');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','public, max-age=300, stale-while-revalidate=60');
    res.send(file.buffer);
  }));
  return router;
}
