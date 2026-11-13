import { pool } from '../database/pool.js';

export function createContentRepository(db=pool){
 const query=async(sql,params=[])=>{
  if(!db){const error=new Error('Database unavailable');error.name='DatabaseUnavailable';throw error;}
  return db.query(sql,params);
 };
 const nicheFields=[
  "COALESCE((SELECT json_agg(n.slug ORDER BY n.sort_order,n.slug)",
  "FROM conspace.article_niches an JOIN conspace.niches n ON n.id=an.niche_id AND n.is_active=true",
  "WHERE an.article_id=a.id),'[]'::json) AS niches",
 ].join(' ');
 const published=[
  "a.status='PUBLISHED'","a.approved_by IS NOT NULL","a.approved_at IS NOT NULL","a.published_at<=now()",
  "(a.content_type<>'FIELD_CASE' OR EXISTS(SELECT 1 FROM conspace.field_notes f WHERE f.article_id=a.id AND f.unit_anonymized=true AND f.address_anonymized=true AND f.photo_rights_confirmed=true))",
 ].join(' AND ');
 return {
  async niches(group){
   const sql=[
    'SELECT n.id,n.slug,n.name,n.group_type AS "group",n.summary,n.template_key AS "templateType",',
    "CASE n.template_key WHEN 'TEMPLATE_A' THEN 12 ELSE 7 END AS \"expectedSectionCount\",",
    'COUNT(DISTINCT a.id)::integer AS "articleCount"',
    'FROM conspace.niches n LEFT JOIN conspace.article_niches an ON an.niche_id=n.id',
    "LEFT JOIN conspace.articles a ON a.id=an.article_id AND a.status='PUBLISHED' AND a.approved_by IS NOT NULL AND a.approved_at IS NOT NULL AND a.published_at<=now()",
    "AND (a.content_type<>'FIELD_CASE' OR EXISTS(SELECT 1 FROM conspace.field_notes f WHERE f.article_id=a.id AND f.unit_anonymized=true AND f.address_anonymized=true AND f.photo_rights_confirmed=true))",
    'WHERE n.is_active=true AND ($1::text IS NULL OR n.group_type=$1)',
    'GROUP BY n.id ORDER BY CASE n.group_type WHEN \'design\' THEN 0 ELSE 1 END,n.sort_order,n.name,n.id',
   ].join(' ');
   return (await query(sql,[group??null])).rows;
  },
  async articles({role,niche,limit,cursor}){
   const rank="CASE WHEN $1::text IS NOT NULL AND a.audience_role=$1 THEN 0 ELSE 1 END";
   const cover="COALESCE(a.cover_image_url,(SELECT '/api/v1/media/' || am.media_id::text FROM conspace.article_media am JOIN conspace.media_assets m ON m.id=am.media_id WHERE am.article_id=a.id AND am.role='COVER' AND m.rights_confirmed=true AND m.deleted_at IS NULL ORDER BY am.position LIMIT 1))";
   if(role&&cursor?.v!==1){
    const sql=[
     'SELECT a.id,a.slug,a.title,a.excerpt,'+cover+' AS "coverImage",',
     'a.published_at AS "publishedAt",au.display_name AS "authorName",au.verified AS "authorVerified",',
     rank+' AS "preferenceRank",'+nicheFields,
     'FROM conspace.articles a JOIN conspace.authors au ON au.id=a.author_id',
     'WHERE '+published,
     'AND ($2::text IS NULL OR EXISTS(SELECT 1 FROM conspace.article_niches an2 JOIN conspace.niches n2 ON n2.id=an2.niche_id AND n2.is_active=true WHERE an2.article_id=a.id AND n2.slug=$2))',
     'AND ($3::integer IS NULL OR '+rank+' > $3 OR ('+rank+'=$3 AND (a.published_at,a.id)<($4::timestamptz,$5::uuid)))',
     'ORDER BY "preferenceRank",a.published_at DESC,a.id DESC LIMIT $6',
    ].join(' ');
    return (await query(sql,[role,niche??null,cursor?.preferenceRank??null,cursor?.publishedAt??null,cursor?.id??null,limit+1])).rows;
   }
   const sql=[
    'SELECT a.id,a.slug,a.title,a.excerpt,'+cover+' AS "coverImage",',
    'a.published_at AS "publishedAt",au.display_name AS "authorName",au.verified AS "authorVerified",',
    rank+' AS "preferenceRank",'+nicheFields,
    'FROM conspace.articles a JOIN conspace.authors au ON au.id=a.author_id',
    'WHERE '+published,
    'AND ($2::text IS NULL OR EXISTS(SELECT 1 FROM conspace.article_niches an2 JOIN conspace.niches n2 ON n2.id=an2.niche_id AND n2.is_active=true WHERE an2.article_id=a.id AND n2.slug=$2))',
    'AND ($3::timestamptz IS NULL OR (a.published_at,a.id)<($3::timestamptz,$4::uuid))',
    'ORDER BY a.published_at DESC,a.id DESC LIMIT $5',
   ].join(' ');
   return (await query(sql,[role??null,niche??null,cursor?.publishedAt??null,cursor?.id??null,limit+1])).rows;
  },
  async articleBySlug(slug){
   const sql=[
    'SELECT a.id,a.slug,a.title,a.excerpt,a.body,a.published_at AS "publishedAt",a.updated_at AS "updatedAt",',
    "COALESCE(a.cover_image_url,(SELECT '/api/v1/media/' || am.media_id::text FROM conspace.article_media am JOIN conspace.media_assets m ON m.id=am.media_id WHERE am.article_id=a.id AND am.role='COVER' AND m.rights_confirmed=true AND m.deleted_at IS NULL ORDER BY am.position LIMIT 1)) AS \"coverImage\",",
    'au.display_name AS "authorName",au.verified AS "authorVerified",'+nicheFields+',',
    "COALESCE((SELECT json_agg(json_build_object('title',s.title,'url',s.url,'citation',s.citation) ORDER BY s.position) FROM conspace.article_sources s WHERE s.article_id=a.id),'[]'::json) AS sources",
    'FROM conspace.articles a JOIN conspace.authors au ON au.id=a.author_id',
    'WHERE a.slug=$1 AND '+published+' LIMIT 1',
   ].join(' ');
   return (await query(sql,[slug])).rows[0]??null;
  },
  async terms(q,limit){
   const predicate="t.status='PUBLISHED' AND t.reviewed_by IS NOT NULL AND t.reviewed_at IS NOT NULL AND t.source_ref IS NOT NULL AND ($1::text='' OR position($1 in lower(t.term))>0 OR position($1 in lower(t.definition))>0)";
   const sql=[
    'SELECT t.id,t.term,t.slug,t.definition,',
    "COALESCE((SELECT json_agg(n.slug ORDER BY n.sort_order,n.slug) FROM conspace.term_niches tn JOIN conspace.niches n ON n.id=tn.niche_id AND n.is_active=true WHERE tn.term_id=t.id),'[]'::json) AS niches",
    'FROM conspace.terms t WHERE '+predicate,'ORDER BY lower(t.term),t.id LIMIT $2',
   ].join(' ');
   const text=q.trim().toLowerCase(),result=await query(sql,[text,limit]);
   const count=await query('SELECT COUNT(*)::integer AS total FROM conspace.terms t WHERE '+predicate,[text]);
   return {rows:result.rows,total:count.rows[0]?.total??0};
  },
 };
}
