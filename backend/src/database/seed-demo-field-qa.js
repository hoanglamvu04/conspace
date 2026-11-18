import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closeDatabase } from './pool.js';
import { env } from '../config/env.js';
import { assertDedicatedDatabase } from './migrate.js';
import { assertLocalDemoSeedEnvironment } from './seed-demo.js';
import { hashPassword } from '../security/password.js';
import { FIELD_QA_DEMO_AREAS, FIELD_QA_DEMO_PLAN, FIELD_QA_DEMO_SOURCE } from './fixtures/field-qa-demo-content.js';

// A strictly local, additive set of fictional published records for the reader UI.
// Neither existing CMS content nor the acceptance workflow fixtures are modified.
// The status/approvals are synthetic test fixtures, NOT real editorial approval.

const DEMO_USERS = Object.freeze({
  editor: { email:'editor.demo@conspace.local', role:'EDITOR', slug:'demo-fieldqa-editor' },
  reviewer: { email:'reviewer.demo@conspace.local', role:'TECHNICAL_REVIEWER', slug:'demo-fieldqa-reviewer' },
});

const readerLabel = Object.freeze({
  homeowner:'Chủ nhà',
  architect:'Kiến trúc sư',
  contractor:'Nhà thầu',
});

function fullFieldSlug(area, key) {
  return 'demo-fieldqa-' + area.slug + '-' + key;
}

export function fieldQaDemoPreview() {
  return {...FIELD_QA_DEMO_PLAN,source:FIELD_QA_DEMO_SOURCE};
}

function fieldArticleBody(area, note) {
  const [,title,phenomenon,hypothesis,intervention] = note;
  return [
    '> **[DEMO — TÌNH HUỐNG HƯ CẤU]** Tài liệu tự viết để thử trang Hiện trường trên máy local. Không có dự án, nhà thầu, địa chỉ, cá nhân, hồ sơ hay ảnh tư liệu thực.',
    '',
    '## Bối cảnh',
    'Một dự án thuộc nhóm '+area.name.toLowerCase()+' được mô phỏng để minh họa cách các bên kiểm soát thay đổi hồ sơ và phối hợp tại công trường.',
    '',
    '## Hiện tượng được giả định',
    phenomenon,
    '',
    '## Giả thuyết cần kiểm tra',
    hypothesis,
    '',
    '## Điểm chặn trong tình huống',
    intervention,
    '',
    '## Ba góc nhìn để thảo luận',
    '- **Chủ nhà / đại diện sử dụng:** Việc thay đổi ảnh hưởng tới nhu cầu và cách sử dụng ra sao?',
    '- **Kiến trúc sư / tư vấn:** Phiên bản hồ sơ nào được phát hành để phối hợp?',
    '- **Nhà thầu / triển khai:** Phần việc nào cần xác nhận trước khi tiếp tục?',
    '',
    '## Ghi chú biên tập',
    'Các nhận định trên chỉ dùng để thử khả năng hiển thị thông tin và điều hướng. Không có nguồn chuyên môn thực, số đo, ảnh, kết luận nguyên nhân hay hướng dẫn thi công được xác minh.',
    '',
    '*[DEMO] '+title+' — không dùng làm tài liệu nghiệm thu hoặc tư vấn cho công trình thật.*',
  ].join('\n');
}

