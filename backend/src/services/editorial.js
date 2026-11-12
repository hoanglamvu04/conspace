import { pool } from '../database/pool.js';
import { RequestError } from '../http/validation.js';
import { inTransaction, writeAudit, writeWorkflowEvent } from './audit.js';

const CHIEF_FLAGS = new Set([
  'INDUSTRY_DARK_SIDE','PRICE_OR_RATE','WARRANTY_PERIOD','IDENTIFIABLE_ENTITY_RISK','LEGAL_CONTENT',
]);

async function authorForUser(client, user) {
  const found = await client.query('SELECT id FROM conspace.authors WHERE user_id = $1', [user.id]);
  if (found.rows[0]) return found.rows[0].id;
  const result = await client.query(
    'INSERT INTO conspace.authors (slug,display_name,user_id) VALUES ($1,$2,$3) RETURNING id',
    ['staff-' + user.id.replaceAll('-', ''), user.displayName, user.id]
  );
  return result.rows[0].id;
}

async function snapshotArticle(client, id) {
  const result = await client.query(
    "SELECT to_jsonb(a) || jsonb_build_object(" +
    "'niches',COALESCE((SELECT jsonb_agg(n.id) FROM conspace.article_niches an JOIN conspace.niches n ON n.id=an.niche_id WHERE an.article_id=a.id),'[]'::jsonb)," +
    "'tags',COALESCE((SELECT jsonb_agg(t.id) FROM conspace.article_tags atg JOIN conspace.tags t ON t.id=atg.tag_id WHERE atg.article_id=a.id),'[]'::jsonb)," +
    "'sources',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.position) FROM conspace.article_sources s WHERE s.article_id=a.id),'[]'::jsonb),'mediaIds',COALESCE((SELECT jsonb_agg(am.media_id ORDER BY am.position) FROM conspace.article_media am WHERE am.article_id=a.id),'[]'::jsonb)" +
    ") AS snapshot FROM conspace.articles a WHERE a.id=$1",
    [id]
  );
  return result.rows[0]?.snapshot ?? null;
}

async function replaceArticleRelations(client, articleId, input) {
  if (input.nicheIds !== undefined) {
    await client.query('DELETE FROM conspace.article_niches WHERE article_id=$1', [articleId]);
    for (const nicheId of input.nicheIds) {
      const result = await client.query(
        'INSERT INTO conspace.article_niches (article_id,niche_id) ' +
        'SELECT $1,id FROM conspace.niches WHERE id=$2 AND is_active=true',
        [articleId, nicheId]
      );
      if (result.rowCount !== 1) throw new RequestError(400, 'INVALID_NICHE', 'One or more niches are unavailable');
    }
  }
  if (input.tags !== undefined) {
    await client.query('DELETE FROM conspace.article_tags WHERE article_id=$1', [articleId]);
    for (const tag of input.tags) {
      const result = await client.query(
        'INSERT INTO conspace.tags (slug,name) VALUES ($1,$2) ' +
        'ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id',
        [tag.slug, tag.name]
      );
      await client.query(
        'INSERT INTO conspace.article_tags (article_id,tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [articleId, result.rows[0].id]
      );
    }
  }
  if (input.sources !== undefined) {
    await client.query('DELETE FROM conspace.article_sources WHERE article_id=$1', [articleId]);
    for (const [position, source] of input.sources.entries()) {
      await client.query(
        'INSERT INTO conspace.article_sources (article_id,position,title,url,citation) VALUES ($1,$2,$3,$4,$5)',
        [articleId, position, source.title, source.url ?? null, source.citation ?? null]
      );
    }
  }
  if (input.mediaIds !== undefined) {
    await client.query('DELETE FROM conspace.article_media WHERE article_id=$1', [articleId]);
    for (const [position, mediaId] of input.mediaIds.entries()) {
      const media = await client.query('SELECT id FROM conspace.media_assets WHERE id=$1 AND deleted_at IS NULL', [mediaId]);
      if (!media.rows[0]) throw new RequestError(400, 'INVALID_MEDIA', 'One or more media assets are unavailable');
      await client.query(
        'INSERT INTO conspace.article_media (article_id,media_id,role,position) VALUES ($1,$2,$3,$4)',
        [articleId, mediaId, position === 0 ? 'COVER' : 'INLINE', position]
      );
    }
  }
}

