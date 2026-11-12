import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database/pool.js';
import { RequestError, validate } from '../http/validation.js';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const role = z.enum(['homeowner', 'architect', 'contractor']);
const uuid = z.string().uuid();
const publishedArticle = "a.status='PUBLISHED' AND a.approved_by IS NOT NULL AND a.approved_at IS NOT NULL AND a.published_at <= now()";
const checkedField = 'f.unit_anonymized=true AND f.address_anonymized=true AND f.photo_rights_confirmed=true';

const handle = (handler) => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(next);
const sendRows = (res, result) => res.json({ ok: true, data: result.rows, meta: { total: result.rows.length } });

export function createPublishingRouter(db = pool) {
  const router = Router();
  if (!db) {
    router.use((_req, _res, next) => next(new RequestError(503, 'DATABASE_UNAVAILABLE', 'Publishing database is unavailable')));
    return router;
  }

  // The homepage groups independently moderated content. Never fill empty categories with fabricated items.
  router.get('/feed', handle(async (req, res) => {
    const { limit } = validate(z.strictObject({
      limit: z.coerce.number().int().min(1).max(20).default(6),
    }), req.query);

    const [books, articles, fieldNotes, questions] = await Promise.all([
      db.query([
        'SELECT bc.id, bc.chapter_no AS "chapterNo", bc.display_label AS "displayLabel",',
        'bc.title AS "chapterTitle", b.title AS "bookTitle", b.slug AS "bookSlug",',
        'b.content_label AS "contentLabel", b.content_label_vi AS "contentLabelVi",',
        'a.title AS "articleTitle", a.slug AS "articleSlug", a.published_at AS "publishedAt"',
        'FROM conspace.book_chapters bc JOIN conspace.books b ON b.id=bc.book_id',
        'JOIN conspace.articles a ON a.id=bc.article_id',
        'WHERE b.is_active=true AND ' + publishedArticle,
        'ORDER BY a.published_at DESC, bc.id DESC LIMIT $1'
      ].join(' '), [limit]),
      db.query([
        'SELECT a.id,a.slug,a.title,a.excerpt,a.audience_role AS "audienceRole",',
        'a.published_at AS "publishedAt",au.display_name AS "authorName"',
        'FROM conspace.articles a JOIN conspace.authors au ON au.id=a.author_id',
        'WHERE ' + publishedArticle + " AND a.content_type NOT IN ('FIELD_CASE')",
        'ORDER BY a.published_at DESC,a.id DESC LIMIT $1',
      ].join(' '), [limit]),
      db.query([
        'SELECT f.id,f.article_id AS "articleId",a.slug,a.title,a.excerpt,',
        'f.phenomenon,f.intervention_point AS "interventionPoint",a.published_at AS "publishedAt"',
        'FROM conspace.field_notes f JOIN conspace.articles a ON a.id=f.article_id',
        'WHERE ' + publishedArticle + ' AND ' + checkedField,
        'ORDER BY a.published_at DESC,a.id DESC LIMIT $1',
      ].join(' '), [limit]),
      db.query([
        'SELECT q.id,q.description,qa.body AS answer,qa.published_at AS "publishedAt",n.slug AS "niche"',
        'FROM conspace.reader_questions q JOIN conspace.question_answers qa ON qa.question_id=q.id',
        'LEFT JOIN conspace.niches n ON n.id=q.guessed_niche_id',
        "WHERE q.status='PUBLISHED' AND qa.status='PUBLISHED' AND qa.approved_by_user_id IS NOT NULL AND qa.approved_at IS NOT NULL AND qa.published_at<=now()",
        'ORDER BY qa.published_at DESC,q.id DESC LIMIT $1',
      ].join(' '), [limit]),
    ]);
    res.json({
      ok: true,
      data: { books: books.rows, articles: articles.rows, fieldNotes: fieldNotes.rows, questions: questions.rows },
    });
  }));

  router.get('/books', handle(async (_req, res) => {
    const result = await db.query([
      'SELECT b.id,b.slug,b.title,b.audience_role AS "audienceRole",',
      'b.content_label AS "contentLabel",b.content_label_vi AS "contentLabelVi",',
      'b.expected_chapter_count AS "expectedChapterCount",',
      'COUNT(a.id)::integer AS "publishedChapterCount",',
      'MAX(a.published_at) AS "latestPublishedAt"',
      'FROM conspace.books b',
      'LEFT JOIN conspace.book_chapters bc ON bc.book_id=b.id',
      'LEFT JOIN conspace.articles a ON a.id=bc.article_id AND ' + publishedArticle,
      'WHERE b.is_active=true GROUP BY b.id ORDER BY b.title,b.id',
    ].join(' '));
    sendRows(res, result);
  }));

  router.get('/books/:slug', handle(async (req, res) => {
    const { slug: bookSlug } = validate(z.strictObject({ slug }), req.params);
    const result = await db.query([
      'SELECT b.id,b.slug,b.title,b.audience_role AS "audienceRole",',
      'b.content_label AS "contentLabel",b.content_label_vi AS "contentLabelVi",',
      'b.expected_chapter_count AS "expectedChapterCount"',
      'FROM conspace.books b WHERE b.slug=$1 AND b.is_active=true LIMIT 1',
    ].join(' '), [bookSlug]);
    const book = result.rows[0];
    if (!book) throw new RequestError(404, 'NOT_FOUND', 'Book not found');
    const chapters = await db.query([
      'SELECT bc.chapter_no AS "chapterNo",bc.display_label AS "displayLabel",',
      'bc.title,a.slug AS "articleSlug",a.excerpt,',
      'a.published_at AS "publishedAt"',
      'FROM conspace.book_chapters bc JOIN conspace.articles a ON a.id=bc.article_id',
      'WHERE bc.book_id=$1 AND ' + publishedArticle,
      'ORDER BY bc.chapter_no',
    ].join(' '), [book.id]);
    res.json({ ok: true, data: { ...book, chapters: chapters.rows } });
  }));

  router.get('/books/:slug/chapters/:chapterNo', handle(async (req, res) => {
    const params = validate(z.strictObject({
      slug,
      chapterNo: z.coerce.number().int().min(1).max(100),
    }), req.params);
    const result = await db.query([
      'SELECT b.id AS "bookId",b.slug AS "bookSlug",b.title AS "bookTitle",',
      'b.content_label AS "contentLabel",b.content_label_vi AS "contentLabelVi",',
      'bc.chapter_no AS "chapterNo",bc.display_label AS "displayLabel",',
      'bc.title AS "chapterTitle",a.id AS "articleId",a.slug AS "articleSlug",',
      'a.title,a.excerpt,a.body,a.published_at AS "publishedAt",',
      "COALESCE((SELECT json_agg(json_build_object('title',s.title,'url',s.url,'citation',s.citation) ORDER BY s.position)",
      "FROM conspace.article_sources s WHERE s.article_id=a.id),'[]'::json) AS sources",
      'FROM conspace.books b JOIN conspace.book_chapters bc ON bc.book_id=b.id',
      'JOIN conspace.articles a ON a.id=bc.article_id',
      'WHERE b.slug=$1 AND b.is_active=true AND bc.chapter_no=$2 AND ' + publishedArticle,
      'LIMIT 1',
    ].join(' '), [params.slug, params.chapterNo]);
    const chapter = result.rows[0];
    if (!chapter) throw new RequestError(404, 'NOT_FOUND', 'Published chapter not found');
    const navigation = await db.query([
      'SELECT bc.chapter_no AS "chapterNo",bc.display_label AS "displayLabel",',
      'a.slug AS "articleSlug" FROM conspace.book_chapters bc',
      'JOIN conspace.articles a ON a.id=bc.article_id',
      'WHERE bc.book_id=$1 AND ' + publishedArticle,
      'ORDER BY bc.chapter_no',
    ].join(' '), [chapter.bookId]);
    const index = navigation.rows.findIndex(item => item.chapterNo === chapter.chapterNo);
    const previous = index > 0 ? navigation.rows[index - 1] : null;
    const next = index < navigation.rows.length - 1 ? navigation.rows[index + 1] : null;
    res.json({ ok: true, data: { ...chapter, previous, next } });
  }));

  router.get('/niches/:slug', handle(async (req, res) => {
    const params = validate(z.strictObject({ slug }), req.params);
    const { role: lens } = validate(z.strictObject({ role: role.optional() }), req.query);
    const result = await db.query([
      'SELECT n.id,n.slug,n.name,n.group_type AS "group",n.code,n.summary,',
      'n.source_ref AS "sourceRef",g.slug AS "constructionGroupSlug",g.name AS "constructionGroup"',
      'FROM conspace.niches n LEFT JOIN conspace.niche_groups g ON g.id=n.niche_group_id',
      'WHERE n.slug=$1 AND n.is_active=true LIMIT 1',
    ].join(' '), [params.slug]);
    const niche = result.rows[0];
    if (!niche) throw new RequestError(404, 'NOT_FOUND', 'Niche not found');

    const [blocks, articles, fieldNotes, chapters, related] = await Promise.all([
      db.query([
        'SELECT b.section_no AS "sectionNo",b.block_key AS "blockKey",b.title,',
        's.audience_role AS "audienceRole",s.content,s.source_ref AS "sourceRef"',
        'FROM conspace.niche_template_blocks b',
        'LEFT JOIN conspace.niche_sections s ON s.niche_id=$1 AND s.section_no=b.section_no',
        "AND s.status='PUBLISHED' AND s.content<>''",
        'AND ($2::text IS NULL OR s.audience_role IS NULL OR s.audience_role=$2)',
        'ORDER BY b.section_no,s.audience_role NULLS FIRST',
      ].join(' '), [niche.id, lens ?? null]),
      db.query([
        'SELECT a.id,a.slug,a.title,a.excerpt,a.published_at AS "publishedAt"',
        'FROM conspace.article_niches an JOIN conspace.articles a ON a.id=an.article_id',
        'WHERE an.niche_id=$1 AND ' + publishedArticle + " AND a.content_type<>'FIELD_CASE'",
        'ORDER BY a.published_at DESC LIMIT 30',
      ].join(' '), [niche.id]),
      db.query([
        'SELECT f.id,a.slug,a.title,f.phenomenon,a.published_at AS "publishedAt"',
        'FROM conspace.article_niches an JOIN conspace.articles a ON a.id=an.article_id',
        'JOIN conspace.field_notes f ON f.article_id=a.id',
        'WHERE an.niche_id=$1 AND ' + publishedArticle + ' AND ' + checkedField,
        'ORDER BY a.published_at DESC LIMIT 30',
      ].join(' '), [niche.id]),
      db.query([
        'SELECT b.slug AS "bookSlug",b.title AS "bookTitle",',
        'bc.chapter_no AS "chapterNo",bc.title AS "chapterTitle",a.slug AS "articleSlug"',
        'FROM conspace.article_niches an JOIN conspace.articles a ON a.id=an.article_id',
        'JOIN conspace.book_chapters bc ON bc.article_id=a.id',
        'JOIN conspace.books b ON b.id=bc.book_id AND b.is_active=true',
        'WHERE an.niche_id=$1 AND ' + publishedArticle,
        'ORDER BY a.published_at DESC LIMIT 30',
      ].join(' '), [niche.id]),
      db.query([
        'SELECT DISTINCT n.id,n.slug,n.name,n.group_type AS "group"',
        'FROM conspace.article_niches a1 JOIN conspace.article_niches a2',
        'ON a2.article_id=a1.article_id AND a2.niche_id<>a1.niche_id',
        'JOIN conspace.niches n ON n.id=a2.niche_id AND n.is_active=true',
        'JOIN conspace.articles a ON a.id=a1.article_id',
        'WHERE a1.niche_id=$1 AND ' + publishedArticle,
        'ORDER BY n.name LIMIT 12',
      ].join(' '), [niche.id]),
    ]);
    const sections = Array.from({length:12},(_,index)=>{
      const rows=blocks.rows.filter(item=>item.sectionNo===index+1);
      return {
        sectionNo:index+1,
        key:rows[0]?.blockKey??null,
        title:rows[0]?.title??null,
        layers:rows.filter(item=>item.content).map(item=>({
          audienceRole:item.audienceRole,
          content:item.content,
          sourceRef:item.sourceRef,
        })),
      };
    });
    res.json({ok:true,data:{...niche,lens:lens??null,sections,
      articles:articles.rows,fieldNotes:fieldNotes.rows,chapters:chapters.rows,relatedNiches:related.rows}});
  }));

  router.get('/field-notes', handle(async (req,res)=>{
    const query=validate(z.strictObject({
      niche:slug.optional(),
      limit:z.coerce.number().int().min(1).max(50).default(12),
      offset:z.coerce.number().int().min(0).default(0),
    }),req.query);
    const predicates=[
      'FROM conspace.field_notes f JOIN conspace.articles a ON a.id=f.article_id',
      'WHERE ' + publishedArticle + ' AND ' + checkedField,
      'AND ($1::text IS NULL OR EXISTS (SELECT 1 FROM conspace.article_niches an JOIN conspace.niches n ON n.id=an.niche_id AND n.is_active=true',
      'WHERE an.article_id=a.id AND n.slug=$1))',
    ].join(' ');
    const rows=await db.query([
      'SELECT f.id,a.id AS "articleId",a.slug,a.title,a.excerpt,a.published_at AS "publishedAt",',
      'f.phenomenon,f.root_cause AS "rootCause",f.intervention_point AS "interventionPoint"',
      predicates,'ORDER BY a.published_at DESC,a.id DESC LIMIT $2 OFFSET $3',
    ].join(' '),[query.niche??null,query.limit,query.offset]);
    const total=await db.query('SELECT count(*)::integer AS total '+predicates,[query.niche??null]);
    res.json({ok:true,data:rows.rows,meta:{total:total.rows[0].total,limit:query.limit,offset:query.offset}});
  }));

  router.get('/field-notes/:id',handle(async(req,res)=>{
    const {id}=validate(z.strictObject({id:uuid}),req.params);
    const row=await db.query([
      'SELECT f.id,a.id AS "articleId",a.slug,a.title,a.excerpt,a.body,a.published_at AS "publishedAt",',
      'f.phenomenon,f.root_cause AS "rootCause",f.intervention_point AS "interventionPoint",',
      'f.repair_cost_amount AS "repairCostAmount",f.repair_cost_currency AS "repairCostCurrency",f.repair_cost_source AS "repairCostSource",',
      "COALESCE((SELECT json_agg(json_build_object('id',m.id,'url','/api/v1/media/' || m.id::text,'caption',fm.caption) ORDER BY fm.position)",
      "FROM conspace.field_note_media fm JOIN conspace.media_assets m ON m.id=fm.media_id AND m.deleted_at IS NULL AND m.rights_confirmed=true",
      "WHERE fm.field_note_id=f.id),'[]'::json) AS images",
      'FROM conspace.field_notes f JOIN conspace.articles a ON a.id=f.article_id',
      'WHERE f.id=$1 AND ' + publishedArticle + ' AND ' + checkedField,'LIMIT 1',
    ].join(' '),[id]);
    if(!row.rows[0])throw new RequestError(404,'NOT_FOUND','Field note not found');
    res.json({ok:true,data:row.rows[0]});
  }));

  return router;
}