function questionAnswerBody(area, role, answer) {
  return [
    '> **[DEMO — HỎI ĐÁP MÔ PHỎNG]** Đây là câu hỏi và câu trả lời tự biên soạn cho thử nghiệm local. Không có độc giả, chuyên gia hoặc công trình thật tham gia.',
    '',
    '### Góc nhìn '+readerLabel[role].toLowerCase(),
    answer,
    '',
    '### Thông tin nên làm rõ trong ví dụ',
    '- Tình huống được ghi nhận ở vị trí nào, bằng phiên bản tài liệu nào?',
    '- Ai chịu trách nhiệm xác nhận thay đổi và truyền đạt lại cho các bên?',
    '- Những phần việc hoặc quyết định nào đang chờ đối chiếu hồ sơ?',
    '',
    '### Phạm vi của lời giải đáp',
    'Nội dung chỉ minh họa quy trình phối hợp và biên tập. Các giải pháp kỹ thuật, an toàn, pháp lý, chi phí hay tiêu chuẩn cho công trình thực phải được kiểm tra bởi người có chuyên môn và dựa trên hồ sơ hiện hành.',
    '',
    '*[DEMO] Chủ đề: '+area.name+'. Không sử dụng như tư vấn chuyên môn.*',
  ].join('\n');
}

async function ensureDemoAccount(client, definition, password) {
  let result = await client.query('SELECT id,role FROM conspace.cms_users WHERE email=$1', [definition.email]);
  let userId = result.rows[0]?.id;
  if (userId && result.rows[0].role !== definition.role) {
    throw new Error('Refusing to change a pre-existing demo account role: ' + definition.email);
  }
  if (!userId) {
    const passwordHash = await hashPassword(password);
    result = await client.query(
      'INSERT INTO conspace.cms_users(email,display_name,role,password_hash,is_active,must_change_password) ' +
      'VALUES($1,$2,$3,$4,true,false) RETURNING id',
      [definition.email,definition.role==='EDITOR' ? '[DEMO] Biên tập viên' : '[DEMO] Reviewer kỹ thuật',definition.role,passwordHash]
    );
    userId = result.rows[0].id;
    await client.query(
      "INSERT INTO conspace.cms_user_roles(user_id,role,grant_source,grant_reason,legacy_compat) " +
      "VALUES($1,$2,'ADMIN_ASSIGNMENT','Local-only fictional Field Notes and Q&A seed',false) ON CONFLICT DO NOTHING",
      [userId,definition.role]
    );
  }

  result = await client.query('SELECT id FROM conspace.authors WHERE user_id=$1', [userId]);
  if (result.rows[0]) return { userId, authorId:result.rows[0].id };

  const existingSlug = await client.query('SELECT id,user_id FROM conspace.authors WHERE slug=$1', [definition.slug]);
  if (existingSlug.rows[0]) {
    if (existingSlug.rows[0].user_id !== userId) throw new Error('Reserved demo author slug belongs to another user');
    return { userId, authorId:existingSlug.rows[0].id };
  }
  result = await client.query(
    'INSERT INTO conspace.authors(slug,display_name,bio,user_id,verified,active) ' +
    'VALUES($1,$2,$3,$4,false,true) RETURNING id',
    [definition.slug,'[DEMO] Ban biên tập local',
      'Tác giả tổng hợp; không đại diện nhân sự hay chuyên gia thực.',userId]
  );
  return { userId, authorId:result.rows[0].id };
}

async function getActiveDesignNiches(client) {
  const slugs = FIELD_QA_DEMO_AREAS.map(area=>area.slug);
  const result = await client.query(
    "SELECT id,slug FROM conspace.niches WHERE slug=ANY($1::text[]) AND group_type='design' AND is_active=true AND template_key='TEMPLATE_B'",
    [slugs]
  );
  const found = new Map(result.rows.map(row=>[row.slug,row.id]));
  const missing = slugs.filter(slug=>!found.has(slug));
  if (missing.length) {
    throw new Error('Missing active design niches ('+missing.join(', ')+'). Run db:seed --prefix backend first.');
  }
  return found;
}

function displayTitle(title) { return '[DEMO] '+title; }