export function createEditorialService(db = pool) {
  return {
    async listArticles({ status, role, search, page = 1, limit = 20 }) {
      const offset = (page - 1) * limit;
      const result = await db.query(
        'SELECT a.id,a.slug,a.title,a.excerpt,a.status,a.audience_role AS "audienceRole",' +
        'a.content_type AS "contentType",a.requires_chief_review AS "requiresChiefReview",' +
        'a.scheduled_at AS "scheduledAt",a.published_at AS "publishedAt",a.updated_at AS "updatedAt",' +
        'au.display_name AS "authorName",u.display_name AS "updatedBy" ' +
        'FROM conspace.articles a JOIN conspace.authors au ON au.id=a.author_id ' +
        'LEFT JOIN conspace.cms_users u ON u.id=a.updated_by_user_id ' +
        'WHERE ($1::text IS NULL OR a.status=$1) AND ($2::text IS NULL OR a.audience_role=$2) ' +
        "AND ($3::text IS NULL OR a.title ILIKE '%' || $3 || '%' OR a.slug ILIKE '%' || $3 || '%') " +
        'ORDER BY a.updated_at DESC,a.id DESC LIMIT $4 OFFSET $5',
        [status ?? null, role ?? null, search ?? null, limit, offset]
      );
      const count = await db.query(
        'SELECT count(*)::integer AS total FROM conspace.articles a ' +
        'WHERE ($1::text IS NULL OR a.status=$1) AND ($2::text IS NULL OR a.audience_role=$2) ' +
        "AND ($3::text IS NULL OR a.title ILIKE '%' || $3 || '%' OR a.slug ILIKE '%' || $3 || '%')",
        [status ?? null, role ?? null, search ?? null]
      );
      return { rows: result.rows, total: count.rows[0].total };
    },

    async getArticle(id) {
      const result = await db.query(
        "SELECT a.*,a.audience_role AS \"audienceRole\",a.content_type AS \"contentType\"," +
        "a.cover_image_url AS \"coverImageUrl\",a.requires_chief_review AS \"requiresChiefReview\"," +
        "a.sensitivity_flags AS \"sensitivityFlags\",a.scheduled_at AS \"scheduledAt\"," +
        "au.display_name AS \"authorName\",u.display_name AS \"createdByName\"," +
        "COALESCE((SELECT json_agg(n.id) FROM conspace.article_niches an JOIN conspace.niches n ON n.id=an.niche_id WHERE an.article_id=a.id),'[]'::json) AS \"nicheIds\"," +
        "COALESCE((SELECT json_agg(json_build_object('slug',t.slug,'name',t.name) ORDER BY t.name) FROM conspace.article_tags atg JOIN conspace.tags t ON t.id=atg.tag_id WHERE atg.article_id=a.id),'[]'::json) AS tags," +
        "COALESCE((SELECT json_agg(json_build_object('title',s.title,'url',s.url,'citation',s.citation) ORDER BY s.position) FROM conspace.article_sources s WHERE s.article_id=a.id),'[]'::json) AS sources," +
        "COALESCE((SELECT json_agg(json_build_object('id',m.id,'originalFilename',m.original_filename,'mimeType',m.mime_type,'rightsConfirmed',m.rights_confirmed) ORDER BY am.position) FROM conspace.article_media am JOIN conspace.media_assets m ON m.id=am.media_id WHERE am.article_id=a.id AND m.deleted_at IS NULL),'[]'::json) AS media " +
        'FROM conspace.articles a JOIN conspace.authors au ON au.id=a.author_id ' +
        'LEFT JOIN conspace.cms_users u ON u.id=a.created_by_user_id WHERE a.id=$1',
        [id]
      );
      return result.rows[0] ?? null;
    },

    async createArticle(actor, input, req) {
      return inTransaction(db, async (client) => {
        const authorId = input.authorId || await authorForUser(client, actor);
        const flags = input.sensitivityFlags || [];
        const requiresChief = flags.some((flag) => CHIEF_FLAGS.has(flag));
        const inserted = await client.query(
          'INSERT INTO conspace.articles ' +
          '(slug,title,excerpt,body,cover_image_url,author_id,audience_role,content_type,status,' +
          'created_by_user_id,updated_by_user_id,requires_chief_review,sensitivity_assessed,sensitivity_flags) ' +
          "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT',$9,$9,$10,$11) RETURNING *",
          [input.slug,input.title,input.excerpt ?? '',input.body ?? '',input.coverImageUrl ?? null,
            authorId,input.audienceRole ?? null,input.contentType ?? 'EDITORIAL',actor.id,requiresChief,input.sensitivityAssessed ?? false,flags]
        );
        const article = inserted.rows[0];
        await replaceArticleRelations(client, article.id, input);
        const snapshot = await snapshotArticle(client, article.id);
        await client.query(
          'INSERT INTO conspace.article_revisions (article_id,version_no,snapshot,change_reason,created_by_user_id) VALUES ($1,1,$2::jsonb,$3,$4)',
          [article.id,JSON.stringify(snapshot),'Initial draft',actor.id]
        );
        await writeAudit(client,{actorUserId:actor.id,action:'ARTICLE_CREATED',entityType:'ARTICLE',entityId:article.id,after:snapshot,req});
        return { ...article, nicheIds: input.nicheIds ?? [], tags: input.tags ?? [], sources: input.sources ?? [], mediaIds: input.mediaIds ?? [] };
      });
    },

    async updateArticle(actor, id, input, req) {
      return inTransaction(db, async (client) => {
        const locked = await client.query('SELECT * FROM conspace.articles WHERE id=$1 FOR UPDATE',[id]);
        const before = locked.rows[0];
        if (!before) throw new RequestError(404,'NOT_FOUND','Article not found');
        if (!['DRAFT','NEEDS_CHANGES'].includes(before.status)) {
          throw new RequestError(409,'INVALID_STATE','Only draft or returned articles can be edited');
        }
        const snapshot = await snapshotArticle(client,id);
        const version = await client.query(
          'SELECT COALESCE(max(version_no),0)::integer + 1 AS next FROM conspace.article_revisions WHERE article_id=$1',
          [id]
        );
        await client.query(
          'INSERT INTO conspace.article_revisions (article_id,version_no,snapshot,change_reason,created_by_user_id) VALUES ($1,$2,$3::jsonb,$4,$5)',
          [id,version.rows[0].next,JSON.stringify(snapshot),input.changeReason ?? null,actor.id]
        );
        const flags = input.sensitivityFlags ?? before.sensitivity_flags;
        const requiresChief = flags.some((flag) => CHIEF_FLAGS.has(flag));
        const updated = await client.query(
          'UPDATE conspace.articles SET ' +
          'slug=COALESCE($2,slug),title=COALESCE($3,title),excerpt=COALESCE($4,excerpt),body=COALESCE($5,body),' +
          'cover_image_url=COALESCE($6,cover_image_url),author_id=COALESCE($7,author_id),' +
          'audience_role=COALESCE($8,audience_role),content_type=COALESCE($9,content_type),' +
          'sensitivity_flags=$10,requires_chief_review=$11,sensitivity_assessed=$12,updated_by_user_id=$13,updated_at=now() ' +
          'WHERE id=$1 RETURNING *',
          [id,input.slug ?? null,input.title ?? null,input.excerpt ?? null,input.body ?? null,
            input.coverImageUrl ?? null,input.authorId ?? null,input.audienceRole ?? null,
            input.contentType ?? null,flags,requiresChief,input.sensitivityAssessed ?? before.sensitivity_assessed,actor.id]
        );
        await replaceArticleRelations(client,id,input);
        const after = await snapshotArticle(client,id);
        await writeAudit(client,{actorUserId:actor.id,action:'ARTICLE_UPDATED',entityType:'ARTICLE',entityId:id,before,after,req});
        return after ? updated.rows[0] : updated.rows[0];
      });
    },

    async submitArticle(actor, id, req) {
      return inTransaction(db, async (client) => {
        const result = await client.query('SELECT * FROM conspace.articles WHERE id=$1 FOR UPDATE',[id]);
        const article = result.rows[0];
        if (!article) throw new RequestError(404,'NOT_FOUND','Article not found');
        if (!['DRAFT','NEEDS_CHANGES'].includes(article.status)) throw new RequestError(409,'INVALID_STATE','Article cannot be submitted from its current state');
        if (!article.sensitivity_assessed) throw new RequestError(409,'SENSITIVITY_ASSESSMENT_REQUIRED','Editor must explicitly assess sensitive-content flags before submission');
        await assertArticleMediaRights(client, id);
        if (article.content_type === 'FIELD_CASE') {
          const field = await client.query('SELECT * FROM conspace.field_notes WHERE article_id=$1',[id]);
          const note = field.rows[0];
          if (!note || !note.unit_anonymized || !note.address_anonymized || !note.photo_rights_confirmed) {
            throw new RequestError(409,'FIELD_CASE_COMPLIANCE_REQUIRED','Field case must anonymize the unit and address and confirm image usage rights before review');
          }
          const media = await client.query(
            'SELECT count(*)::integer AS total FROM conspace.field_note_media fm ' +
            'JOIN conspace.media_assets m ON m.id=fm.media_id AND m.deleted_at IS NULL ' +
            'WHERE fm.field_note_id=$1 AND m.rights_confirmed=false',
            [note.id]
          );
          if (media.rows[0].total > 0) throw new RequestError(409,'MEDIA_RIGHTS_REQUIRED','All field case images must have confirmed usage rights');
        }
        const updated = await client.query(
          "UPDATE conspace.articles SET status='SUBMITTED',submitted_at=now(),updated_by_user_id=$2,updated_at=now() WHERE id=$1 RETURNING *",
          [id,actor.id]
        );
        await writeWorkflowEvent(client,{entityType:'ARTICLE',entityId:id,fromStatus:article.status,toStatus:'SUBMITTED',action:'SUBMIT',actorUserId:actor.id});
        await writeAudit(client,{actorUserId:actor.id,action:'ARTICLE_SUBMITTED',entityType:'ARTICLE',entityId:id,before:{status:article.status},after:{status:'SUBMITTED'},req});
        return updated.rows[0];
      });
    },

    async startArticleReview(actor,id,stage,req) {
      return inTransaction(db,async(client)=>{
        const result=await client.query('SELECT * FROM conspace.articles WHERE id=$1 FOR UPDATE',[id]);
        const article=result.rows[0];
        if(!article) throw new RequestError(404,'NOT_FOUND','Article not found');
        const expectedRole=stage==='TECHNICAL'?'TECHNICAL_REVIEWER':'EDITOR_IN_CHIEF';
        const expectedStatus=stage==='TECHNICAL'?'SUBMITTED':'EDITOR_IN_CHIEF_REVIEW';
        const targetStatus=stage==='TECHNICAL'?'TECHNICAL_REVIEW':'EDITOR_IN_CHIEF_REVIEW';
        if(actor.role!=='ADMIN' && actor.role!==expectedRole) throw new RequestError(403,'FORBIDDEN','Review role required');
        if(article.status!==expectedStatus) throw new RequestError(409,'INVALID_STATE','Article is not waiting for this review stage');
        await assertNotAuthor(client,article,actor);
        const updated=await client.query('UPDATE conspace.articles SET status=$2,updated_by_user_id=$3,updated_at=now() WHERE id=$1 RETURNING *',[id,targetStatus,actor.id]);
        await writeWorkflowEvent(client,{entityType:'ARTICLE',entityId:id,fromStatus:article.status,toStatus:targetStatus,action:'REVIEW_STARTED',actorUserId:actor.id,metadata:{stage}});
        await writeAudit(client,{actorUserId:actor.id,action:'ARTICLE_REVIEW_STARTED',entityType:'ARTICLE',entityId:id,before:{status:article.status},after:{status:targetStatus},req});
        return updated.rows[0];
      });
    },

    async decideArticle(actor,id,{stage,decision,reason},req) {
      return inTransaction(db,async(client)=>{
        const result=await client.query('SELECT * FROM conspace.articles WHERE id=$1 FOR UPDATE',[id]);
        const article=result.rows[0];
        if(!article) throw new RequestError(404,'NOT_FOUND','Article not found');
        const technical=stage==='TECHNICAL';
        const roleAllowed=actor.role==='ADMIN' || (technical ? actor.role==='TECHNICAL_REVIEWER' : actor.role==='EDITOR_IN_CHIEF');
        if(!roleAllowed) throw new RequestError(403,'FORBIDDEN','Reviewer role required');
        const expected=technical?'TECHNICAL_REVIEW':'EDITOR_IN_CHIEF_REVIEW';
        if(article.status!==expected) throw new RequestError(409,'INVALID_STATE','Article is not at this review stage');
        await assertNotAuthor(client,article,actor);
        let next;
        if(decision==='APPROVED') next=technical && article.requires_chief_review?'EDITOR_IN_CHIEF_REVIEW':'APPROVED';
        else if(decision==='REQUEST_CHANGES') next='NEEDS_CHANGES';
        else next='REJECTED';
        let approverAuthorId=null;
        if(next==='APPROVED'){
          approverAuthorId=await authorForUser(client,actor);
        }
        const updated=await client.query(
          'UPDATE conspace.articles SET status=$2,approved_by=CASE WHEN $3::uuid IS NULL THEN approved_by ELSE $3 END,' +
          'approved_at=CASE WHEN $3::uuid IS NULL THEN approved_at ELSE now() END,' +
          'updated_by_user_id=$4,updated_at=now() WHERE id=$1 RETURNING *',
          [id,next,approverAuthorId,actor.id]
        );
        await client.query(
          'INSERT INTO conspace.editorial_reviews (entity_type,entity_id,stage,decision,reason,reviewer_user_id) VALUES ($1,$2,$3,$4,$5,$6)',
          ['ARTICLE',id,stage,decision,reason,actor.id]
        );
        await writeWorkflowEvent(client,{entityType:'ARTICLE',entityId:id,fromStatus:article.status,toStatus:next,action:decision,reason,actorUserId:actor.id,metadata:{stage}});
        await writeAudit(client,{actorUserId:actor.id,action:'ARTICLE_REVIEW_DECIDED',entityType:'ARTICLE',entityId:id,before:{status:article.status},after:{status:next,decision,reason},req});
        return updated.rows[0];
      });
    },

    async scheduleArticle(actor,id,scheduledAt,req) {
      return inTransaction(db,async(client)=>{
        const result=await client.query('SELECT * FROM conspace.articles WHERE id=$1 FOR UPDATE',[id]);
        const article=result.rows[0];
        if(!article) throw new RequestError(404,'NOT_FOUND','Article not found');
        if(!['EDITOR','EDITOR_IN_CHIEF','ADMIN'].includes(actor.role)) throw new RequestError(403,'FORBIDDEN','Only editorial staff can schedule approved articles');
        if(article.status!=='APPROVED') throw new RequestError(409,'INVALID_STATE','Only approved articles can be scheduled');
        if(new Date(scheduledAt)<=new Date()) throw new RequestError(400,'INVALID_SCHEDULE','Publication time must be in the future');
        const updated=await client.query(
          "UPDATE conspace.articles SET status='SCHEDULED',scheduled_at=$2,updated_by_user_id=$3,updated_at=now() WHERE id=$1 RETURNING *",
          [id,scheduledAt,actor.id]
        );
        await client.query('UPDATE conspace.book_chapters SET scheduled_at=$2,updated_at=now() WHERE article_id=$1',[id,scheduledAt]);
        await writeWorkflowEvent(client,{entityType:'ARTICLE',entityId:id,fromStatus:'APPROVED',toStatus:'SCHEDULED',action:'SCHEDULE',actorUserId:actor.id,metadata:{scheduledAt}});
        await writeAudit(client,{actorUserId:actor.id,action:'ARTICLE_SCHEDULED',entityType:'ARTICLE',entityId:id,before:{status:article.status},after:{status:'SCHEDULED',scheduledAt},req});
        return updated.rows[0];
      });
    },

    async publishArticle(actor,id,req) {
      return inTransaction(db,async(client)=>{
        const result=await client.query('SELECT * FROM conspace.articles WHERE id=$1 FOR UPDATE',[id]);
        const article=result.rows[0];
        if(!article) throw new RequestError(404,'NOT_FOUND','Article not found');
        if(!['EDITOR_IN_CHIEF','ADMIN'].includes(actor.role)) throw new RequestError(403,'FORBIDDEN','Only the editor-in-chief or admin can publish');
        if(!['APPROVED','SCHEDULED'].includes(article.status)) throw new RequestError(409,'INVALID_STATE','Only approved or scheduled articles can be published');
        if(article.status==='SCHEDULED' && new Date(article.scheduled_at)>new Date()) throw new RequestError(409,'NOT_DUE','Scheduled publication time has not arrived');
        await assertArticleMediaRights(client,id);
        await assertFieldCaseReady(client,article);
        const updated=await client.query(
          "UPDATE conspace.articles SET status='PUBLISHED',published_at=now(),updated_by_user_id=$2,updated_at=now() WHERE id=$1 RETURNING *",
          [id,actor.id]
        );
        await client.query('UPDATE conspace.book_chapters SET published_at=now(),updated_at=now() WHERE article_id=$1',[id]);
        await writeWorkflowEvent(client,{entityType:'ARTICLE',entityId:id,fromStatus:article.status,toStatus:'PUBLISHED',action:'PUBLISH',actorUserId:actor.id});
        await writeAudit(client,{actorUserId:actor.id,action:'ARTICLE_PUBLISHED',entityType:'ARTICLE',entityId:id,before:{status:article.status},after:{status:'PUBLISHED'},req});
        return updated.rows[0];
      });
    },

    async withdrawArticle(actor,id,reason,req) {
      return inTransaction(db,async(client)=>{
        const result=await client.query('SELECT * FROM conspace.articles WHERE id=$1 FOR UPDATE',[id]);
        const article=result.rows[0];
        if(!article) throw new RequestError(404,'NOT_FOUND','Article not found');
        if(!['EDITOR_IN_CHIEF','ADMIN'].includes(actor.role)) throw new RequestError(403,'FORBIDDEN','Only the editor-in-chief or admin can withdraw');
        if(!['PUBLISHED','SCHEDULED','APPROVED'].includes(article.status)) throw new RequestError(409,'INVALID_STATE','Article cannot be withdrawn from this state');
        const updated=await client.query(
          "UPDATE conspace.articles SET status='WITHDRAWN',withdrawn_at=now(),updated_by_user_id=$2,updated_at=now() WHERE id=$1 RETURNING *",
          [id,actor.id]
        );
        await writeWorkflowEvent(client,{entityType:'ARTICLE',entityId:id,fromStatus:article.status,toStatus:'WITHDRAWN',action:'WITHDRAW',reason,actorUserId:actor.id});
        await writeAudit(client,{actorUserId:actor.id,action:'ARTICLE_WITHDRAWN',entityType:'ARTICLE',entityId:id,before:{status:article.status},after:{status:'WITHDRAWN',reason},req});
        return updated.rows[0];
      });
    },

    async reviewQueue(stage) {
      const status=stage==='TECHNICAL'?'SUBMITTED':'EDITOR_IN_CHIEF_REVIEW';
      const result=await db.query(
        'SELECT a.id,a.slug,a.title,a.status,a.requires_chief_review AS "requiresChiefReview",a.sensitivity_flags AS "sensitivityFlags",a.updated_at AS "updatedAt",au.display_name AS "authorName" '+
        'FROM conspace.articles a JOIN conspace.authors au ON au.id=a.author_id WHERE a.status=$1 ORDER BY a.submitted_at ASC NULLS LAST,a.updated_at ASC',
        [status]
      );
      return result.rows;
    },

    async publishDueArticles() {
      return inTransaction(db,async(client)=>{
        const due=await client.query(
          "SELECT * FROM conspace.articles WHERE status='SCHEDULED' AND scheduled_at<=now() " +
          'AND approved_by IS NOT NULL AND approved_at IS NOT NULL ORDER BY scheduled_at ' +
          'FOR UPDATE SKIP LOCKED LIMIT 25'
        );
        for(const article of due.rows){
          await assertArticleMediaRights(client,article.id);
          await assertFieldCaseReady(client,article);
          await client.query(
            "UPDATE conspace.articles SET status='PUBLISHED',published_at=now(),updated_at=now() WHERE id=$1",
            [article.id]
          );
          await client.query('UPDATE conspace.book_chapters SET published_at=now(),updated_at=now() WHERE article_id=$1',[article.id]);
          await writeWorkflowEvent(client,{entityType:'ARTICLE',entityId:article.id,fromStatus:'SCHEDULED',toStatus:'PUBLISHED',action:'SYSTEM_AUTO_PUBLISH'});
          await writeAudit(client,{action:'SYSTEM_AUTO_PUBLISH',entityType:'ARTICLE',entityId:article.id,before:{status:'SCHEDULED'},after:{status:'PUBLISHED'}});
        }
        return due.rows.length;
      });
    },
  };
}

