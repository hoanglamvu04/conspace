import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { RequestError, validate } from '../../http/validation.js';
import { asyncHandler, requireRoles } from '../../middleware/admin-auth.js';
import { createEditorialService } from '../../services/editorial.js';
import { inTransaction, writeAudit } from '../../services/audit.js';

const uuid=z.string().uuid();
const baseSchema=z.strictObject({
  title:z.string().trim().min(1).max(300),
  slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  excerpt:z.string().max(1000).optional(),
  body:z.string().max(200000).optional(),
  authorId:uuid.optional(),
  audienceRole:z.enum(['homeowner','architect','contractor']).optional(),
  nicheIds:z.array(uuid).max(30).optional(),
  sources:z.array(z.strictObject({title:z.string().trim().min(1).max(300),url:z.string().url().nullable().optional(),citation:z.string().max(2000).nullable().optional()})).max(50).optional(),
  sensitivityFlags:z.array(z.enum(['INDUSTRY_DARK_SIDE','PRICE_OR_RATE','WARRANTY_PERIOD','IDENTIFIABLE_ENTITY_RISK','LEGAL_CONTENT'])).max(5).optional(),
  phenomenon:z.string().trim().min(1).max(20000),
  rootCause:z.string().trim().min(1).max(20000),
  interventionPoint:z.string().trim().min(1).max(20000),
  repairCostAmount:z.coerce.number().nonnegative().max(1000000000000).nullable().optional(),
  repairCostSource:z.string().trim().min(3).max(1000).nullable().optional(),
  unitAnonymized:z.boolean(),
  addressAnonymized:z.boolean(),
  photoRightsConfirmed:z.boolean(),
  anonymizationNote:z.string().max(2000).nullable().optional(),
  mediaIds:z.array(uuid).max(10).optional(),
});
const patchSchema=baseSchema.partial().extend({changeReason:z.string().max(500).optional()});