async function seedFieldNote(client,{area,note,nicheId,editor,reviewer,position,stats}) {
  const [key,title,phenomenon,hypothesis,intervention] = note;
  const slug = fullFieldSlug(area,key);
  const prior = await client.query(
    'SELECT a.id,a.title,a.content_type,f.id AS field_id FROM conspace.articles a ' +
    'LEFT JOIN conspace.field_notes f ON f.article_id=a.id WHERE a.slug=$1',[slug]
  );
  if (prior.rows.length) {
    const found=prior.rows[0];
    if (!found.title.startsWith('[DEMO]') || found.content_type!=='FIELD_CASE' || !found.field_id)
      throw new Error('Reserved demo field slug was changed; refusing to overwrite: '+slug);
    stats.fieldNotesExisting++;
    return found.id;
  }
  const publishedAt = new Date(Date.now()-(position+2)*86400000);
  const approvedAt = new Date(publishedAt.getTime()-86400000);
  const excerpt = '[DEMO] Ca giả lập thuộc '+area.name+': '+phenomenon;
  const result=await client.query(
    'INSERT INTO conspace.articles(slug,title,excerpt,body,author_id,audience_role,content_type,status,' +
    'approved_by,approved_at,published_at,created_by_user_id,updated_by_user_id,sensitivity_assessed,requires_chief_review) ' +
    "VALUES($1,$2,$3,$4,$5,'contractor','FIELD_CASE','PUBLISHED',$6,$7,$8,$9,$9,true,false) RETURNING id",
    [slug,displayTitle(title),excerpt,fieldArticleBody(area,note),editor.authorId,reviewer.authorId,
      approvedAt,publishedAt,editor.userId]
  );
  const articleId=result.rows[0].id;
  await client.query('INSERT INTO conspace.article_niches(article_id,niche_id) VALUES($1,$2)',[articleId,nicheId]);
  await client.query(
    'INSERT INTO conspace.article_sources(article_id,position,title,citation) VALUES($1,0,$2,$3)',
    [articleId,'[DEMO] Tài liệu hư cấu nội bộ, không có nguồn bên ngoài',FIELD_QA_DEMO_SOURCE]
  );
  await client.query(
    'INSERT INTO conspace.field_notes(article_id,phenomenon,root_cause,intervention_point,' +
    'unit_anonymized,address_anonymized,photo_rights_confirmed,anonymization_note) ' +
    'VALUES($1,$2,$3,$4,true,true,true,$5)',
    [articleId,'[DEMO] '+phenomenon,'[DEMO] '+hypothesis,'[DEMO] '+intervention,
      'Tình huống hoàn toàn hư cấu; không có danh tính, địa chỉ hay media đính kèm. Cờ quyền ảnh chỉ áp dụng cho fixture không có ảnh.']
  );
  await client.query(
    "INSERT INTO conspace.workflow_events(entity_type,entity_id,from_status,to_status,action,actor_user_id,metadata) "+
    "VALUES('ARTICLE',$1,NULL,'PUBLISHED','DEMO_FIXTURE_PUBLISH',$2,$3::jsonb)",
    [articleId,editor.userId,JSON.stringify({syntheticFixture:true,verifiedEditorialReview:false,fixtureType:'FIELD_NOTE'})]
  );
  stats.fieldNotesCreated++;
  return articleId;
}

