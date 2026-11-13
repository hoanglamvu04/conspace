import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../database/pool.js';
import { RequestError, validate } from '../http/validation.js';

const published="a.status='PUBLISHED' AND a.approved_by IS NOT NULL AND a.approved_at IS NOT NULL AND a.published_at<=now() AND (a.content_type<>'FIELD_CASE' OR EXISTS(SELECT 1 FROM conspace.field_notes f WHERE f.article_id=a.id AND f.unit_anonymized=true AND f.address_anonymized=true AND f.photo_rights_confirmed=true))";
const schema=z.strictObject({
  q:z.string().trim().min(2).max(120),
  type:z.enum(['all','article','niche','term','chapter','field_note']).default('all'),
  role:z.enum(['homeowner','architect','contractor']).default('homeowner'),
  niche:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).optional(),
  limit:z.coerce.number().int().min(1).max(50).default(20),
  page:z.coerce.number().int().min(1).max(1000).default(1),
});

const matchesSql=[
 'WITH matches AS (',
 'SELECT a.id,a.slug,a.title,a.excerpt AS snippet,',
 "'article'::text AS type,a.published_at AS \"publishedAt\",a.audience_role AS \"audienceRole\",NULL::text AS \"bookSlug\",NULL::integer AS \"chapterNo\",NULL::text AS \"nicheGroup\",",
 "ts_rank_cd(to_tsvector('simple',a.title||' '||a.excerpt||' '||a.body),plainto_tsquery('simple',$1)) AS score,",
 "CASE WHEN $3::text IS NOT NULL AND a.audience_role=$3 THEN 0 ELSE 1 END AS \"preferenceRank\"",
 'FROM conspace.articles a WHERE '+published+" AND a.content_type<>'FIELD_CASE'",
 "AND ($4::text IS NULL OR EXISTS(SELECT 1 FROM conspace.article_niches an JOIN conspace.niches n ON n.id=an.niche_id AND n.is_active=true WHERE an.article_id=a.id AND n.slug=$4))",
 "AND to_tsvector('simple',a.title||' '||a.excerpt||' '||a.body)@@plainto_tsquery('simple',$1)",
 'UNION ALL',
 'SELECT n.id,n.slug,n.name AS title,n.summary AS snippet,',
 "'niche'::text AS type,NULL::timestamptz AS \"publishedAt\",NULL::text AS \"audienceRole\",NULL::text AS \"bookSlug\",NULL::integer AS \"chapterNo\",n.group_type AS \"nicheGroup\",",
 "ts_rank_cd(to_tsvector('simple',n.name||' '||n.summary),plainto_tsquery('simple',$1)) AS score,1::integer AS \"preferenceRank\"",
 'FROM conspace.niches n WHERE n.is_active=true AND ($4::text IS NULL OR n.slug=$4)',
 "AND to_tsvector('simple',n.name||' '||n.summary)@@plainto_tsquery('simple',$1)",
 'UNION ALL',
 'SELECT t.id,t.slug,t.term AS title,t.definition AS snippet,',
 "'term'::text AS type,NULL::timestamptz AS \"publishedAt\",NULL::text AS \"audienceRole\",NULL::text AS \"bookSlug\",NULL::integer AS \"chapterNo\",NULL::text AS \"nicheGroup\",",
 "ts_rank_cd(to_tsvector('simple',t.term||' '||t.definition),plainto_tsquery('simple',$1)) AS score,1::integer AS \"preferenceRank\"",
 "FROM conspace.terms t WHERE t.status='PUBLISHED' AND t.reviewed_by IS NOT NULL AND t.reviewed_at IS NOT NULL AND t.source_ref IS NOT NULL",
 "AND ($4::text IS NULL OR EXISTS(SELECT 1 FROM conspace.term_niches tn JOIN conspace.niches n ON n.id=tn.niche_id AND n.is_active=true WHERE tn.term_id=t.id AND n.slug=$4))",
 "AND to_tsvector('simple',t.term||' '||t.definition)@@plainto_tsquery('simple',$1)",
 'UNION ALL',
 'SELECT bc.id,a.slug,COALESCE(bc.title,a.title) AS title,a.excerpt AS snippet,',
 "'chapter'::text AS type,a.published_at AS \"publishedAt\",b.audience_role AS \"audienceRole\",b.slug AS \"bookSlug\",bc.chapter_no AS \"chapterNo\",NULL::text AS \"nicheGroup\",",
 "ts_rank_cd(to_tsvector('simple',COALESCE(bc.title,'')||' '||a.title||' '||a.body),plainto_tsquery('simple',$1)) AS score,",
 "CASE WHEN $3::text IS NOT NULL AND b.audience_role=$3 THEN 0 ELSE 1 END AS \"preferenceRank\"",
 'FROM conspace.book_chapters bc JOIN conspace.books b ON b.id=bc.book_id AND b.is_active=true JOIN conspace.articles a ON a.id=bc.article_id WHERE '+published,
 "AND ($4::text IS NULL OR EXISTS(SELECT 1 FROM conspace.article_niches an JOIN conspace.niches n ON n.id=an.niche_id AND n.is_active=true WHERE an.article_id=a.id AND n.slug=$4))",
 "AND to_tsvector('simple',COALESCE(bc.title,'')||' '||a.title||' '||a.body)@@plainto_tsquery('simple',$1)",
 'UNION ALL',
 'SELECT f.id,a.slug,a.title,a.excerpt AS snippet,',
 "'field_note'::text AS type,a.published_at AS \"publishedAt\",a.audience_role AS \"audienceRole\",NULL::text AS \"bookSlug\",NULL::integer AS \"chapterNo\",NULL::text AS \"nicheGroup\",",
 "ts_rank_cd(to_tsvector('simple',a.title||' '||f.phenomenon||' '||f.root_cause),plainto_tsquery('simple',$1)) AS score,",
 "CASE WHEN $3::text IS NOT NULL AND a.audience_role=$3 THEN 0 ELSE 1 END AS \"preferenceRank\"",
 'FROM conspace.field_notes f JOIN conspace.articles a ON a.id=f.article_id WHERE '+published,
 'AND f.unit_anonymized=true AND f.address_anonymized=true AND f.photo_rights_confirmed=true',
 "AND ($4::text IS NULL OR EXISTS(SELECT 1 FROM conspace.article_niches an JOIN conspace.niches n ON n.id=an.niche_id AND n.is_active=true WHERE an.article_id=a.id AND n.slug=$4))",
 "AND to_tsvector('simple',a.title||' '||f.phenomenon||' '||f.root_cause)@@plainto_tsquery('simple',$1)",
 ')',
].join(' ');

