import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { app } from '../src/app.js';
import { pool } from '../src/database/pool.js';
import { runMigrations } from '../src/database/migrate.js';
import { seedTaxonomy } from '../src/database/seed.js';
import { createAuthService } from '../src/services/auth.js';
import { createEditorialService } from '../src/services/editorial.js';

const onIsolatedCiDb = process.env.GITHUB_ACTIONS === 'true' &&
  process.env.NODE_ENV === 'test' &&
  /^postgresql:\/\/conspace_app:[^@]+@127\.0\.0\.1:5432\/conspace$/.test(process.env.DATABASE_URL || '');
const uuidSuffix = randomBytes(6).toString('hex');

async function startServer(t) {
  const server = app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(() => new Promise(resolve=>server.close(resolve)));
  return 'http://127.0.0.1:'+server.address().port;
}

function api(base,session) {
  return async(method,path,body) => {
    const headers = {};
    if(body!==undefined) headers['content-type']='application/json';
    if(session?.cookie){
      headers.cookie=session.cookie;
      headers['x-csrf-token']=session.csrfToken;
    }
    const res=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    const json=await res.json();
    return {status:res.status,body:json,headers:res.headers};
  };
}

async function login(base,email,password) {
  const response=await api(base)('POST','/api/admin/auth/login',{email,password});
  assert.equal(response.status,200,JSON.stringify(response.body));
  const user=response.body.data.user;
  return {
    cookie:response.headers.get('set-cookie').split(';')[0],
    csrfToken:response.body.data.csrfToken,
    id:user.id,
    role:user.role,
    roles:user.roles,
    permissions:user.permissions,
    personId:user.personId,
  };
}

