#!/usr/bin/env node
// Read-only public acceptance: local loopback only, no CMS credentials, no DB writes.
import { fileURLToPath } from 'node:url';

export function onlyLocal(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(label + ' must be a URL'); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(label + ' must be a local HTTP loopback base URL');
  }
  return url;
}

export const PUBLIC_ROUTES = Object.freeze([
  '/', '/tu-sach', '/tu-sach/cam-nang-kien-truc-hoa-lac',
  '/ngach', '/mang/house', '/bai-viet', '/bai-viet/demo-public-design-overview',
  '/ban-nghe', '/hien-truong', '/hoi-dap', '/hoi-dap/gui-cau-hoi',
  '/tra-nhanh', '/tu-dien', '/tu-dien/demo-thuat-ngu-cong-khai', '/ket-noi', '/ket-noi/du-an',
  '/ve-conspace', '/quy-tac-noi-dung', '/lien-he',
]);

export function assertPublishedOnly({ published, draft, fieldDraft, listedQuestions }) {
  if (published?.slug !== 'demo-public-design-overview') throw new Error('Published demo article missing or mismatched');
  if (draft.status !== 404) throw new Error('Unpublished article unexpectedly exposed');
  if (fieldDraft.status !== 404) throw new Error('Draft field note unexpectedly exposed');
  if (!Array.isArray(listedQuestions)) throw new Error('Public questions shape is invalid');
  if (listedQuestions.some((q) => String(q.description || '').startsWith('[DEMO] Câu hỏi mô phỏng'))) {
    throw new Error('Unpublished demo question exposed in public list');
  }
}

export async function runPublicAcceptance({fetcher=fetch,env=process.env,log=console.log}={}) {
  const frontend=onlyLocal(env.CONSPACE_FRONTEND_URL || 'http://127.0.0.1:5176/', 'Frontend');
  const api=onlyLocal(env.CONSPACE_API_URL || 'http://127.0.0.1:5088/', 'Backend');
  const get=async(base,path,status=200)=>{
    let res;
    try {res=await fetcher(new URL(path,base),{method:'GET',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(12000)});}
    catch {throw new Error('Cannot connect to local service for '+path);}
    if(res.status!==status)throw new Error(path+': HTTP '+res.status+' expected '+status);
    return res;
  };
  const json=async(path,status=200)=>{
    const res=await get(api,path,status);
    const data=await res.json().catch(()=>null);
    if(!data || (status===200 && data.ok!==true))throw new Error(path+': invalid public API response');
    return {data:data.data,status:res.status,meta:data.meta,checks:data.checks,error:data.error};
  };
  const ready=await json('/api/ready');
  if(ready.checks?.database!=='up')throw new Error('PostgreSQL not ready');
  for(const route of PUBLIC_ROUTES)await get(frontend,route);
  log('PASS: '+PUBLIC_ROUTES.length+' public route entry points return HTTP 200');
  for(const role of ['homeowner','architect','contractor']){
    const feed=await json('/api/v1/feed?role='+role+'&limit=6');
    for(const key of ['books','articles','fieldNotes','questions']) if(!Array.isArray(feed.data?.[key]))throw new Error('Feed '+role+' invalid '+key);
    log('PASS: reader feed '+role);
  }
  const niches=await json('/api/v1/niches');
  if(!Array.isArray(niches.data) || !niches.data.some(n=>n.slug==='house'&&n.group==='design'))throw new Error('Missing seeded HOUSE design niche');
  const detail=await json('/api/v1/niches/house?role=architect');
  if(detail.data?.templateType!=='TEMPLATE_B' || !Array.isArray(detail.data?.sections) || detail.data.sections.length!==7)throw new Error('HOUSE Template B slot count invalid');
  for(const s of detail.data.sections)if(s.content && !s.sourceRef)throw new Error('Public niche content has no source');
  log('PASS: taxonomy and source-backed Template B');
  const books=await json('/api/v1/books');
  if(!Array.isArray(books.data) || !books.data.some(b=>b.slug==='cam-nang-kien-truc-hoa-lac'))throw new Error('Documented book missing');
  const book=await json('/api/v1/books/cam-nang-kien-truc-hoa-lac');
  if(!Array.isArray(book.data?.chapters))throw new Error('Book chapters shape invalid');
  for(const chapter of book.data.chapters){
    const entry=await json('/api/v1/books/cam-nang-kien-truc-hoa-lac/chapters/'+chapter.chapterNo);
    if(entry.data?.chapterNo!==chapter.chapterNo)throw new Error('Book chapter detail mismatch');
  }
  log('PASS: published book and chapter navigation');
  const pub=await json('/api/v1/articles/demo-public-design-overview');
  const draft=await json('/api/v1/articles/demo-review-needs-changes',404);
  const field=await json('/api/v1/field-notes/demo-field-ready',404);
  const questions=await json('/api/v1/questions?page=1&limit=10');
  if(questions.meta?.page!==1 || questions.meta?.limit!==10 || !Number.isInteger(questions.meta?.total) || typeof questions.meta?.hasMore!=='boolean')throw new Error('Q&A pagination metadata invalid');
  assertPublishedOnly({published:pub.data,draft,fieldDraft:field,listedQuestions:questions.data});
  log('PASS: published article accessible; draft article, field note and Q&A hidden');
  log('PASS: public Q&A pagination metadata');
  const term=await json('/api/v1/terms/demo-thuat-ngu-cong-khai');
  const draftTerm=await json('/api/v1/terms/demo-thuat-ngu-can-sua',404);
  if(term.data?.slug!=='demo-thuat-ngu-cong-khai' || !term.data?.sourceRef || draftTerm.error?.code!=='NOT_FOUND') {
    throw new Error('Dictionary acceptance: published term inaccessible or unpublished term exposed');
  }
  log('PASS: Dictionary published term source and unpublished term isolation');
  const search=await json('/api/v1/search?q=conspace&role=architect&limit=5');
  if(!Array.isArray(search.data))throw new Error('Public search shape invalid');
  log('PASS: public search');
  log('PASS: CONSPACE Public Web read-only acceptance complete.');
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  runPublicAcceptance().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
}