export function createFieldNotesRouter(db=pool,editorial=createEditorialService(db)){
  const router=Router();
  router.use(requireRoles('EDITOR','EDITOR_IN_CHIEF'));

  router.get('/',asyncHandler(async(req,res)=>{
    const result=await db.query(
      'SELECT f.id,f.article_id AS "articleId",a.slug,a.title,a.status,a.published_at AS "publishedAt",' +
      'f.phenomenon,f.root_cause AS "rootCause",f.intervention_point AS "interventionPoint",' +
      'f.repair_cost_amount AS "repairCostAmount",f.repair_cost_source AS "repairCostSource",' +
      'f.unit_anonymized AS "unitAnonymized",f.address_anonymized AS "addressAnonymized",' +
      'f.photo_rights_confirmed AS "photoRightsConfirmed",f.anonymization_note AS "anonymizationNote" '+
      'FROM conspace.field_notes f JOIN conspace.articles a ON a.id=f.article_id ORDER BY a.updated_at DESC'
    );
    res.json({ok:true,data:result.rows});
  }));

  router.post('/',requireRoles('EDITOR'),asyncHandler(async(req,res)=>{
    const input=validate(baseSchema,req.body);
    if(input.repairCostAmount!==undefined && input.repairCostAmount!==null && !input.repairCostSource) {
      throw new RequestError(400,'COST_SOURCE_REQUIRED','A real source is required when repair cost is supplied');
    }
    const article=await editorial.createArticle(req.auth,{
      slug:input.slug,title:input.title,excerpt:input.excerpt??'',body:input.body??'',
      authorId:input.authorId,audienceRole:input.audienceRole??'homeowner',
      contentType:'FIELD_CASE',nicheIds:input.nicheIds??[],sources:input.sources??[],
      sensitivityFlags:input.sensitivityFlags??['IDENTIFIABLE_ENTITY_RISK'],sensitivityAssessed:true,
    },req);
    const result=await inTransaction(db,async(client)=>{
      const inserted=await client.query(
        'INSERT INTO conspace.field_notes (article_id,phenomenon,root_cause,intervention_point,repair_cost_amount,repair_cost_source,'+
        'unit_anonymized,address_anonymized,photo_rights_confirmed,anonymization_note) '+
        'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
        [article.id,input.phenomenon,input.rootCause,input.interventionPoint,input.repairCostAmount??null,
          input.repairCostSource??null,input.unitAnonymized,input.addressAnonymized,input.photoRightsConfirmed,input.anonymizationNote??null]
      );
      for(const [index,mediaId] of (input.mediaIds??[]).entries()){
        const media=await client.query(
          "SELECT id,category,rights_confirmed FROM conspace.media_assets WHERE id=$1 AND deleted_at IS NULL",
          [mediaId]
        );
        if(!media.rows[0] || media.rows[0].category!=='IMAGE') throw new RequestError(400,'INVALID_FIELD_IMAGE','Field notes can only attach active image media');
        if(input.photoRightsConfirmed && !media.rows[0].rights_confirmed) throw new RequestError(409,'MEDIA_RIGHTS_REQUIRED','Each field image needs confirmed usage rights');
        await client.query(
          'INSERT INTO conspace.field_note_media (field_note_id,media_id,position) VALUES ($1,$2,$3)',
          [inserted.rows[0].id,mediaId,index]
        );
      }
      await writeAudit(client,{actorUserId:req.auth.id,action:'FIELD_NOTE_CREATED',entityType:'FIELD_NOTE',entityId:inserted.rows[0].id,after:inserted.rows[0],req});
      return inserted.rows[0];
    });
    res.status(201).json({ok:true,data:{...result,articleId:article.id}});
  }));

  router.get('/:id',asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await db.query(
      'SELECT f.*,a.slug,a.title,a.excerpt,a.body,a.status,a.audience_role AS "audienceRole",' +
      'COALESCE((SELECT json_agg(json_build_object(\'id\',m.id,\'filename\',m.original_filename,\'rightsConfirmed\',m.rights_confirmed) ORDER BY fm.position) '+
      'FROM conspace.field_note_media fm JOIN conspace.media_assets m ON m.id=fm.media_id WHERE fm.field_note_id=f.id AND m.deleted_at IS NULL),\'[]\'::json) AS media '+
      'FROM conspace.field_notes f JOIN conspace.articles a ON a.id=f.article_id WHERE f.id=$1',
      [id]
    );
    if(!result.rows[0]) throw new RequestError(404,'NOT_FOUND','Field note not found');
    res.json({ok:true,data:result.rows[0]});
  }));

  router.patch('/:id',requireRoles('EDITOR'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const input=validate(patchSchema,req.body);
    const current=await db.query(
      'SELECT f.*,a.id AS article_id,a.status AS article_status FROM conspace.field_notes f JOIN conspace.articles a ON a.id=f.article_id WHERE f.id=$1',
      [id]
    );
    if(!current.rows[0]) throw new RequestError(404,'NOT_FOUND','Field note not found');
    if(!['DRAFT','NEEDS_CHANGES'].includes(current.rows[0].article_status)) throw new RequestError(409,'INVALID_STATE','Only draft or returned field notes can be edited');
    if(input.repairCostAmount!==undefined && input.repairCostAmount!==null && !(input.repairCostSource??current.rows[0].repair_cost_source)) {
      throw new RequestError(400,'COST_SOURCE_REQUIRED','A real source is required when repair cost is supplied');
    }
    if(input.title || input.slug || input.body || input.excerpt || input.nicheIds || input.sources || input.sensitivityFlags){
      await editorial.updateArticle(req.auth,current.rows[0].article_id,{
        title:input.title,slug:input.slug,body:input.body,excerpt:input.excerpt,nicheIds:input.nicheIds,
        sources:input.sources,sensitivityFlags:input.sensitivityFlags,changeReason:input.changeReason,
      },req);
    }
    const updated=await inTransaction(db,async(client)=>{
      const result=await client.query(
        'UPDATE conspace.field_notes SET phenomenon=COALESCE($2,phenomenon),root_cause=COALESCE($3,root_cause),'+
        'intervention_point=COALESCE($4,intervention_point),repair_cost_amount=CASE WHEN $5::boolean THEN $6::numeric ELSE repair_cost_amount END,'+
        'repair_cost_source=CASE WHEN $5::boolean THEN $7 ELSE repair_cost_source END,'+
        'unit_anonymized=COALESCE($8,unit_anonymized),address_anonymized=COALESCE($9,address_anonymized),'+
        'photo_rights_confirmed=COALESCE($10,photo_rights_confirmed),anonymization_note=COALESCE($11,anonymization_note),updated_at=now() '+
        'WHERE id=$1 RETURNING *',
        [id,input.phenomenon??null,input.rootCause??null,input.interventionPoint??null,
          input.repairCostAmount!==undefined,input.repairCostAmount??null,input.repairCostSource??null,
          input.unitAnonymized??null,input.addressAnonymized??null,input.photoRightsConfirmed??null,input.anonymizationNote??null]
      );
      if(input.mediaIds){
        await client.query('DELETE FROM conspace.field_note_media WHERE field_note_id=$1',[id]);
        for(const [index,mediaId] of input.mediaIds.entries()){
          const media=await client.query("SELECT id,category,rights_confirmed FROM conspace.media_assets WHERE id=$1 AND deleted_at IS NULL",[mediaId]);
          if(!media.rows[0] || media.rows[0].category!=='IMAGE') throw new RequestError(400,'INVALID_FIELD_IMAGE','Field notes can only attach active image media');
          if((input.photoRightsConfirmed??result.rows[0].photo_rights_confirmed) && !media.rows[0].rights_confirmed) throw new RequestError(409,'MEDIA_RIGHTS_REQUIRED','Each field image needs confirmed usage rights');
          await client.query('INSERT INTO conspace.field_note_media (field_note_id,media_id,position) VALUES ($1,$2,$3)',[id,mediaId,index]);
        }
      }
      await writeAudit(client,{actorUserId:req.auth.id,action:'FIELD_NOTE_UPDATED',entityType:'FIELD_NOTE',entityId:id,before:current.rows[0],after:result.rows[0],req});
      return result.rows[0];
    });
    res.json({ok:true,data:updated});
  }));

  router.delete('/:id',requireRoles('EDITOR','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query(
        'SELECT f.id,f.article_id,a.status FROM conspace.field_notes f JOIN conspace.articles a ON a.id=f.article_id WHERE f.id=$1 FOR UPDATE OF f,a',
        [id]
      );
      if(!current.rows[0]) throw new RequestError(404,'NOT_FOUND','Field note not found');
      if(!['DRAFT','NEEDS_CHANGES'].includes(current.rows[0].status)) throw new RequestError(409,'INVALID_STATE','Only draft field notes can be removed');
      await client.query('DELETE FROM conspace.field_notes WHERE id=$1',[id]);
      await client.query("UPDATE conspace.articles SET status='ARCHIVED',updated_by_user_id=$2,updated_at=now() WHERE id=$1",[current.rows[0].article_id,req.auth.id]);
      await writeAudit(client,{actorUserId:req.auth.id,action:'FIELD_NOTE_REMOVED',entityType:'FIELD_NOTE',entityId:id,before:current.rows[0],req});
      return {id,deleted:true};
    });
    res.json({ok:true,data:result});
  }));

  return router;
}