async function assertNotAuthor(client,article,actor){
  if(article.created_by_user_id===actor.id) throw new RequestError(403,'AUTHOR_CANNOT_APPROVE','Authors cannot review or approve their own articles');
  const author=await client.query('SELECT user_id FROM conspace.authors WHERE id=$1',[article.author_id]);
  if(author.rows[0]?.user_id===actor.id) throw new RequestError(403,'AUTHOR_CANNOT_APPROVE','Authors cannot review or approve their own articles');
}

async function assertArticleMediaRights(client,articleId){
  const result=await client.query(
    'SELECT count(*)::integer AS total FROM conspace.article_media am JOIN conspace.media_assets m ON m.id=am.media_id AND m.deleted_at IS NULL WHERE am.article_id=$1 AND m.rights_confirmed=false',
    [articleId]
  );
  if(result.rows[0].total>0) throw new RequestError(409,'MEDIA_RIGHTS_REQUIRED','All article media must have confirmed usage rights before publication');
}

async function assertFieldCaseReady(client,article){
  if(article.content_type!=='FIELD_CASE') return;
  const result=await client.query('SELECT * FROM conspace.field_notes WHERE article_id=$1',[article.id]);
  const note=result.rows[0];
  if(!note || !note.unit_anonymized || !note.address_anonymized || !note.photo_rights_confirmed){
    throw new RequestError(409,'FIELD_CASE_COMPLIANCE_REQUIRED','Field case anonymization and image rights must be confirmed');
  }
  const media=await client.query(
    'SELECT count(*)::integer AS total FROM conspace.field_note_media fm '+
    'JOIN conspace.media_assets m ON m.id=fm.media_id AND m.deleted_at IS NULL '+
    'WHERE fm.field_note_id=$1 AND m.rights_confirmed=false',[note.id]
  );
  if(media.rows[0].total>0) throw new RequestError(409,'MEDIA_RIGHTS_REQUIRED','All field case images must have confirmed usage rights');
}
