import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database/pool.js';
import { RequestError, validate } from '../http/validation.js';
const slug=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const role=z.enum(['homeowner','architect','contractor']);
const uuid=z.string().uuid();
const publishedArticle="a.status='PUBLISHED' AND a.approved_by IS NOT NULL AND a.approved_at IS NOT NULL AND a.published_at<=now() AND (a.content_type<>'FIELD_CASE' OR EXISTS(SELECT 1 FROM conspace.field_notes f WHERE f.article_id=a.id AND f.unit_anonymized=true AND f.address_anonymized=true AND f.photo_rights_confirmed=true))";
const checkedField='f.unit_anonymized=true AND f.address_anonymized=true AND f.photo_rights_confirmed=true';
const handle=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
export function createPublishingRouter(db=pool){
 const router=Router();
 if(!db){router.use((_req,_res,next)=>next(new RequestError(503,'DATABASE_UNAVAILABLE','Publishing database is unavailable')));return router;}
 router.get('/feed',handle(async(req,res)=>{
  const {limit,role:readerLens}=validate(z.strictObject({limit:z.coerce.number().int().min(1).max(20).default(6),role:role.optional()}),req.query);
  const [books,articles,fieldNotes,questions]=await Promise.all([
   db.query('SELECT bc.id,bc.chapter_no AS "chapterNo",bc.display_label AS "displayLabel",bc.title AS "chapterTitle",b.title AS "bookTitle",b.slug AS "bookSlug",b.content_label AS "contentLabel",b.content_label_vi AS "contentLabelVi",a.title AS "articleTitle",a.slug AS "articleSlug",a.published_at AS "publishedAt" FROM conspace.book_chapters bc JOIN conspace.books b ON b.id=bc.book_id JOIN conspace.articles a ON a.id=bc.article_id WHERE b.is_active=true AND '+publishedArticle+' ORDER BY CASE WHEN $2::text IS NOT NULL AND b.audience_role=$2 THEN 0 ELSE 1 END,a.published_at DESC,bc.id DESC LIMIT $1',[limit,readerLens]),
   db.query('SELECT a.id,a.slug,a.title,a.excerpt,a.audience_role AS "audienceRole",a.published_at AS "publishedAt",au.display_name AS "authorName" FROM conspace.articles a JOIN conspace.authors au ON au.id=a.author_id WHERE '+publishedArticle+" AND a.content_type<>'FIELD_CASE' ORDER BY CASE WHEN $2::text IS NOT NULL AND a.audience_role=$2 THEN 0 ELSE 1 END,a.published_at DESC,a.id DESC LIMIT $1",[limit,readerLens]),
   db.query('SELECT f.id,f.article_id AS "articleId",a.slug,a.title,a.excerpt,f.phenomenon,f.intervention_point AS "interventionPoint",a.published_at AS "publishedAt" FROM conspace.field_notes f JOIN conspace.articles a ON a.id=f.article_id WHERE '+publishedArticle+' AND '+checkedField+' ORDER BY CASE WHEN $2::text IS NOT NULL AND a.audience_role=$2 THEN 0 ELSE 1 END,a.published_at DESC,a.id DESC LIMIT $1',[limit,readerLens]),
   db.query("SELECT q.id,q.description,qa.body AS answer,qa.published_at AS \"publishedAt\",n.slug AS \"niche\" FROM conspace.reader_questions q JOIN conspace.question_answers qa ON qa.question_id=q.id LEFT JOIN conspace.niches n ON n.id=q.guessed_niche_id WHERE q.status='PUBLISHED' AND qa.status='PUBLISHED' AND qa.approved_by_user_id IS NOT NULL AND qa.approved_at IS NOT NULL AND qa.published_at<=now() ORDER BY qa.published_at DESC,q.id DESC LIMIT $1",[limit])
  ]);
  res.json({ok:true,data:{books:books.rows,articles:articles.rows,fieldNotes:fieldNotes.rows,questions:questions.rows},meta:{preferredAudienceRole:readerLens??'homeowner'}});
 }));
 router.get('/books',handle(async(req,res)=>{
  const {role:lens}=validate(z.strictObject({role:role.optional()}),req.query);
  const r=await db.query('SELECT b.id,b.slug,b.title,b.audience_role AS "audienceRole",b.content_label AS "contentLabel",b.content_label_vi AS "contentLabelVi",b.expected_chapter_count AS "expectedChapterCount",COUNT(a.id)::integer AS "publishedChapterCount",MAX(a.published_at) AS "latestPublishedAt" FROM conspace.books b LEFT JOIN conspace.book_chapters bc ON bc.book_id=b.id LEFT JOIN conspace.articles a ON a.id=bc.article_id AND '+publishedArticle+' WHERE b.is_active=true GROUP BY b.id ORDER BY CASE WHEN $1::text IS NOT NULL AND b.audience_role=$1 THEN 0 ELSE 1 END,b.title,b.id',[lens??null]);
  res.json({ok:true,data:r.rows,meta:{total:r.rows.length,preferredAudienceRole:lens??'homeowner'}});
 }));
 router.get('/books/:slug',handle(async(req,res)=>{
  const {slug:bookSlug}=validate(z.strictObject({slug}),req.params);
  const r=await db.query('SELECT b.id,b.slug,b.title,b.audience_role AS "audienceRole",b.content_label AS "contentLabel",b.content_label_vi AS "contentLabelVi",b.expected_chapter_count AS "expectedChapterCount" FROM conspace.books b WHERE b.slug=$1 AND b.is_active=true LIMIT 1',[bookSlug]);
  const book=r.rows[0];if(!book)throw new RequestError(404,'NOT_FOUND','Book not found');
  const chapters=await db.query('SELECT bc.chapter_no AS "chapterNo",bc.display_label AS "displayLabel",bc.title,a.slug AS "articleSlug",a.excerpt,a.published_at AS "publishedAt" FROM conspace.book_chapters bc JOIN conspace.articles a ON a.id=bc.article_id WHERE bc.book_id=$1 AND '+publishedArticle+' ORDER BY bc.chapter_no',[book.id]);
  res.json({ok:true,data:{...book,chapters:chapters.rows}});
 }));
 router.get('/books/:slug/chapters/:chapterNo',handle(async(req,res)=>{
  const p=validate(z.strictObject({slug,chapterNo:z.coerce.number().int().min(1).max(100)}),req.params);
  const r=await db.query('SELECT b.id AS "bookId",b.slug AS "bookSlug",b.title AS "bookTitle",b.content_label AS "contentLabel",b.content_label_vi AS "contentLabelVi",bc.chapter_no AS "chapterNo",bc.display_label AS "displayLabel",bc.title AS "chapterTitle",a.id AS "articleId",a.slug AS "articleSlug",a.title,a.excerpt,a.body,a.published_at AS "publishedAt",COALESCE((SELECT json_agg(json_build_object(\'title\',s.title,\'url\',s.url,\'citation\',s.citation) ORDER BY s.position) FROM conspace.article_sources s WHERE s.article_id=a.id),\'[]\'::json) AS sources FROM conspace.books b JOIN conspace.book_chapters bc ON bc.book_id=b.id JOIN conspace.articles a ON a.id=bc.article_id WHERE b.slug=$1 AND b.is_active=true AND bc.chapter_no=$2 AND '+publishedArticle+' LIMIT 1',[p.slug,p.chapterNo]);
  const chapter=r.rows[0];if(!chapter)throw new RequestError(404,'NOT_FOUND','Published chapter not found');
  const nav=await db.query('SELECT bc.chapter_no AS "chapterNo",bc.display_label AS "displayLabel",a.slug AS "articleSlug" FROM conspace.book_chapters bc JOIN conspace.articles a ON a.id=bc.article_id WHERE bc.book_id=$1 AND '+publishedArticle+' ORDER BY bc.chapter_no',[chapter.bookId]);
  const index=nav.rows.findIndex(x=>x.chapterNo===chapter.chapterNo);
  res.json({ok:true,data:{...chapter,previous:index>0?nav.rows[index-1]:null,next:index>=0&&index<nav.rows.length-1?nav.rows[index+1]:null}});
 }));
 router.get('/niches/:slug',handle(async(req,res)=>{
  const p=validate(z.strictObject({slug}),req.params),q=validate(z.strictObject({role:role.optional()}),req.query);
  const nicheResult=await db.query('SELECT n.id,n.slug,n.name,n.group_type AS "group",n.template_key AS "templateType",CASE n.template_key WHEN \'TEMPLATE_A\' THEN 12 ELSE 7 END AS "expectedSectionCount",n.code,n.summary,n.source_ref AS "sourceRef",g.slug AS "constructionGroupSlug",g.name AS "constructionGroup" FROM conspace.niches n LEFT JOIN conspace.niche_groups g ON g.id=n.niche_group_id WHERE n.slug=$1 AND n.is_active=true LIMIT 1',[p.slug]);
  const niche=nicheResult.rows[0];if(!niche)throw new RequestError(404,'NOT_FOUND','Niche not found');
  const [blocks,articles,fieldNotes,chapters,related]=await Promise.all([
   niche.templateType==='TEMPLATE_B'
    ? db.query("SELECT b.section_no AS \"sectionNo\",b.block_key AS \"blockKey\",b.title,s.content,s.source_ref AS \"sourceRef\" FROM conspace.architectural_template_blocks b LEFT JOIN conspace.architectural_sections s ON s.niche_id=$1 AND s.section_no=b.section_no AND s.status='PUBLISHED' AND s.content<>'' ORDER BY b.section_no",[niche.id])
    : db.query("SELECT b.section_no AS \"sectionNo\",b.block_key AS \"blockKey\",b.title,l.audience_role AS \"audienceRole\",s.content,s.source_ref AS \"sourceRef\",shared.content AS \"sharedContent\",shared.source_ref AS \"sharedSourceRef\" FROM conspace.niche_template_blocks b LEFT JOIN conspace.niche_template_layers l ON l.section_no=b.section_no LEFT JOIN conspace.niche_sections s ON s.niche_id=$1 AND s.section_no=b.section_no AND s.audience_role=l.audience_role AND s.status='PUBLISHED' AND s.content<>'' LEFT JOIN LATERAL(SELECT ns.content,ns.source_ref FROM conspace.niche_sections ns WHERE ns.niche_id=$1 AND ns.section_no=b.section_no AND ns.audience_role IS NULL AND ns.status='PUBLISHED' AND ns.content<>'' LIMIT 1) shared ON true ORDER BY b.section_no,CASE WHEN l.audience_role=$2 THEN 0 ELSE 1 END,l.audience_role",[niche.id,q.role??null]),
   db.query('SELECT a.id,a.slug,a.title,a.excerpt,a.published_at AS "publishedAt" FROM conspace.article_niches an JOIN conspace.articles a ON a.id=an.article_id WHERE an.niche_id=$1 AND '+publishedArticle+" AND a.content_type<>'FIELD_CASE' ORDER BY a.published_at DESC LIMIT 30",[niche.id]),
   db.query('SELECT f.id,a.slug,a.title,f.phenomenon,a.published_at AS "publishedAt" FROM conspace.article_niches an JOIN conspace.articles a ON a.id=an.article_id JOIN conspace.field_notes f ON f.article_id=a.id WHERE an.niche_id=$1 AND '+publishedArticle+' AND '+checkedField+' ORDER BY a.published_at DESC LIMIT 30',[niche.id]),
   db.query('SELECT b.slug AS "bookSlug",b.title AS "bookTitle",bc.chapter_no AS "chapterNo",bc.title AS "chapterTitle",a.slug AS "articleSlug" FROM conspace.article_niches an JOIN conspace.articles a ON a.id=an.article_id JOIN conspace.book_chapters bc ON bc.article_id=a.id JOIN conspace.books b ON b.id=bc.book_id AND b.is_active=true WHERE an.niche_id=$1 AND '+publishedArticle+' ORDER BY a.published_at DESC LIMIT 30',[niche.id]),
   db.query('SELECT DISTINCT n.id,n.slug,n.name,n.group_type AS "group",n.template_key AS "templateType" FROM conspace.article_niches a1 JOIN conspace.article_niches a2 ON a2.article_id=a1.article_id AND a2.niche_id<>a1.niche_id JOIN conspace.niches n ON n.id=a2.niche_id AND n.is_active=true JOIN conspace.articles a ON a.id=a1.article_id WHERE a1.niche_id=$1 AND '+publishedArticle+' ORDER BY n.name LIMIT 12',[niche.id])
  ]);
  const sections=niche.templateType==='TEMPLATE_B'
   ? blocks.rows.map(x=>({sectionNo:x.sectionNo,key:x.blockKey,title:x.title,content:x.content??null,sourceRef:x.sourceRef??null,layers:[]}))
   : Array.from({length:12},(_,i)=>{const rows=blocks.rows.filter(x=>x.sectionNo===i+1);return {sectionNo:i+1,key:rows[0]?.blockKey??null,title:rows[0]?.title??null,sharedContent:rows[0]?.sharedContent??null,sharedSourceRef:rows[0]?.sharedSourceRef??null,layers:rows.filter(x=>x.audienceRole).map(x=>({audienceRole:x.audienceRole,content:x.content??null,sourceRef:x.sourceRef??null}))};});
  res.json({ok:true,data:{...niche,lens:q.role??null,preferredAudienceRole:q.role??'homeowner',sections,articles:articles.rows,fieldNotes:fieldNotes.rows,chapters:chapters.rows,relatedNiches:related.rows}});
 }));
 router.get('/field-notes',handle(async(req,res)=>{
  const q=validate(z.strictObject({niche:slug.optional(),role:role.optional(),limit:z.coerce.number().int().min(1).max(50).default(12),offset:z.coerce.number().int().min(0).default(0)}),req.query);
  const pred='FROM conspace.field_notes f JOIN conspace.articles a ON a.id=f.article_id WHERE '+publishedArticle+' AND '+checkedField+' AND ($1::text IS NULL OR EXISTS(SELECT 1 FROM conspace.article_niches an JOIN conspace.niches n ON n.id=an.niche_id AND n.is_active=true WHERE an.article_id=a.id AND n.slug=$1))';
  const rows=await db.query('SELECT f.id,a.id AS "articleId",a.slug,a.title,a.excerpt,a.published_at AS "publishedAt",f.phenomenon,f.root_cause AS "rootCause",f.intervention_point AS "interventionPoint" '+pred+' ORDER BY CASE WHEN $2::text IS NOT NULL AND a.audience_role=$2 THEN 0 ELSE 1 END,a.published_at DESC,a.id DESC LIMIT $3 OFFSET $4',[q.niche??null,q.role??null,q.limit,q.offset]);
  const total=await db.query('SELECT count(*)::integer AS total '+pred,[q.niche??null]);
  res.json({ok:true,data:rows.rows,meta:{total:total.rows[0].total,limit:q.limit,offset:q.offset,preferredAudienceRole:q.role??'homeowner'}});
 }));
 router.get('/field-notes/:id',handle(async(req,res)=>{
  const id=validate(z.strictObject({id:uuid}),req.params).id;
  const r=await db.query("SELECT f.id,a.id AS \"articleId\",a.slug,a.title,a.excerpt,a.body,a.published_at AS \"publishedAt\",f.phenomenon,f.root_cause AS \"rootCause\",f.intervention_point AS \"interventionPoint\",f.repair_cost_amount AS \"repairCostAmount\",f.repair_cost_currency AS \"repairCostCurrency\",f.repair_cost_source AS \"repairCostSource\",COALESCE((SELECT json_agg(json_build_object('id',m.id,'url','/api/v1/media/'||m.id::text,'caption',fm.caption) ORDER BY fm.position) FROM conspace.field_note_media fm JOIN conspace.media_assets m ON m.id=fm.media_id AND m.deleted_at IS NULL AND m.rights_confirmed=true WHERE fm.field_note_id=f.id),'[]'::json) AS images FROM conspace.field_notes f JOIN conspace.articles a ON a.id=f.article_id WHERE f.id=$1 AND "+publishedArticle+" AND "+checkedField+" LIMIT 1",[id]);
  if(!r.rows[0])throw new RequestError(404,'NOT_FOUND','Field note not found');
  res.json({ok:true,data:r.rows[0]});
 }));
 return router;
}