const filteredSql=matchesSql+
  ' SELECT id,slug,title,snippet,type,"publishedAt","audienceRole","bookSlug","chapterNo","nicheGroup",score,"preferenceRank"'+
  " FROM matches WHERE ($2::text='all' OR type=$2)";

export function createPublicSearchRouter(db=pool){
 const router=Router();
 if(!db){router.use((_req,_res,next)=>next(new RequestError(503,'DATABASE_UNAVAILABLE','Search is temporarily unavailable')));return router;}
 router.get('/',async(req,res,next)=>{
  try{
   const p=validate(schema,req.query);
   const values=[p.q,p.type,p.role??null,p.niche??null];
   const offset=(p.page-1)*p.limit;
   const [rows,count,facets]=await Promise.all([
    db.query(filteredSql+' ORDER BY "preferenceRank" ASC,score DESC,"publishedAt" DESC NULLS LAST,id DESC LIMIT $5 OFFSET $6',[...values,p.limit,offset]),
    db.query('SELECT count(*)::integer AS total FROM ('+filteredSql+') result',values),
    db.query('SELECT type,count(*)::integer AS total FROM ('+filteredSql+') result GROUP BY type ORDER BY type',[p.q,'all',p.role??null,p.niche??null]),
   ]);
   const facetMap=Object.fromEntries(facets.rows.map(row=>[row.type,row.total]));
   res.json({
    ok:true,
    data:rows.rows.map(({preferenceRank,...row})=>row),
    meta:{
      q:p.q,type:p.type,niche:p.niche??null,preferredAudienceRole:p.role??'homeowner',
      total:count.rows[0].total,limit:p.limit,page:p.page,hasMore:p.page*p.limit<count.rows[0].total,
      facets:{
        all:facets.rows.reduce((sum,row)=>sum+row.total,0),
        article:facetMap.article??0,
        niche:facetMap.niche??0,
        term:facetMap.term??0,
        chapter:facetMap.chapter??0,
        field_note:facetMap.field_note??0,
      },
    },
   });
  }catch(error){next(error);}
 });
 return router;
}
