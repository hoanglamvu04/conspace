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
  return {
    cookie:response.headers.get('set-cookie').split(';')[0],
    csrfToken:response.body.data.csrfToken,
    id:response.body.data.user.id,
  };
}

test('real PostgreSQL flow: login -> create -> technical review -> chief review -> publish -> public GET', {
  skip: onIsolatedCiDb ? false : 'Runs only against isolated PostgreSQL service in GitHub Actions CI',
}, async(t) => {
  assert.ok(pool);
  const migrated=await runMigrations(pool);
  assert.ok(migrated.migrations>=3);
  const repeated=await runMigrations(pool);
  assert.equal(repeated.applied,0);
  await seedTaxonomy(pool);
  const base=await startServer(t);

  const password='CI-e2e-'+randomBytes(15).toString('base64url');
  const adminEmail='admin-'+uuidSuffix+'@conspace.test';
  const editorEmail='editor-'+uuidSuffix+'@conspace.test';
  const reviewerEmail='reviewer-'+uuidSuffix+'@conspace.test';
  const chiefEmail='chief-'+uuidSuffix+'@conspace.test';

  await createAuthService(pool).bootstrapAdmin({
    email:adminEmail,displayName:'CI Admin',password,
  });
  const admin=await login(base,adminEmail,password);
  const adminApi=api(base,admin);

  for(const [email,name,role] of [
    [editorEmail,'CI Editor','EDITOR'],
    [reviewerEmail,'CI Technical','TECHNICAL_REVIEWER'],
    [chiefEmail,'CI Chief','EDITOR_IN_CHIEF'],
  ]){
    const created=await adminApi('POST','/api/admin/users/',{
      email,displayName:name,role,password,
    });
    assert.equal(created.status,201,JSON.stringify(created.body));
  }

  const editor=await login(base,editorEmail,password);
  const reviewer=await login(base,reviewerEmail,password);
  const chief=await login(base,chiefEmail,password);
  const editorApi=api(base,editor);
  const reviewerApi=api(base,reviewer);
  const chiefApi=api(base,chief);

  const slug='ci-reviewed-'+uuidSuffix;
  const created=await editorApi('POST','/api/admin/articles/',{
    slug,title:'Ghi chép được kiểm chứng',excerpt:'Nội dung có nguồn',
    body:'Ghi chép thử nghiệm từ CI, không có tên đơn vị.',
    audienceRole:'homeowner',contentType:'EDITORIAL',
    sensitivityAssessed:true,sensitivityFlags:['INDUSTRY_DARK_SIDE'],
    sources:[{title:'Nguồn kỹ thuật thử nghiệm',citation:'CI test only'}],
  });
  assert.equal(created.status,201,JSON.stringify(created.body));
  const id=created.body.data.id;
  assert.ok(id);

  const hidden=await api(base)('GET','/api/v1/articles/'+slug);
  assert.equal(hidden.status,404);

  const submitted=await editorApi('POST','/api/admin/articles/'+id+'/submit',{});
  assert.equal(submitted.status,200,JSON.stringify(submitted.body));
  assert.equal(submitted.body.data.status,'SUBMITTED');

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

  const chiefApproval=await chiefApi('POST','/api/admin/reviews/articles/'+id+'/decision',{
    stage:'EDITOR_IN_CHIEF',decision:'APPROVED',reason:'Nội dung đã ẩn danh',
  });
  assert.equal(chiefApproval.status,200,JSON.stringify(chiefApproval.body));
  assert.equal(chiefApproval.body.data.status,'APPROVED');

  const published=await chiefApi('POST','/api/admin/articles/'+id+'/publish',{});
  assert.equal(published.status,200,JSON.stringify(published.body));
  assert.equal(published.body.data.status,'PUBLISHED');
  const visible=await api(base)('GET','/api/v1/articles/'+slug);
  assert.equal(visible.status,200,JSON.stringify(visible.body));
  assert.equal(visible.body.data.body,'Ghi chép thử nghiệm từ CI, không có tên đơn vị.');

  const history=await editorApi('GET','/api/admin/articles/'+id+'/revisions');
  assert.equal(history.status,200);
  assert.ok(history.body.data.length>=1);

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