test('real PostgreSQL flow: login -> create -> technical review -> chief review -> publish -> public GET', {
  skip: onIsolatedCiDb ? false : 'Runs only against isolated PostgreSQL service in GitHub Actions CI',
}, async(t) => {
  assert.ok(pool);
  const migrated=await runMigrations(pool);
  assert.ok(migrated.migrations>=4);
  const repeated=await runMigrations(pool);
  assert.equal(repeated.applied,0);
  await seedTaxonomy(pool);
  const base=await startServer(t);

  const password='CI-e2e-'+randomBytes(15).toString('base64url');
  const adminEmail='admin-'+uuidSuffix+'@conspace.test';
  const editorEmail='editor-'+uuidSuffix+'@conspace.test';
  const reviewerEmail='reviewer-'+uuidSuffix+'@conspace.test';
  const chiefEmail='chief-'+uuidSuffix+'@conspace.test';
  const publisherEmail='publisher-'+uuidSuffix+'@conspace.test';
  const aliasEmail='reviewer-alias-'+uuidSuffix+'@conspace.test';
  const hybridEmail='hybrid-'+uuidSuffix+'@conspace.test';
  const adminChiefEmail='admin-chief-'+uuidSuffix+'@conspace.test';

  await createAuthService(pool).bootstrapAdmin({
    email:adminEmail,displayName:'CI Admin',password,
  });
  const admin=await login(base,adminEmail,password);
  assert.deepEqual(admin.roles,['ADMIN']);assert.deepEqual(admin.permissions,[]);
  const adminApi=api(base,admin);
  const publisherCreated=await adminApi('POST','/api/admin/users/',{email:publisherEmail,displayName:'CI Delegated Publisher',role:'ADMIN',permissions:['CONTENT_PUBLISH'],permissionReason:'Explicit CI delegation test',password});
  assert.equal(publisherCreated.status,201,JSON.stringify(publisherCreated.body));

  const createdUsers={};
  for(const [email,name,role] of [
    [editorEmail,'CI Editor','EDITOR'],
    [reviewerEmail,'CI Technical','TECHNICAL_REVIEWER'],
    [chiefEmail,'CI Chief','EDITOR_IN_CHIEF'],
  ]){
    const created=await adminApi('POST','/api/admin/users/',{
      email,displayName:name,role,password,
    });
    assert.equal(created.status,201,JSON.stringify(created.body));
    createdUsers[email]=created.body.data;
  }

  const aliasCreated=await adminApi('POST','/api/admin/users/',{email:aliasEmail,displayName:'CI Reviewer Alias',role:'TECHNICAL_REVIEWER',personId:createdUsers[editorEmail].personId,password});
  assert.equal(aliasCreated.status,201,JSON.stringify(aliasCreated.body));
  const hybridCreated=await adminApi('POST','/api/admin/users/',{email:hybridEmail,displayName:'CI Editor Reviewer',role:'EDITOR',roles:['EDITOR','TECHNICAL_REVIEWER'],roleReason:'Regression test for creator self-review',password});
  assert.equal(hybridCreated.status,201,JSON.stringify(hybridCreated.body));
  const adminChiefCreated=await adminApi('POST','/api/admin/users/',{email:adminChiefEmail,displayName:'CI Admin Chief',role:'ADMIN',roles:['ADMIN','EDITOR_IN_CHIEF'],roleReason:'Regression test for technical-review separation',password});
  assert.equal(adminChiefCreated.status,201,JSON.stringify(adminChiefCreated.body));
  const selfAlias=await adminApi('POST','/api/admin/users/',{email:'self-alias-'+uuidSuffix+'@conspace.test',displayName:'Forbidden Self Alias',role:'TECHNICAL_REVIEWER',personId:admin.personId,password});
  assert.equal(selfAlias.status,403);
  const editor=await login(base,editorEmail,password);
  const reviewer=await login(base,reviewerEmail,password);
  const chief=await login(base,chiefEmail,password);
  const reviewerAlias=await login(base,aliasEmail,password);
  const publisher=await login(base,publisherEmail,password);
  const hybrid=await login(base,hybridEmail,password);
  const adminChief=await login(base,adminChiefEmail,password);
  assert.deepEqual(publisher.roles,['ADMIN']);assert.deepEqual(publisher.permissions,['CONTENT_PUBLISH']);
  const editorApi=api(base,editor);
  const reviewerApi=api(base,reviewer);
  const chiefApi=api(base,chief);
  const reviewerAliasApi=api(base,reviewerAlias);
  const publisherApi=api(base,publisher);
  const hybridApi=api(base,hybrid);
  const adminChiefApi=api(base,adminChief);
  for(const path of ['/api/admin/terms/','/api/admin/questions/','/api/admin/niches/']){
    const readable=await publisherApi('GET',path);
    assert.equal(readable.status,200,JSON.stringify(readable.body));
  }

  const invalidSlug='ci-invalid-article-'+uuidSuffix;
  const invalidDraft=await editorApi('POST','/api/admin/articles/',{
    slug:invalidSlug,title:'Bài chưa đủ điều kiện',body:'',audienceRole:'homeowner',
    sensitivityAssessed:true,sensitivityFlags:[],
  });
  assert.equal(invalidDraft.status,201,JSON.stringify(invalidDraft.body));
  const invalidSubmit=await editorApi('POST','/api/admin/articles/'+invalidDraft.body.data.id+'/submit',{});
  assert.equal(invalidSubmit.status,409);
  assert.equal(invalidSubmit.body.error.code,'ARTICLE_CONTENT_REQUIRED');
  const invalidStillHidden=await api(base)('GET','/api/v1/articles/'+invalidSlug);
  assert.equal(invalidStillHidden.status,404);

  const slug='ci-reviewed-'+uuidSuffix;
  const created=await editorApi('POST','/api/admin/articles/',{
    slug,title:'Ghi chép được kiểm chứng',excerpt:'Nội dung có nguồn',
    body:'Ghi chép thử nghiệm từ CI về một công trình, không có tên đơn vị.',
    audienceRole:'homeowner',contentType:'EDITORIAL',
    sensitivityAssessed:true,sensitivityFlags:['INDUSTRY_DARK_SIDE'],
    sources:[{title:'Nguồn kỹ thuật thử nghiệm',citation:'CI test only'}],
  });
  assert.equal(created.status,201,JSON.stringify(created.body));
  const id=created.body.data.id;
  assert.ok(id);
  const edited=await editorApi('PATCH','/api/admin/articles/'+id,{
    title:'Ghi chép đã biên tập',changeReason:'Hiệu đính nội dung trước khi duyệt',
  });
  assert.equal(edited.status,200,JSON.stringify(edited.body));

  const hidden=await api(base)('GET','/api/v1/articles/'+slug);
  assert.equal(hidden.status,404);

  const submitted=await editorApi('POST','/api/admin/articles/'+id+'/submit',{});
  assert.equal(submitted.status,200,JSON.stringify(submitted.body));
  assert.equal(submitted.body.data.status,'SUBMITTED');

  const adminStart=await adminApi('POST','/api/admin/reviews/articles/'+id+'/start',{});assert.equal(adminStart.status,403);
  const aliasStart=await reviewerAliasApi('POST','/api/admin/reviews/articles/'+id+'/start',{});assert.equal(aliasStart.status,403);
  const queue=await reviewerApi('GET','/api/admin/reviews/queue?stage=TECHNICAL');
  assert.equal(queue.status,200,JSON.stringify(queue.body));
  assert.ok(queue.body.data.articles.some(a=>a.id===id));

  const started=await reviewerApi('POST','/api/admin/reviews/articles/'+id+'/start',{});
  assert.equal(started.status,200,JSON.stringify(started.body));

  const reviewerApproval=await reviewerApi('POST','/api/admin/reviews/articles/'+id+'/decision',{
    stage:'TECHNICAL',decision:'APPROVED',reason:'Đã kiểm tra nguồn kỹ thuật',
  });
  assert.equal(reviewerApproval.status,200,JSON.stringify(reviewerApproval.body));
  assert.equal(reviewerApproval.body.data.status,'EDITOR_IN_CHIEF_REVIEW');

  const blocked=await editorApi('POST','/api/admin/articles/'+id+'/publish',{});
  assert.equal(blocked.status,403);

  const delegatedChiefReview=await publisherApi('POST','/api/admin/reviews/articles/'+id+'/decision',{stage:'EDITOR_IN_CHIEF',decision:'APPROVED',reason:'Publishing grant does not grant chief review'});assert.equal(delegatedChiefReview.status,403);
  const chiefApproval=await chiefApi('POST','/api/admin/reviews/articles/'+id+'/decision',{
    stage:'EDITOR_IN_CHIEF',decision:'APPROVED',reason:'Nội dung đã ẩn danh',
  });
  assert.equal(chiefApproval.status,200,JSON.stringify(chiefApproval.body));
  assert.equal(chiefApproval.body.data.status,'APPROVED');

  const adminPublish=await adminApi('POST','/api/admin/articles/'+id+'/publish',{});assert.equal(adminPublish.status,403);
  const published=await chiefApi('POST','/api/admin/articles/'+id+'/publish',{});
  assert.equal(published.status,200,JSON.stringify(published.body));
  assert.equal(published.body.data.status,'PUBLISHED');
  const visible=await api(base)('GET','/api/v1/articles/'+slug);
  assert.equal(visible.status,200,JSON.stringify(visible.body));
  assert.equal(visible.body.data.body,'Ghi chép thử nghiệm từ CI về một công trình, không có tên đơn vị.');

  const secondSlug='ci-contractor-'+uuidSuffix;
  const secondDraft=await editorApi('POST','/api/admin/articles/',{
    slug:secondSlug,title:'Góc nhìn nhà thầu về công trình',excerpt:'Bài kiểm tra lens',
    body:'Bài kiểm tra xếp hạng cho một công trình; người đọc ở mọi góc nhìn vẫn đọc được.',
    audienceRole:'contractor',contentType:'EDITORIAL',sensitivityAssessed:true,sensitivityFlags:[],
    sources:[{title:'Nguồn thử nghiệm',citation:'CI test only'}],
  });
  assert.equal(secondDraft.status,201,JSON.stringify(secondDraft.body));
  const secondId=secondDraft.body.data.id;
  assert.equal((await editorApi('POST','/api/admin/articles/'+secondId+'/submit',{})).status,200);
  assert.equal((await reviewerApi('POST','/api/admin/reviews/articles/'+secondId+'/start',{})).status,200);
  const secondDecision=await reviewerApi('POST','/api/admin/reviews/articles/'+secondId+'/decision',{
    stage:'TECHNICAL',decision:'APPROVED',reason:'Đã kiểm tra nguồn và nội dung',
  });
  assert.equal(secondDecision.status,200,JSON.stringify(secondDecision.body));
  const publisherReview=await publisherApi('POST','/api/admin/reviews/articles/'+secondId+'/start',{});
  assert.equal(publisherReview.status,403);
  const delegatedPublish=await publisherApi('POST','/api/admin/articles/'+secondId+'/publish',{});
  assert.equal(delegatedPublish.status,200,JSON.stringify(delegatedPublish.body));
  const delegatedWithdraw=await publisherApi('POST','/api/admin/articles/'+secondId+'/withdraw',{reason:'Requires separate withdrawal grant'});
  assert.equal(delegatedWithdraw.status,403);

  // Explicit CONTENT_PUBLISH delegates publication only; ADMIN without that grant cannot publish.
  const termDraft=await editorApi('POST','/api/admin/terms/',{
    term:'CI term '+uuidSuffix,slug:'ci-term-'+uuidSuffix,
    definition:'Định nghĩa kiểm chứng dành riêng cho kiểm thử CI.',
    sourceRef:'CI fixture: verified term source',
  });
  assert.equal(termDraft.status,201,JSON.stringify(termDraft.body));
  const termId=termDraft.body.data.id;
  assert.equal((await editorApi('POST','/api/admin/terms/'+termId+'/submit',{})).status,200);
  const adminChiefTermStart=await adminChiefApi('POST','/api/admin/reviews/terms/'+termId+'/start',{});
  assert.equal(adminChiefTermStart.status,403,JSON.stringify(adminChiefTermStart.body));
  assert.equal((await reviewerApi('POST','/api/admin/reviews/terms/'+termId+'/start',{})).status,200);
  const termDecision=await reviewerApi('POST','/api/admin/reviews/terms/'+termId+'/decision',{
    decision:'APPROVED',reason:'Định nghĩa và nguồn đạt yêu cầu',
  });
  assert.equal(termDecision.status,200,JSON.stringify(termDecision.body));
  const adminTermPublish=await adminApi('POST','/api/admin/terms/'+termId+'/publish',{});
  assert.equal(adminTermPublish.status,403);
  const delegatedTermPublish=await publisherApi('POST','/api/admin/terms/'+termId+'/publish',{});
  assert.equal(delegatedTermPublish.status,200,JSON.stringify(delegatedTermPublish.body));

  const lensArticles=await api(base)('GET','/api/v1/articles?role=homeowner&limit=50');
  assert.equal(lensArticles.status,200,JSON.stringify(lensArticles.body));
  assert.ok(lensArticles.body.data.some(a=>a.slug===slug));
  assert.ok(lensArticles.body.data.some(a=>a.slug===secondSlug),'published contractor article remains visible to homeowner lens');
  assert.equal(lensArticles.body.data[0].slug,slug);
  const lensSearch=await api(base)('GET','/api/v1/search?q=c%C3%B4ng%20tr%C3%ACnh&type=article&role=homeowner');
  assert.equal(lensSearch.status,200,JSON.stringify(lensSearch.body));
  assert.ok(lensSearch.body.data.some(a=>a.slug===secondSlug));
  assert.equal(lensSearch.body.data[0].slug,slug);


  const feed=await api(base)('GET','/api/v1/feed?limit=10&role=homeowner');
  assert.equal(feed.status,200,JSON.stringify(feed.body));
  assert.ok(feed.body.data.articles.some(a=>a.slug===slug));
  assert.ok(feed.body.data.articles.some(a=>a.slug===secondSlug));
  assert.equal(feed.body.data.articles[0].slug,slug);
  assert.equal(feed.body.meta.preferredAudienceRole,'homeowner');

  const search=await api(base)('GET','/api/v1/search?q=Ghi%20ch%C3%A9p&type=article&limit=10');
  assert.equal(search.status,200,JSON.stringify(search.body));
  assert.ok(search.body.data.some(a=>a.slug===slug));

  const books=await api(base)('GET','/api/v1/books');
  assert.equal(books.status,200,JSON.stringify(books.body));
  assert.equal(books.body.data.length,3);
  assert.ok(books.body.data.some(b=>b.contentLabel==='FICTIONALIZED'));
  const oneBook=await api(base)('GET','/api/v1/books/cam-nang-kien-truc-hoa-lac');
  assert.equal(oneBook.status,200,JSON.stringify(oneBook.body));
  assert.deepEqual(oneBook.body.data.chapters,[]);

  const niche=await api(base)('GET','/api/v1/niches/house?role=homeowner');
  assert.equal(niche.status,200,JSON.stringify(niche.body));
  assert.equal(niche.body.data.templateType,'TEMPLATE_B');
  assert.equal(niche.body.data.sections.length,7);
  assert.ok(niche.body.data.sections.every(s=>Array.isArray(s.layers)&&s.layers.length===0));
  const group=await pool.query('INSERT INTO conspace.niche_groups(slug,name,source_ref) VALUES($1,$2,$3) RETURNING id',['ci-group-'+uuidSuffix,'CI test construction group','CI fixture only']);
  const constructionNiche=await pool.query('INSERT INTO conspace.niches(slug,name,group_type,template_key,source_ref,is_active,niche_group_id) VALUES($1,$2,\'construction\',\'TEMPLATE_A\',$3,true,$4) RETURNING id',['ci-construction-'+uuidSuffix,'CI test construction niche','CI fixture only',group.rows[0].id]);
  const constructionNicheId=constructionNiche.rows[0].id;
  const constructionSlug='ci-construction-'+uuidSuffix;
  const templateA=await api(base)('GET','/api/v1/niches/'+constructionSlug+'?role=contractor');
  assert.equal(templateA.status,200,JSON.stringify(templateA.body));
  assert.equal(templateA.body.data.templateType,'TEMPLATE_A');assert.equal(templateA.body.data.sections.length,12);
  assert.deepEqual(templateA.body.data.sections[0].layers.map(x=>x.audienceRole),['contractor','homeowner']);
  assert.ok([2,9,10].every(no=>templateA.body.data.sections[no-1].layers.some(x=>x.audienceRole==='architect')));
  assert.ok(niche.body.data.sections.every(s=>Array.isArray(s.layers)));

  // Real Template A section workflow: author -> technical review -> publish -> public layer.
  const sectionSaved=await editorApi('PUT','/api/admin/niches/'+constructionNicheId+'/sections/1',{
    audienceRole:'homeowner',content:'Nội dung lớp chủ nhà đã có nguồn và được kiểm tra.',
    sourceRef:'CI fixture: verified editorial source',sensitivityAssessed:true,sensitivityFlags:[],
  });
  assert.equal(sectionSaved.status,200,JSON.stringify(sectionSaved.body));
  const sectionId=sectionSaved.body.data.id;
  const sectionSubmitted=await editorApi('POST','/api/admin/niches/'+constructionNicheId+'/sections/1/submit',{
    audienceRole:'homeowner',reason:'Gửi khối nội dung để duyệt kỹ thuật',
  });
  assert.equal(sectionSubmitted.status,200,JSON.stringify(sectionSubmitted.body));
  const technicalQueue=await reviewerApi('GET','/api/admin/reviews/queue?stage=TECHNICAL');
  assert.equal(technicalQueue.status,200,JSON.stringify(technicalQueue.body));
  assert.ok(technicalQueue.body.data.nicheSections.some(item=>item.id===sectionId),'Submitted niche section must appear in the technical review queue');
  const sectionStarted=await reviewerApi('POST','/api/admin/reviews/niche-sections/'+sectionId+'/start',{templateType:'TEMPLATE_A'});
  assert.equal(sectionStarted.status,200,JSON.stringify(sectionStarted.body));
  const sectionDecision=await reviewerApi('POST','/api/admin/reviews/niche-sections/'+sectionId+'/decision',{
    templateType:'TEMPLATE_A',stage:'TECHNICAL',decision:'APPROVED',reason:'Đã kiểm tra nội dung và nguồn',
  });
  assert.equal(sectionDecision.status,200,JSON.stringify(sectionDecision.body));
  assert.equal(sectionDecision.body.data.status,'APPROVED');
  const sectionPublished=await publisherApi('POST','/api/admin/niches/'+constructionNicheId+'/sections/1/publish',{
    audienceRole:'homeowner',reason:'Xuất bản khối đã qua duyệt kỹ thuật',
  });
  assert.equal(sectionPublished.status,200,JSON.stringify(sectionPublished.body));
  const publicNiche=await api(base)('GET','/api/v1/niches/'+constructionSlug+'?role=homeowner');
  assert.equal(publicNiche.status,200,JSON.stringify(publicNiche.body));
  assert.equal(publicNiche.body.data.sections[0].layers.find(x=>x.audienceRole==='homeowner').content,'Nội dung lớp chủ nhà đã có nguồn và được kiểm tra.');
  assert.equal(publicNiche.body.data.sections[0].layers.find(x=>x.audienceRole==='contractor').content,null);
  const publishedOverwrite=await editorApi('PUT','/api/admin/niches/'+constructionNicheId+'/sections/1',{
    audienceRole:'homeowner',content:'Không được ghi đè trực tiếp bản đang live.',
    sourceRef:'CI fixture: attempted live overwrite',sensitivityAssessed:true,sensitivityFlags:[],
  });
  assert.equal(publishedOverwrite.status,409,JSON.stringify(publishedOverwrite.body));
  assert.equal(publishedOverwrite.body.error.code,'PUBLISHED_REVISION_REQUIRED');
  const publicNicheAfterBlockedEdit=await api(base)('GET','/api/v1/niches/'+constructionSlug+'?role=homeowner');
  assert.equal(publicNicheAfterBlockedEdit.body.data.sections[0].layers.find(x=>x.audienceRole==='homeowner').content,'Nội dung lớp chủ nhà đã có nguồn và được kiểm tra.');

  // Sensitive Template A sections require a separate Editor-in-Chief decision.
  const sensitiveSaved=await editorApi('PUT','/api/admin/niches/'+constructionNicheId+'/sections/6',{
    audienceRole:'contractor',content:'Cơ chế rủi ro đã được mô tả ẩn danh, có căn cứ.',
    sourceRef:'CI fixture: verified sensitive source',sensitivityAssessed:true,sensitivityFlags:[],
  });
  assert.equal(sensitiveSaved.status,200,JSON.stringify(sensitiveSaved.body));
  assert.equal(sensitiveSaved.body.data.requires_chief_review,true);
  assert.ok(sensitiveSaved.body.data.sensitivity_flags.includes('INDUSTRY_DARK_SIDE'));
  const sensitiveId=sensitiveSaved.body.data.id;
  assert.equal((await editorApi('POST','/api/admin/niches/'+constructionNicheId+'/sections/6/submit',{
    audienceRole:'contractor',reason:'Gửi nội dung nhạy cảm đi kiểm duyệt',
  })).status,200);
  assert.equal((await reviewerApi('POST','/api/admin/reviews/niche-sections/'+sensitiveId+'/start',{templateType:'TEMPLATE_A'})).status,200);
  const technicalSensitive=await reviewerApi('POST','/api/admin/reviews/niche-sections/'+sensitiveId+'/decision',{
    templateType:'TEMPLATE_A',stage:'TECHNICAL',decision:'APPROVED',reason:'Đạt kiểm tra kỹ thuật',
  });
  assert.equal(technicalSensitive.status,200,JSON.stringify(technicalSensitive.body));
  assert.equal(technicalSensitive.body.data.status,'EDITOR_IN_CHIEF_REVIEW');
  const chiefSensitive=await chiefApi('POST','/api/admin/reviews/niche-sections/'+sensitiveId+'/decision',{
    templateType:'TEMPLATE_A',stage:'EDITOR_IN_CHIEF',decision:'APPROVED',reason:'Đã duyệt nội dung nhạy cảm và ẩn danh',
  });
  assert.equal(chiefSensitive.status,200,JSON.stringify(chiefSensitive.body));
  assert.equal(chiefSensitive.body.data.status,'APPROVED');
  assert.equal((await publisherApi('POST','/api/admin/niches/'+constructionNicheId+'/sections/6/publish',{
    audienceRole:'contractor',reason:'Xuất bản sau hai bước duyệt',
  })).status,200);

  // The original creator cannot decide their own niche section after another editor changes it.
  const selfSectionSaved=await hybridApi('PUT','/api/admin/niches/'+constructionNicheId+'/sections/2',{
    audienceRole:'architect',content:'Bản nháp do người kiêm Editor + Technical Reviewer tạo.',
    sourceRef:'CI fixture: creator identity regression',sensitivityAssessed:true,sensitivityFlags:[],
  });
  assert.equal(selfSectionSaved.status,200,JSON.stringify(selfSectionSaved.body));
  const selfSectionId=selfSectionSaved.body.data.id;
  const selfSectionEdited=await editorApi('PUT','/api/admin/niches/'+constructionNicheId+'/sections/2',{
    audienceRole:'architect',content:'Biên tập viên khác đã sửa nhưng creator gốc không thay đổi.',
    sourceRef:'CI fixture: creator identity regression',sensitivityAssessed:true,sensitivityFlags:[],
  });
  assert.equal(selfSectionEdited.status,200,JSON.stringify(selfSectionEdited.body));
  assert.equal((await editorApi('POST','/api/admin/niches/'+constructionNicheId+'/sections/2/submit',{
    audienceRole:'architect',reason:'Gửi kiểm thử creator identity',
  })).status,200);
  assert.equal((await reviewerApi('POST','/api/admin/reviews/niche-sections/'+selfSectionId+'/start',{templateType:'TEMPLATE_A'})).status,200);
  const selfDecision=await hybridApi('POST','/api/admin/reviews/niche-sections/'+selfSectionId+'/decision',{
    templateType:'TEMPLATE_A',stage:'TECHNICAL',decision:'APPROVED',reason:'Creator must not approve own section',
  });
  assert.equal(selfDecision.status,403,JSON.stringify(selfDecision.body));
  assert.equal(selfDecision.body.error.code,'AUTHOR_CANNOT_APPROVE');

  // Template B (eight architectural areas) uses its own seven-block workflow.
  const designResult=await pool.query("SELECT id,slug FROM conspace.niches WHERE group_type='design' AND is_active=true ORDER BY sort_order LIMIT 1");
  assert.ok(designResult.rows[0],'Seeded design area required for Template B integration test');
  const designNiche=designResult.rows[0];
  const designSaved=await editorApi('PUT','/api/admin/niches/'+designNiche.id+'/sections/1',{
    content:'Đặc thù loại công trình đã được kiểm chứng.',
    sourceRef:'CI fixture: verified architectural source',sensitivityAssessed:true,sensitivityFlags:[],
  });
  assert.equal(designSaved.status,200,JSON.stringify(designSaved.body));
  const designSectionId=designSaved.body.data.id;
  assert.equal((await editorApi('POST','/api/admin/niches/'+designNiche.id+'/sections/1/submit',{
    reason:'Gửi khối kiến trúc đi duyệt',
  })).status,200);
  assert.equal((await reviewerApi('POST','/api/admin/reviews/niche-sections/'+designSectionId+'/start',{templateType:'TEMPLATE_B'})).status,200);
  const designDecision=await reviewerApi('POST','/api/admin/reviews/niche-sections/'+designSectionId+'/decision',{
    templateType:'TEMPLATE_B',stage:'TECHNICAL',decision:'APPROVED',reason:'Đã kiểm tra nguồn và nội dung',
  });
  assert.equal(designDecision.status,200,JSON.stringify(designDecision.body));
  assert.equal((await publisherApi('POST','/api/admin/niches/'+designNiche.id+'/sections/1/publish',{
    reason:'Xuất bản khối kiến trúc đã duyệt',
  })).status,200);
  const publicDesign=await api(base)('GET','/api/v1/niches/'+designNiche.slug+'?role=architect');
  assert.equal(publicDesign.status,200,JSON.stringify(publicDesign.body));
  assert.equal(publicDesign.body.data.sections[0].content,'Đặc thù loại công trình đã được kiểm chứng.');

  const fieldNotes=await api(base)('GET','/api/v1/field-notes');
  assert.equal(fieldNotes.status,200,JSON.stringify(fieldNotes.body));
  assert.deepEqual(fieldNotes.body.data,[]);

  const failedFieldSlug='ci-field-rollback-'+uuidSuffix;
  const failedField=await editorApi('POST','/api/admin/field-notes/',{
    slug:failedFieldSlug,title:'Ca lỗi phải rollback',body:'Nội dung thử rollback có nguồn.',
    audienceRole:'homeowner',sources:[{title:'Nguồn thử rollback',citation:'CI only'}],
    phenomenon:'Hiện tượng kiểm thử',rootCause:'Nguyên nhân kiểm thử',interventionPoint:'Mốc chặn kiểm thử',
    unitAnonymized:true,addressAnonymized:true,photoRightsConfirmed:false,
    mediaIds:['00000000-0000-4000-8000-000000000001'],
  });
  assert.equal(failedField.status,400,JSON.stringify(failedField.body));
  assert.equal(failedField.body.error.code,'INVALID_FIELD_IMAGE');
  const orphanArticle=await pool.query('SELECT id FROM conspace.articles WHERE slug=$1',[failedFieldSlug]);
  assert.equal(orphanArticle.rowCount,0,'failed field-note creation must rollback its article');

  const question=await api(base)('POST','/api/v1/questions',{
    description:'Câu hỏi kiểm thử giữ cờ nhạy cảm sau khi tải lại.',
    requestPrivateReply:'false',
  });
  assert.equal(question.status,201,JSON.stringify(question.body));
  const questionId=question.body.data.id;
  const answerSaved=await editorApi('POST','/api/admin/questions/'+questionId+'/answer',{
    body:'Câu trả lời kiểm thử có nội dung pháp lý.',sensitivityFlags:['LEGAL_CONTENT'],sensitivityAssessed:true,
  });
  assert.equal(answerSaved.status,201,JSON.stringify(answerSaved.body));
  const answerDetail=await editorApi('GET','/api/admin/questions/'+questionId);
  assert.deepEqual(answerDetail.body.data.answerSensitivityFlags,['LEGAL_CONTENT']);
  assert.equal(answerDetail.body.data.answerSensitivityAssessed,true);
  const answerEdited=await editorApi('POST','/api/admin/questions/'+questionId+'/answer',{
    body:'Câu trả lời đã sửa nhưng không gửi lại metadata sensitivity.',
  });
  assert.equal(answerEdited.status,201,JSON.stringify(answerEdited.body));
  assert.deepEqual(answerEdited.body.data.sensitivity_flags,['LEGAL_CONTENT']);
  assert.equal(answerEdited.body.data.requires_chief_review,true);


  const history=await editorApi('GET','/api/admin/articles/'+id+'/revisions');
  assert.equal(history.status,200);
  assert.ok(history.body.data.length>=2);
  assert.equal(history.body.data[0].snapshot.title,'Ghi chép đã biên tập');

  const audit=await pool.query("SELECT action FROM conspace.audit_logs WHERE entity_id=$1 ORDER BY created_at",[id]);
  assert.ok(audit.rows.some(x=>x.action==='ARTICLE_PUBLISHED'));

  const withdrawn=await chiefApi('POST','/api/admin/articles/'+id+'/withdraw',{
    reason:'Kết thúc kiểm tra end-to-end',
  });
  assert.equal(withdrawn.status,200);
  assert.equal((await api(base)('GET','/api/v1/articles/'+slug)).status,404);

  // Create a non-sensitive article and ensure a scheduled future release remains private.
  const scheduledSlug='ci-scheduled-'+uuidSuffix;
  const draft=await editorApi('POST','/api/admin/articles/',{
    slug:scheduledSlug,title:'Chương thử lịch đăng',body:'Nội dung không nhạy cảm.',
    audienceRole:'homeowner',sources:[{title:'Nguồn lịch đăng',citation:'CI test only'}],
    sensitivityAssessed:true,sensitivityFlags:[],
  });
  assert.equal(draft.status,201,JSON.stringify(draft.body));
  const scheduledId=draft.body.data.id;
  assert.equal((await editorApi('POST','/api/admin/articles/'+scheduledId+'/submit',{})).status,200);
  assert.equal((await reviewerApi('POST','/api/admin/reviews/articles/'+scheduledId+'/start',{})).status,200);
  assert.equal((await reviewerApi('POST','/api/admin/reviews/articles/'+scheduledId+'/decision',{
    stage:'TECHNICAL',decision:'APPROVED',reason:'Bài đạt chuẩn',
  })).status,200);

  const future=new Date(Date.now()+3600000).toISOString();
  const scheduled=await editorApi('POST','/api/admin/articles/'+scheduledId+'/schedule',{
    scheduledAt:future,
  });
  assert.equal(scheduled.status,200,JSON.stringify(scheduled.body));
  assert.equal(scheduled.body.data.status,'SCHEDULED');
  assert.equal((await api(base)('GET','/api/v1/articles/'+scheduledSlug)).status,404);

  // Simulate time passing *only on this ephemeral CI database*.
  await pool.query("UPDATE conspace.articles SET scheduled_at=now()-interval '1 second' WHERE id=$1",[scheduledId]);
  assert.ok((await createEditorialService(pool).publishDueArticles())>=1);
  assert.equal((await api(base)('GET','/api/v1/articles/'+scheduledSlug)).status,200);
});
