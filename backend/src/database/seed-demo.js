import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closeDatabase } from './pool.js';
import { env } from '../config/env.js';
import { assertDedicatedDatabase } from './migrate.js';
import { hashPassword } from '../security/password.js';

const DEMO_SOURCE='DEMO ONLY: synthetic local CONSPACE fixture; never use as editorial evidence';
const DEMO_EMAILS=Object.freeze({
  editor:'editor.demo@conspace.local',
  reviewer:'reviewer.demo@conspace.local',
  chief:'chief.demo@conspace.local',
});
const DEMO_ARTICLE_SLUGS=Object.freeze([
  'demo-review-needs-changes',
  'demo-submitted-review-queue',
  'demo-chief-review-queue',
  'demo-approved-ready-publish',
  'demo-public-house-overview',
  'demo-public-design-overview',
  'demo-field-ready',
  'demo-field-blocked',
]);
const LOCAL_HOSTS=new Set(['127.0.0.1','localhost','::1']);

export function assertLocalDemoSeedEnvironment({nodeEnv,databaseUrl,confirm}){
  if(nodeEnv!=='development')throw new Error('Demo seed is allowed only when NODE_ENV=development');
  if(confirm!=='LOCAL_DEMO_ONLY')throw new Error('Set DEMO_SEED_CONFIRM=LOCAL_DEMO_ONLY to run the demo seed');
  if(!databaseUrl)throw new Error('DATABASE_URL is required for demo seed');
  let url;
  try{url=new URL(databaseUrl);}catch{throw new Error('DATABASE_URL must be a valid PostgreSQL URL');}
  if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('Demo seed requires a PostgreSQL DATABASE_URL');
  if(!LOCAL_HOSTS.has(url.hostname))throw new Error('Demo seed refuses non-local database hosts');
  if(url.pathname.replace(/^\//,'')!=='conspace')throw new Error('Demo seed requires the conspace database');
  return true;
}

async function resetDemoEntities(client){
  const articleRows=await client.query('SELECT id FROM conspace.articles WHERE slug=ANY($1::text[])',[DEMO_ARTICLE_SLUGS]);
  const articleIds=articleRows.rows.map(row=>row.id);
  if(articleIds.length){
    await client.query('DELETE FROM conspace.editorial_reviews WHERE entity_type=$1 AND entity_id=ANY($2::uuid[])',['ARTICLE',articleIds]);
    await client.query('DELETE FROM conspace.workflow_events WHERE entity_type=$1 AND entity_id=ANY($2::uuid[])',['ARTICLE',articleIds]);
    await client.query('DELETE FROM conspace.audit_logs WHERE entity_type=$1 AND entity_id=ANY($2::uuid[])',['ARTICLE',articleIds]);
    await client.query('DELETE FROM conspace.articles WHERE id=ANY($1::uuid[])',[articleIds]);
  }

  const terms=await client.query("SELECT id FROM conspace.terms WHERE slug='demo-thuat-ngu-can-sua'");
  if(terms.rows[0]){
    const id=terms.rows[0].id;
    await client.query("DELETE FROM conspace.editorial_reviews WHERE entity_type='TERM' AND entity_id=$1",[id]);
    await client.query("DELETE FROM conspace.workflow_events WHERE entity_type='TERM' AND entity_id=$1",[id]);
    await client.query("DELETE FROM conspace.audit_logs WHERE entity_type='TERM' AND entity_id=$1",[id]);
    await client.query('DELETE FROM conspace.terms WHERE id=$1',[id]);
  }

  const questions=await client.query("SELECT q.id,a.id AS answer_id FROM conspace.reader_questions q LEFT JOIN conspace.question_answers a ON a.question_id=q.id WHERE q.description LIKE '[DEMO]%'");
  for(const row of questions.rows){
    if(row.answer_id){
      await client.query("DELETE FROM conspace.editorial_reviews WHERE entity_type='QUESTION_ANSWER' AND entity_id=$1",[row.answer_id]);
      await client.query("DELETE FROM conspace.workflow_events WHERE entity_type='QUESTION_ANSWER' AND entity_id=$1",[row.answer_id]);
      await client.query("DELETE FROM conspace.audit_logs WHERE entity_type='QUESTION_ANSWER' AND entity_id=$1",[row.answer_id]);
    }
    await client.query('DELETE FROM conspace.reader_questions WHERE id=$1',[row.id]);
  }
}

async function upsertDemoUser(client,{email,displayName,role,password}){
  const passwordHash=await hashPassword(password);
  const user=await client.query(
    'INSERT INTO conspace.cms_users(email,display_name,role,password_hash,is_active,must_change_password) VALUES($1,$2,$3,$4,true,false) '+
    'ON CONFLICT(email) DO UPDATE SET display_name=EXCLUDED.display_name,role=EXCLUDED.role,password_hash=EXCLUDED.password_hash,is_active=true,must_change_password=false,updated_at=now() '+
    'RETURNING id,email,display_name AS "displayName",role,person_id AS "personId"',
    [email,displayName,role,passwordHash]
  );
  const row=user.rows[0];
  await client.query('DELETE FROM conspace.cms_user_permissions WHERE user_id=$1',[row.id]);
  await client.query('DELETE FROM conspace.cms_user_roles WHERE user_id=$1',[row.id]);
  await client.query(
    "INSERT INTO conspace.cms_user_roles(user_id,role,grant_source,grant_reason,legacy_compat) VALUES($1,$2,'ADMIN_ASSIGNMENT',$3,false)",
    [row.id,role,'Development demo seed only']
  );
  const authorSlug='demo-'+role.toLowerCase().replaceAll('_','-');
  const author=await client.query(
    'INSERT INTO conspace.authors(slug,display_name,user_id,verified,active) VALUES($1,$2,$3,false,true) '+
    'ON CONFLICT(slug) DO UPDATE SET display_name=EXCLUDED.display_name,user_id=EXCLUDED.user_id,active=true,updated_at=now() RETURNING id',
    [authorSlug,displayName,row.id]
  );
  return {...row,authorId:author.rows[0].id};
}

async function createArticle(client,{slug,title,body,status='DRAFT',audienceRole='homeowner',contentType='EDITORIAL',editor,approver=null,nicheId,sensitivityFlags=[],requiresChiefReview=false,submittedAt=null,publishedAt=null}){
  const approved=Boolean(approver)&&['APPROVED','SCHEDULED','PUBLISHED'].includes(status);
  const result=await client.query(
    'INSERT INTO conspace.articles(slug,title,excerpt,body,author_id,audience_role,content_type,status,approved_by,approved_at,published_at,created_by_user_id,updated_by_user_id,requires_chief_review,sensitivity_assessed,sensitivity_flags,submitted_at) '+
    'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,true,$14,$15) RETURNING id',
    [slug,title,'[DEMO] Dữ liệu tổng hợp để kiểm thử giao diện và workflow local.',body,editor.authorId,audienceRole,contentType,status,approved?approver.authorId:null,approved?new Date(Date.now()-2*3600*1000):null,publishedAt,editor.id,requiresChiefReview,sensitivityFlags,submittedAt]
  );
  const id=result.rows[0].id;
  await client.query('INSERT INTO conspace.article_niches(article_id,niche_id) VALUES($1,$2)',[id,nicheId]);
  await client.query(
    'INSERT INTO conspace.article_sources(article_id,position,title,citation) VALUES($1,0,$2,$3)',
    [id,'[DEMO] Nguồn mô phỏng local',DEMO_SOURCE]
  );
  return id;
}

async function addWorkflow(client,{entityType,entityId,fromStatus,toStatus,action,actorUserId,reason=null,stage=null,atOffsetMinutes=0}){
  await client.query(
    "INSERT INTO conspace.workflow_events(entity_type,entity_id,from_status,to_status,action,reason,actor_user_id,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now()+($9::text||' minutes')::interval)",
    [entityType,entityId,fromStatus,toStatus,action,reason,actorUserId,JSON.stringify({demoSeed:true,...(stage?{stage}:{})}),String(atOffsetMinutes)]
  );
}

async function addDecision(client,{entityType,entityId,stage,decision,reason,reviewer}){
  await client.query(
    'INSERT INTO conspace.editorial_reviews(entity_type,entity_id,stage,decision,reason,reviewer_user_id) VALUES($1,$2,$3,$4,$5,$6)',
    [entityType,entityId,stage,decision,reason,reviewer.id]
  );
}

async function seedArchitectureSections(client,{nicheId,editor,reviewer,chief}){
  const existing=await client.query('SELECT id,section_no,source_ref FROM conspace.architectural_sections WHERE niche_id=$1 AND section_no=ANY($2::smallint[]) ORDER BY section_no',[nicheId,[1,2,4]]);
  for(const row of existing.rows){
    if(!String(row.source_ref||'').startsWith('DEMO ONLY:')){
      throw new Error('Refusing to overwrite non-demo Template B section '+row.section_no+'. Choose another DEMO_NICHE_SLUG or use a clean local DB.');
    }
    await client.query("DELETE FROM conspace.editorial_reviews WHERE entity_type='ARCHITECTURAL_SECTION' AND entity_id=$1",[row.id]);
    await client.query("DELETE FROM conspace.workflow_events WHERE entity_type='ARCHITECTURAL_SECTION' AND entity_id=$1",[row.id]);
    await client.query("DELETE FROM conspace.audit_logs WHERE entity_type='ARCHITECTURAL_SECTION' AND entity_id=$1",[row.id]);
    await client.query('DELETE FROM conspace.architectural_sections WHERE id=$1',[row.id]);
  }

  const published=await client.query(
    "INSERT INTO conspace.architectural_sections(niche_id,section_no,content,source_ref,status,updated_by_user_id,created_by_user_id,submitted_at,technical_reviewed_by_user_id,technical_reviewed_at,approved_by_user_id,approved_at,published_by_user_id,published_at,sensitivity_assessed,sensitivity_flags,requires_chief_review) "+
    "VALUES($1,1,$2,$3,'PUBLISHED',$4,$4,now()-interval '3 hours',$5,now()-interval '2 hours',$5,now()-interval '2 hours',$6,now()-interval '1 hour',true,'{}',false) RETURNING id",
    [nicheId,'## [DEMO] Ranh giới loại công trình\n\nKhối này chỉ dùng để kiểm thử renderer Template B trên máy local. Nội dung không phải dữ liệu biên tập thật.',DEMO_SOURCE,editor.id,reviewer.id,chief.id]
  );
  await addWorkflow(client,{entityType:'ARCHITECTURAL_SECTION',entityId:published.rows[0].id,fromStatus:'APPROVED',toStatus:'PUBLISHED',action:'PUBLISH',actorUserId:chief.id,stage:'EDITOR_IN_CHIEF'});

  const returned=await client.query(
    "INSERT INTO conspace.architectural_sections(niche_id,section_no,content,source_ref,status,updated_by_user_id,created_by_user_id,submitted_at,technical_reviewed_by_user_id,technical_reviewed_at,sensitivity_assessed,sensitivity_flags,requires_chief_review) "+
    "VALUES($1,2,$2,$3,'NEEDS_CHANGES',$4,$4,now()-interval '2 hours',$5,now()-interval '1 hour',true,'{}',false) RETURNING id",
    [nicheId,'[DEMO] Khối đặc thù đang chờ biên tập viên sửa lại theo phản hồi reviewer.',DEMO_SOURCE,editor.id,reviewer.id]
  );
  const reason='[DEMO] Cần bổ sung căn cứ và làm rõ phạm vi trước khi duyệt lại.';
  await addDecision(client,{entityType:'ARCHITECTURAL_SECTION',entityId:returned.rows[0].id,stage:'TECHNICAL',decision:'REQUEST_CHANGES',reason,reviewer});
  await addWorkflow(client,{entityType:'ARCHITECTURAL_SECTION',entityId:returned.rows[0].id,fromStatus:'TECHNICAL_REVIEW',toStatus:'NEEDS_CHANGES',action:'REQUEST_CHANGES',actorUserId:reviewer.id,reason,stage:'TECHNICAL'});

  const chiefQueue=await client.query(
    "INSERT INTO conspace.architectural_sections(niche_id,section_no,content,source_ref,status,updated_by_user_id,created_by_user_id,submitted_at,technical_reviewed_by_user_id,technical_reviewed_at,sensitivity_assessed,sensitivity_flags,requires_chief_review) "+
    "VALUES($1,4,$2,$3,'EDITOR_IN_CHIEF_REVIEW',$4,$4,now()-interval '90 minutes',$5,now()-interval '30 minutes',true,ARRAY['LEGAL_CONTENT'],true) RETURNING id",
    [nicheId,'[DEMO] Khối quy chuẩn/pháp lý đang chờ Chủ bút. Không dùng nội dung này làm tư vấn pháp lý.',DEMO_SOURCE,editor.id,reviewer.id]
  );
  await addDecision(client,{entityType:'ARCHITECTURAL_SECTION',entityId:chiefQueue.rows[0].id,stage:'TECHNICAL',decision:'APPROVED',reason:'[DEMO] Đã qua kiểm tra kỹ thuật; chuyển Chủ bút do có cờ pháp lý.',reviewer});
  await addWorkflow(client,{entityType:'ARCHITECTURAL_SECTION',entityId:chiefQueue.rows[0].id,fromStatus:'TECHNICAL_REVIEW',toStatus:'EDITOR_IN_CHIEF_REVIEW',action:'APPROVED',actorUserId:reviewer.id,reason:'[DEMO] Chuyển Chủ bút do nội dung nhạy cảm.',stage:'TECHNICAL'});

  return {published:published.rows[0].id,returned:returned.rows[0].id,chiefQueue:chiefQueue.rows[0].id};
}

export async function seedDemo(db=pool,options={}){
  const config={
    nodeEnv:options.nodeEnv??env.nodeEnv,
    databaseUrl:options.databaseUrl??env.databaseUrl,
    confirm:options.confirm??process.env.DEMO_SEED_CONFIRM,
    password:options.password??process.env.DEMO_USER_PASSWORD,
    nicheSlug:options.nicheSlug??process.env.DEMO_NICHE_SLUG??'house',
  };
  assertLocalDemoSeedEnvironment(config);
  if(typeof config.password!=='string'||config.password.length<14||config.password.length>256){
    throw new Error('DEMO_USER_PASSWORD must contain between 14 and 256 characters');
  }
  if(!db)throw new Error('DATABASE_URL is required for demo seed');

  const client=await db.connect();
  try{
    await client.query('BEGIN');
    await assertDedicatedDatabase(client);
    await client.query('SELECT pg_advisory_xact_lock($1,$2)',[19027,20]);

    const nicheResult=await client.query("SELECT id,slug,name,template_key FROM conspace.niches WHERE slug=$1 AND group_type='design' AND is_active=true",[config.nicheSlug]);
    const niche=nicheResult.rows[0];
    if(!niche||niche.template_key!=='TEMPLATE_B')throw new Error('DEMO_NICHE_SLUG must be one of the active Template B design niches. Run db:seed first.');

    await resetDemoEntities(client);

    const editor=await upsertDemoUser(client,{email:DEMO_EMAILS.editor,displayName:'[DEMO] Biên tập viên',role:'EDITOR',password:config.password});
    const reviewer=await upsertDemoUser(client,{email:DEMO_EMAILS.reviewer,displayName:'[DEMO] Reviewer kỹ thuật',role:'TECHNICAL_REVIEWER',password:config.password});
    const chief=await upsertDemoUser(client,{email:DEMO_EMAILS.chief,displayName:'[DEMO] Chủ bút',role:'EDITOR_IN_CHIEF',password:config.password});

    const returnedId=await createArticle(client,{
      slug:'demo-review-needs-changes',title:'[DEMO] Bài bị trả về để chỉnh sửa',
      body:'## Dữ liệu demo\n\nBài này cố ý ở trạng thái **NEEDS_CHANGES** để kiểm thử phản hồi reviewer.',
      status:'NEEDS_CHANGES',editor,nicheId:niche.id,submittedAt:new Date(Date.now()-3*3600*1000),
    });
    const returnReason='[DEMO] Cần làm rõ căn cứ kỹ thuật ở phần kết và ghi rõ phạm vi áp dụng.';
    await addWorkflow(client,{entityType:'ARTICLE',entityId:returnedId,fromStatus:'DRAFT',toStatus:'SUBMITTED',action:'SUBMIT',actorUserId:editor.id,atOffsetMinutes:-180});
    await addWorkflow(client,{entityType:'ARTICLE',entityId:returnedId,fromStatus:'SUBMITTED',toStatus:'TECHNICAL_REVIEW',action:'REVIEW_STARTED',actorUserId:reviewer.id,stage:'TECHNICAL',atOffsetMinutes:-120});
    await addDecision(client,{entityType:'ARTICLE',entityId:returnedId,stage:'TECHNICAL',decision:'REQUEST_CHANGES',reason:returnReason,reviewer});
    await addWorkflow(client,{entityType:'ARTICLE',entityId:returnedId,fromStatus:'TECHNICAL_REVIEW',toStatus:'NEEDS_CHANGES',action:'REQUEST_CHANGES',actorUserId:reviewer.id,reason:returnReason,stage:'TECHNICAL',atOffsetMinutes:-60});

    const submittedId=await createArticle(client,{
      slug:'demo-submitted-review-queue',title:'[DEMO] Bài đang chờ reviewer nhận',
      body:'Bài demo để kiểm thử hàng đợi kỹ thuật ở trạng thái SUBMITTED.',
      status:'SUBMITTED',editor,nicheId:niche.id,submittedAt:new Date(Date.now()-45*60*1000),
    });
    await addWorkflow(client,{entityType:'ARTICLE',entityId:submittedId,fromStatus:'DRAFT',toStatus:'SUBMITTED',action:'SUBMIT',actorUserId:editor.id,atOffsetMinutes:-45});

    const chiefQueueId=await createArticle(client,{
      slug:'demo-chief-review-queue',title:'[DEMO] Bài nhạy cảm đang chờ Chủ bút',
      body:'Bài demo có cờ LEGAL_CONTENT để kiểm thử lớp duyệt Chủ bút.',
      status:'EDITOR_IN_CHIEF_REVIEW',editor,nicheId:niche.id,sensitivityFlags:['LEGAL_CONTENT'],requiresChiefReview:true,submittedAt:new Date(Date.now()-90*60*1000),
    });
    await addDecision(client,{entityType:'ARTICLE',entityId:chiefQueueId,stage:'TECHNICAL',decision:'APPROVED',reason:'[DEMO] Kỹ thuật đạt; chuyển Chủ bút do nội dung pháp lý.',reviewer});
    await addWorkflow(client,{entityType:'ARTICLE',entityId:chiefQueueId,fromStatus:'TECHNICAL_REVIEW',toStatus:'EDITOR_IN_CHIEF_REVIEW',action:'APPROVED',actorUserId:reviewer.id,reason:'[DEMO] Chuyển lớp duyệt Chủ bút.',stage:'TECHNICAL',atOffsetMinutes:-30});

    const approvedId=await createArticle(client,{
      slug:'demo-approved-ready-publish',title:'[DEMO] Bài đã duyệt, chờ xuất bản',
      body:'Bài demo ở trạng thái APPROVED để kiểm thử quyền đặt lịch/xuất bản.',
      status:'APPROVED',editor,approver:reviewer,nicheId:niche.id,
    });

    const publicId=await createArticle(client,{
      slug:'demo-public-design-overview',title:'[DEMO] Bài công khai để kiểm thử trang mảng',
      body:'## [DEMO] Nội dung công khai local\n\nBài này giúp kiểm thử card bài viết và trang chi tiết public. Không phải nội dung biên tập thật.',
      status:'PUBLISHED',editor,approver:reviewer,nicheId:niche.id,publishedAt:new Date(Date.now()-60*60*1000),
    });
    await addWorkflow(client,{entityType:'ARTICLE',entityId:publicId,fromStatus:'APPROVED',toStatus:'PUBLISHED',action:'PUBLISH',actorUserId:chief.id});

    const fieldReadyArticleId=await createArticle(client,{
      slug:'demo-field-ready',title:'[DEMO] Ca hiện trường đủ compliance',
      body:'Mô tả demo đã có nguồn, đã đánh giá sensitivity và đủ điều kiện gửi duyệt.',
      status:'DRAFT',editor,nicheId:niche.id,contentType:'FIELD_CASE',sensitivityFlags:['IDENTIFIABLE_ENTITY_RISK'],requiresChiefReview:true,
    });
    await client.query(
      'INSERT INTO conspace.field_notes(article_id,phenomenon,root_cause,intervention_point,unit_anonymized,address_anonymized,photo_rights_confirmed,anonymization_note) VALUES($1,$2,$3,$4,true,true,true,$5)',
      [fieldReadyArticleId,'[DEMO] Hiện tượng quan sát mô phỏng','[DEMO] Nguyên nhân mô phỏng để thử form','[DEMO] Dừng trước mốc nghiệm thu tiếp theo','[DEMO] Đã ẩn danh toàn bộ định danh trong fixture local']
    );

    const fieldBlockedArticleId=await createArticle(client,{
      slug:'demo-field-blocked',title:'[DEMO] Ca hiện trường đang bị chặn',
      body:'Ca demo cố ý thiếu điều kiện ẩn danh/quyền ảnh để dashboard compliance báo blocked.',
      status:'DRAFT',editor,nicheId:niche.id,contentType:'FIELD_CASE',sensitivityFlags:['IDENTIFIABLE_ENTITY_RISK'],requiresChiefReview:true,
    });
    await client.query(
      'INSERT INTO conspace.field_notes(article_id,phenomenon,root_cause,intervention_point,unit_anonymized,address_anonymized,photo_rights_confirmed,anonymization_note) VALUES($1,$2,$3,$4,true,false,false,$5)',
      [fieldBlockedArticleId,'[DEMO] Hiện tượng chưa hoàn tất ẩn danh','[DEMO] Nguyên nhân mô phỏng','[DEMO] Chưa được phép gửi duyệt','[DEMO] Cố ý để thiếu địa chỉ/quyền ảnh nhằm test blocked state']
    );

    const term=await client.query(
      "INSERT INTO conspace.terms(term,slug,definition,status,source_ref,created_by_user_id,updated_by_user_id,submitted_at) VALUES($1,'demo-thuat-ngu-can-sua',$2,'NEEDS_CHANGES',$3,$4,$4,now()-interval '1 hour') RETURNING id",
      ['[DEMO] Thuật ngữ cần sửa','Định nghĩa demo chỉ phục vụ kiểm thử workflow local.',DEMO_SOURCE,editor.id]
    );
    const termReason='[DEMO] Reviewer yêu cầu làm rõ định nghĩa và phạm vi sử dụng.';
    await addDecision(client,{entityType:'TERM',entityId:term.rows[0].id,stage:'TECHNICAL',decision:'REQUEST_CHANGES',reason:termReason,reviewer});
    await addWorkflow(client,{entityType:'TERM',entityId:term.rows[0].id,fromStatus:'TECHNICAL_REVIEW',toStatus:'NEEDS_CHANGES',action:'REQUEST_CHANGES',actorUserId:reviewer.id,reason:termReason,stage:'TECHNICAL'});

    const question=await client.query(
      "INSERT INTO conspace.reader_questions(description,guessed_niche_id,status,moderation_note) VALUES($1,$2,'IN_REVIEW',$3) RETURNING id",
      ['[DEMO] Câu hỏi mô phỏng để thử Q&A và phản hồi reviewer.',niche.id,'[DEMO] Chỉ dùng local']
    );
    const answer=await client.query(
      "INSERT INTO conspace.question_answers(question_id,body,status,requires_chief_review,sensitivity_flags,sensitivity_assessed,created_by_user_id,updated_by_user_id,submitted_at) VALUES($1,$2,'NEEDS_CHANGES',false,'{}',true,$3,$3,now()-interval '1 hour') RETURNING id",
      [question.rows[0].id,'[DEMO] Câu trả lời đang bị trả lại để thử UX NEEDS_CHANGES.',editor.id]
    );
    const answerReason='[DEMO] Cần bổ sung nguồn và diễn đạt lại phần kết luận.';
    await addDecision(client,{entityType:'QUESTION_ANSWER',entityId:answer.rows[0].id,stage:'TECHNICAL',decision:'REQUEST_CHANGES',reason:answerReason,reviewer});
    await addWorkflow(client,{entityType:'QUESTION_ANSWER',entityId:answer.rows[0].id,fromStatus:'TECHNICAL_REVIEW',toStatus:'NEEDS_CHANGES',action:'REQUEST_CHANGES',actorUserId:reviewer.id,reason:answerReason,stage:'TECHNICAL'});

    const sections=await seedArchitectureSections(client,{nicheId:niche.id,editor,reviewer,chief});

    await client.query('COMMIT');
    return {
      niche:{slug:niche.slug,name:niche.name},
      users:[editor,reviewer,chief].map(({email,displayName,role})=>({email,displayName,role})),
      articles:{returnedId,submittedId,chiefQueueId,approvedId,publicId,fieldReadyArticleId,fieldBlockedArticleId},
      termId:term.rows[0].id,
      questionId:question.rows[0].id,
      sections,
    };
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{
    client.release();
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  seedDemo().then(result=>{
    console.log('CONSPACE local demo seed complete.');
    console.log('Demo niche:',result.niche.slug,'('+result.niche.name+')');
    console.log('Demo users:',result.users.map(user=>user.email+' ['+user.role+']').join(', '));
    console.log('Password: value supplied through DEMO_USER_PASSWORD (not printed).');
    console.log('Open public Template B: /mang/'+result.niche.slug);
  }).catch(error=>{
    console.error('CONSPACE demo seed failed:',error.message);
    process.exitCode=1;
  }).finally(()=>closeDatabase());
}
