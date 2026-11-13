import { Router } from 'express';
import { pool } from '../database/pool.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../middleware/admin-auth.js';

const publishedArticle="a.status='PUBLISHED' AND a.approved_by IS NOT NULL AND a.approved_at IS NOT NULL AND a.published_at<=now() AND (a.content_type<>'FIELD_CASE' OR EXISTS(SELECT 1 FROM conspace.field_notes f WHERE f.article_id=a.id AND f.unit_anonymized=true AND f.address_anonymized=true AND f.photo_rights_confirmed=true))";
const checkedField='f.unit_anonymized=true AND f.address_anonymized=true AND f.photo_rights_confirmed=true';
const STATIC_PATHS=[
  '/', '/ngach', '/tu-sach', '/hien-truong', '/hoi-dap', '/tra-nhanh',
  '/bai-viet', '/ban-nghe', '/ve-conspace', '/quy-tac-noi-dung', '/lien-he',
];

function chapterPath(bookSlug,chapterNo){
  const number=Number(chapterNo);
  if(bookSlug==='cam-nang-kien-truc-hoa-lac')return '/cam-nang/phan-'+number+'/muc-'+number;
  if(bookSlug==='phan-nha-thau-xay-dung')return '/phan-nha-thau/chuong-'+number;
  if(bookSlug==='quan-quanh-kts')return '/quan-quanh-kts/chuong-'+number;
  return null;
}

function xmlEscape(value){
  return String(value).replace(/[<>&"']/g,char=>({
    '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;',
  })[char]);
}

function absolute(path){
  return new URL(path,env.publicOrigin).href;
}

function renderEntry({path,lastmod,changefreq='weekly',priority='0.6'}){
  const modified=lastmod?'<lastmod>'+xmlEscape(new Date(lastmod).toISOString())+'</lastmod>':'';
  return '<url><loc>'+xmlEscape(absolute(path))+'</loc>'+modified+
    '<changefreq>'+changefreq+'</changefreq><priority>'+priority+'</priority></url>';
}

export function createSeoRouter(db=pool){
  const router=Router();
  router.get('/sitemap.xml',asyncHandler(async(_req,res)=>{
    if(!db){
      res.status(503).type('text/plain').send('Sitemap unavailable');
      return;
    }
    const [niches,articles,fields,books,chapters,questions]=await Promise.all([
      db.query('SELECT slug,group_type AS "group",updated_at AS "lastmod" FROM conspace.niches WHERE is_active=true ORDER BY group_type,sort_order,name'),
      db.query('SELECT a.slug,a.updated_at AS "lastmod" FROM conspace.articles a WHERE '+publishedArticle+" AND a.content_type<>'FIELD_CASE' ORDER BY a.published_at DESC"),
      db.query('SELECT f.id,a.updated_at AS "lastmod" FROM conspace.field_notes f JOIN conspace.articles a ON a.id=f.article_id WHERE '+publishedArticle+' AND '+checkedField+' ORDER BY a.published_at DESC'),
      db.query('SELECT b.slug,MAX(a.updated_at) AS "lastmod" FROM conspace.books b LEFT JOIN conspace.book_chapters bc ON bc.book_id=b.id LEFT JOIN conspace.articles a ON a.id=bc.article_id AND '+publishedArticle+' WHERE b.is_active=true GROUP BY b.id ORDER BY b.title'),
      db.query('SELECT b.slug AS "bookSlug",bc.chapter_no AS "chapterNo",a.updated_at AS "lastmod" FROM conspace.book_chapters bc JOIN conspace.books b ON b.id=bc.book_id AND b.is_active=true JOIN conspace.articles a ON a.id=bc.article_id WHERE '+publishedArticle+' ORDER BY b.slug,bc.chapter_no'),
      db.query(`SELECT q.id,qa.published_at AS "lastmod" FROM conspace.reader_questions q JOIN conspace.question_answers qa ON qa.question_id=q.id WHERE q.status='PUBLISHED' AND qa.status='PUBLISHED' AND qa.approved_by_user_id IS NOT NULL AND qa.approved_at IS NOT NULL AND qa.published_at<=now() ORDER BY qa.published_at DESC`),
    ]);

    const entries=[
      ...STATIC_PATHS.map(path=>({path,changefreq:path==='/'?'daily':'weekly',priority:path==='/'?'1.0':'0.7'})),
      ...niches.rows.map(row=>({path:(row.group==='design'?'/mang/':'/ngach/')+row.slug,lastmod:row.lastmod,priority:'0.8'})),
      ...articles.rows.map(row=>({path:'/bai-viet/'+row.slug,lastmod:row.lastmod,priority:'0.8'})),
      ...fields.rows.map(row=>({path:'/hien-truong/'+row.id,lastmod:row.lastmod,priority:'0.7'})),
      ...books.rows.map(row=>({path:'/tu-sach/'+row.slug,lastmod:row.lastmod,priority:'0.7'})),
      ...chapters.rows.map(row=>({path:chapterPath(row.bookSlug,row.chapterNo),lastmod:row.lastmod,priority:'0.7'})).filter(row=>row.path),
      ...questions.rows.map(row=>({path:'/hoi-dap/'+row.id,lastmod:row.lastmod,priority:'0.5'})),
    ];
    const unique=[...new Map(entries.map(entry=>[entry.path,entry])).values()];
    const xml='<?xml version="1.0" encoding="UTF-8"?>'+
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+
      unique.map(renderEntry).join('')+'</urlset>';
    res.setHeader('Content-Type','application/xml; charset=utf-8');
    res.setHeader('Cache-Control','public, max-age=300, stale-while-revalidate=60');
    res.send(xml);
  }));
  return router;
}
