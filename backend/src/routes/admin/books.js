import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/pool.js';
import { RequestError, validate } from '../../http/validation.js';
import { asyncHandler, requireRoles } from '../../middleware/admin-auth.js';
import { inTransaction, writeAudit } from '../../services/audit.js';

const uuid=z.string().uuid();
const bookSchema=z.strictObject({
  slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  title:z.string().trim().min(1).max(250),
  audienceRole:z.enum(['homeowner','architect','contractor']),
  contentLabel:z.enum(['REFERENCE','NON_FICTION','FICTIONALIZED']),
  contentLabelVi:z.string().trim().min(1).max(80),
  expectedChapterCount:z.number().int().min(1).max(100),
  sourceRef:z.string().trim().min(3).max(500),
});
const bookPatch=bookSchema.partial();
const chapterSchema=z.strictObject({
  bookId:uuid,chapterNo:z.number().int().min(1).max(100),
  title:z.string().trim().max(250).nullable().optional(),
  articleId:uuid.nullable().optional(),
  scheduledAt:z.string().datetime({offset:true}).nullable().optional(),
});
const chapterPatch=chapterSchema.omit({bookId:true,chapterNo:true}).partial();

export function createBooksRouter(db=pool){
  const router=Router();
  router.use(requireRoles('EDITOR','EDITOR_IN_CHIEF'));

  router.get('/',asyncHandler(async(req,res)=>{
    const result=await db.query(
      'SELECT b.id,b.slug,b.title,b.audience_role AS "audienceRole",b.content_label AS "contentLabel",' +
      'b.content_label_vi AS "contentLabelVi",b.expected_chapter_count AS "expectedChapterCount",b.source_ref AS "sourceRef",' +
      'count(c.id)::integer AS "chapterSlots",count(c.article_id)::integer AS "chaptersWithContent" '+
      'FROM conspace.books b LEFT JOIN conspace.book_chapters c ON c.book_id=b.id '+
      'GROUP BY b.id ORDER BY b.title'
    );
    res.json({ok:true,data:result.rows});
  }));

  router.post('/',asyncHandler(async(req,res)=>{
    const input=validate(bookSchema,req.body);
    const result=await inTransaction(db,async(client)=>{
      const inserted=await client.query(
        'INSERT INTO conspace.books (slug,title,audience_role,content_label,content_label_vi,expected_chapter_count,source_ref) '+
        'VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [input.slug,input.title,input.audienceRole,input.contentLabel,input.contentLabelVi,input.expectedChapterCount,input.sourceRef]
      );
      await writeAudit(client,{actorUserId:req.auth.id,action:'BOOK_CREATED',entityType:'BOOK',entityId:inserted.rows[0].id,after:inserted.rows[0],req});
      return inserted.rows[0];
    });
    res.status(201).json({ok:true,data:result});
  }));

  router.get('/:id',asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await db.query('SELECT * FROM conspace.books WHERE id=$1',[id]);
    if(!result.rows[0]) throw new RequestError(404,'NOT_FOUND','Book not found');
    res.json({ok:true,data:result.rows[0]});
  }));

  router.patch('/:id',asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const input=validate(bookPatch,req.body);
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.books WHERE id=$1 FOR UPDATE',[id]);
      if(!current.rows[0]) throw new RequestError(404,'NOT_FOUND','Book not found');
      const before=current.rows[0];
      const updated=await client.query(
        'UPDATE conspace.books SET slug=COALESCE($2,slug),title=COALESCE($3,title),audience_role=COALESCE($4,audience_role),' +
        'content_label=COALESCE($5,content_label),content_label_vi=COALESCE($6,content_label_vi),' +
        'expected_chapter_count=COALESCE($7,expected_chapter_count),source_ref=COALESCE($8,source_ref),updated_at=now() '+
        'WHERE id=$1 RETURNING *',
        [id,input.slug??null,input.title??null,input.audienceRole??null,input.contentLabel??null,input.contentLabelVi??null,input.expectedChapterCount??null,input.sourceRef??null]
      );
      await writeAudit(client,{actorUserId:req.auth.id,action:'BOOK_UPDATED',entityType:'BOOK',entityId:id,before,after:updated.rows[0],req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  return router;
}

export function createChaptersRouter(db=pool){
  const router=Router();
  router.use(requireRoles('EDITOR','EDITOR_IN_CHIEF'));

  router.get('/',asyncHandler(async(req,res)=>{
    const query=validate(z.strictObject({bookId:uuid.optional()}),req.query);
    const result=await db.query(
      'SELECT c.id,c.book_id AS "bookId",b.title AS "bookTitle",c.chapter_no AS "chapterNo",c.display_label AS "displayLabel",' +
      'c.title,c.article_id AS "articleId",c.scheduled_at AS "scheduledAt",c.published_at AS "publishedAt",' +
      'a.status AS "articleStatus" FROM conspace.book_chapters c JOIN conspace.books b ON b.id=c.book_id '+
      'LEFT JOIN conspace.articles a ON a.id=c.article_id WHERE ($1::uuid IS NULL OR c.book_id=$1) '+
      'ORDER BY b.title,c.chapter_no',
      [query.bookId??null]
    );
    res.json({ok:true,data:result.rows});
  }));

  router.post('/',asyncHandler(async(req,res)=>{
    const input=validate(chapterSchema,req.body);
    const result=await inTransaction(db,async(client)=>{
      const book=await client.query('SELECT * FROM conspace.books WHERE id=$1',[input.bookId]);
      if(!book.rows[0]) throw new RequestError(404,'NOT_FOUND','Book not found');
      if(input.chapterNo>book.rows[0].expected_chapter_count) throw new RequestError(400,'CHAPTER_OUT_OF_RANGE','Chapter number exceeds the documented book outline');
      if(input.articleId){
        const article=await client.query('SELECT id,content_type FROM conspace.articles WHERE id=$1',[input.articleId]);
        if(!article.rows[0]) throw new RequestError(404,'ARTICLE_NOT_FOUND','Article not found');
        if(article.rows[0].content_type!==book.rows[0].content_label) throw new RequestError(409,'CONTENT_LABEL_MISMATCH','Article content label does not match this book');
      }
      const label=book.rows[0].slug==='cam-nang-kien-truc-hoa-lac'?'Phần ':'Chương ';
      const inserted=await client.query(
        'INSERT INTO conspace.book_chapters (book_id,chapter_no,display_label,title,article_id,scheduled_at) '+
        'VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [input.bookId,input.chapterNo,label+input.chapterNo,input.title??null,input.articleId??null,input.scheduledAt??null]
      );
      await writeAudit(client,{actorUserId:req.auth.id,action:'BOOK_CHAPTER_CREATED',entityType:'BOOK_CHAPTER',entityId:inserted.rows[0].id,after:inserted.rows[0],req});
      return inserted.rows[0];
    });
    res.status(201).json({ok:true,data:result});
  }));

  router.patch('/:id',asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const input=validate(chapterPatch,req.body);
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.book_chapters WHERE id=$1 FOR UPDATE',[id]);
      if(!current.rows[0]) throw new RequestError(404,'NOT_FOUND','Chapter slot not found');
      const before=current.rows[0];
      if(input.articleId){
        const article=await client.query('SELECT content_type FROM conspace.articles WHERE id=$1',[input.articleId]);
        const book=await client.query('SELECT content_label FROM conspace.books WHERE id=$1',[before.book_id]);
        if(!article.rows[0] || article.rows[0].content_type!==book.rows[0].content_label) throw new RequestError(409,'CONTENT_LABEL_MISMATCH','Article content label does not match this book');
      }
      const updated=await client.query(
        'UPDATE conspace.book_chapters SET title=COALESCE($2,title),article_id=COALESCE($3,article_id),' +
        'scheduled_at=COALESCE($4,scheduled_at),updated_at=now() WHERE id=$1 RETURNING *',
        [id,input.title??null,input.articleId??null,input.scheduledAt??null]
      );
      await writeAudit(client,{actorUserId:req.auth.id,action:'BOOK_CHAPTER_UPDATED',entityType:'BOOK_CHAPTER',entityId:id,before,after:updated.rows[0],req});
      return updated.rows[0];
    });
    res.json({ok:true,data:result});
  }));

  router.delete('/:id',requireRoles('EDITOR','EDITOR_IN_CHIEF'),asyncHandler(async(req,res)=>{
    const id=validate(z.strictObject({id:uuid}),req.params).id;
    const result=await inTransaction(db,async(client)=>{
      const current=await client.query('SELECT * FROM conspace.book_chapters WHERE id=$1 FOR UPDATE',[id]);
      if(!current.rows[0]) throw new RequestError(404,'NOT_FOUND','Chapter slot not found');
      if(current.rows[0].article_id) throw new RequestError(409,'CHAPTER_HAS_ARTICLE','Detach or archive the linked article before removing this slot');
      await client.query('DELETE FROM conspace.book_chapters WHERE id=$1',[id]);
      await writeAudit(client,{actorUserId:req.auth.id,action:'BOOK_CHAPTER_SLOT_REMOVED',entityType:'BOOK_CHAPTER',entityId:id,before:current.rows[0],req});
      return {id,deleted:true};
    });
    res.json({ok:true,data:result});
  }));

  return router;
}