async function seedQuestion(client,{area,question,nicheId,editor,reviewer,relatedArticleId,position,stats}) {
  const [role,query,answer] = question;
  const description='[DEMO] '+area.name+': '+query;
  const prior=await client.query(
    'SELECT q.id,q.status,qa.id AS answer_id FROM conspace.reader_questions q ' +
    'LEFT JOIN conspace.question_answers qa ON qa.question_id=q.id WHERE q.description=$1 ORDER BY q.id LIMIT 2',
    [description]
  );
  if(prior.rows.length>1)throw new Error('Duplicate reserved demo question; fix manually before seeding: '+description);
  if(prior.rows.length){
    if(!prior.rows[0].answer_id)throw new Error('Reserved demo question has no answer; refusing to alter it: '+description);
    stats.questionsExisting++;
    return;
  }
  const publishedAt=new Date(Date.now()-(position%20+2)*86400000);
  const approvedAt=new Date(publishedAt.getTime()-86400000);
  const result=await client.query(
    'INSERT INTO conspace.reader_questions(description,guessed_niche_id,status,moderation_note,request_private_reply) ' +
    "VALUES($1,$2,'PUBLISHED',$3,false) RETURNING id",
    [description,nicheId,'[DEMO] Câu hỏi hư cấu do seed tạo, không do độc giả gửi. Không có contact hoặc ảnh.']
  );
  const qId=result.rows[0].id;
  const inserted=await client.query(
    'INSERT INTO conspace.question_answers(question_id,body,related_article_id,status,requires_chief_review,' +
    'created_by_user_id,updated_by_user_id,approved_by_user_id,approved_at,published_at,sensitivity_assessed) ' +
    "VALUES($1,$2,$3,'PUBLISHED',false,$4,$4,$5,$6,$7,true) RETURNING id",
    [qId,questionAnswerBody(area,role,answer),relatedArticleId,editor.userId,reviewer.userId,approvedAt,publishedAt]
  );
  await client.query(
    "INSERT INTO conspace.workflow_events(entity_type,entity_id,from_status,to_status,action,actor_user_id,metadata) "+
    "VALUES('QUESTION_ANSWER',$1,NULL,'PUBLISHED','DEMO_FIXTURE_PUBLISH',$2,$3::jsonb)",
    [inserted.rows[0].id,editor.userId,JSON.stringify({syntheticFixture:true,verifiedEditorialReview:false,fixtureType:'Q_AND_A'})]
  );
  stats.questionsCreated++;
}

export async function seedDemoFieldQa(db=pool, options={}) {
  const config={
    nodeEnv:options.nodeEnv??env.nodeEnv,
    databaseUrl:options.databaseUrl??env.databaseUrl,
    confirm:options.confirm??process.env.DEMO_SEED_CONFIRM,
    password:options.password??process.env.DEMO_USER_PASSWORD,
  };
  assertLocalDemoSeedEnvironment(config);
  if(typeof config.password!=='string'||config.password.length<14||config.password.length>256)
    throw new Error('DEMO_USER_PASSWORD must contain between 14 and 256 characters');
  if(!db)throw new Error('DATABASE_URL is required for local Field Notes and Q&A seed');

  const stats={fieldNotesCreated:0,fieldNotesExisting:0,questionsCreated:0,questionsExisting:0};
  const client=await db.connect();
  try{
    await client.query('BEGIN');
    await assertDedicatedDatabase(client);
    await client.query('SELECT pg_advisory_xact_lock($1,$2)',[19027,33]);
    const niches=await getActiveDesignNiches(client);
    const editor=await ensureDemoAccount(client,DEMO_USERS.editor,config.password);
    const reviewer=await ensureDemoAccount(client,DEMO_USERS.reviewer,config.password);
    let fieldPosition=0;
    let questionPosition=0;
    for(const area of FIELD_QA_DEMO_AREAS){
      const nicheId=niches.get(area.slug);
      const articles=[];
      for(const note of area.notes){
        articles.push(await seedFieldNote(client,{
          area,note,nicheId,editor,reviewer,position:fieldPosition++,stats
        }));
      }
      for(const question of area.questions){
        await seedQuestion(client,{
          area,question,nicheId,editor,reviewer,relatedArticleId:articles[0],
          position:questionPosition++,stats
        });
      }
    }
    await client.query('COMMIT');
    return {...FIELD_QA_DEMO_PLAN,...stats};
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{
    client.release();
  }
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  seedDemoFieldQa().then(summary=>{
    console.log('CONSPACE local Field Notes + Q&A demo seed complete.');
    console.log(JSON.stringify(summary,null,2));
    console.log('All new records are fictional [DEMO] fixtures, not verified editorial content.');
    console.log('Preview: /hien-truong and /hoi-dap (also /mang/house).');
  }).catch(error=>{
    console.error('CONSPACE Field Notes + Q&A demo seed failed:',error.message);
    process.exitCode=1;
  }).finally(()=>closeDatabase());
}
