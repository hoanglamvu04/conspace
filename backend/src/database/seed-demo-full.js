import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closeDatabase } from './pool.js';
import { env } from '../config/env.js';
import { assertDedicatedDatabase } from './migrate.js';
import { assertLocalDemoSeedEnvironment } from './seed-demo.js';
import { confirmedDesignCategories } from './seed.js';
import { hashPassword } from '../security/password.js';

// All output is SYNTHETIC and LOCAL ONLY. This is not editorial verification.
// Never infer factual technical guidance, contract prices, standards or real identities.
export const FULL_DEMO_SOURCE =
  'DEMO ONLY: synthetic local CONSPACE full-site fixture. NOT verified editorial, technical, legal or market evidence. NEVER deploy.';

export const FULL_DEMO_GROUPS = Object.freeze([
  { slug:'demo-group-ket-cau',name:'[DEMO] Kết cấu và nền móng',topics:[
    ['demo-dao-mong','Đào đất và chuẩn bị móng'],['demo-cop-pha','Cốp pha'],['demo-cot-thep','Cốt thép'],
    ['demo-be-tong','Bê tông'],['demo-ket-cau-thep','Kết cấu thép'],['demo-ket-cau-go','Kết cấu gỗ'],
  ]},
  { slug:'demo-group-bao-che',name:'[DEMO] Bao che và mái',topics:[
    ['demo-xay-tuong','Xây tường'],['demo-trat-tuong','Trát tường'],['demo-chong-tham','Chống thấm'],
    ['demo-mai','Mái và thoát nước mái'],['demo-cua','Cửa đi và cửa sổ'],['demo-kinh','Vách kính'],
  ]},
  { slug:'demo-group-hoan-thien',name:'[DEMO] Hoàn thiện và nội thất',topics:[
    ['demo-op-lat','Ốp lát'],['demo-son','Sơn hoàn thiện'],['demo-tran','Trần'],['demo-san','Sàn'],
    ['demo-noi-that','Đồ nội thất'],['demo-canh-quan','Cảnh quan sân vườn'],
  ]},
  { slug:'demo-group-co-dien',name:'[DEMO] Hệ thống cơ điện',topics:[
    ['demo-dien','Hệ thống điện'],['demo-chieu-sang','Chiếu sáng'],['demo-cap-nuoc','Cấp nước'],
    ['demo-thoat-nuoc','Thoát nước'],['demo-thong-gio','Thông gió'],['demo-dieu-hoa','Điều hòa không khí'],
  ]},
  { slug:'demo-group-quan-ly',name:'[DEMO] Phối hợp và bàn giao',topics:[
    ['demo-du-toan','Dự toán'],['demo-tien-do','Tiến độ'],['demo-bien-ban','Biên bản hiện trường'],
    ['demo-nghiem-thu','Nghiệm thu'],['demo-bao-hanh','Bảo hành'],['demo-ban-giao','Bàn giao'],
  ]},
]);

export const FULL_DEMO_ROLES = Object.freeze([
  {id:'homeowner',label:'chủ nhà',title:'Những câu hỏi cần thống nhất'},
  {id:'architect',label:'kiến trúc sư',title:'Cách phối hợp hồ sơ và các bên'},
  {id:'contractor',label:'nhà thầu',title:'Nhật ký phối hợp và bàn giao'},
]);

function sampleText(topic,section,role) {
  const who = role ? ' ở góc nhìn '+role : '';
  return [
    '## [DEMO] '+section+' — '+topic,
    '',
    '> Tình huống hoàn toàn mô phỏng để kiểm thử giao diện CONSPACE. Không phải số liệu, quy chuẩn, chứng cứ chuyên môn hoặc kết luận dành cho công trình thực.',
    '',
    '### Bối cảnh giả lập',
    'Một nhóm dự án thảo luận về '+topic.toLowerCase()+who+
      '. Các bên chưa thống nhất phạm vi công việc, tài liệu bàn giao và người chịu trách nhiệm phản hồi.',
    '',
    '### Thông tin cần ghi nhận trong ví dụ',
    '- Yêu cầu hoặc hiện tượng mà mỗi bên quan sát được.',
    '- Bản vẽ, ảnh và tài liệu cần kiểm tra quyền sử dụng trước khi chia sẻ.',
    '- Câu hỏi còn mở, đầu mối trả lời và thời điểm cần xác nhận.',
    '',
    '### Điểm chốt minh họa',
    'Tạo một biên bản thống nhất phạm vi, lưu phiên bản hồ sơ và xác nhận lại bằng văn bản trước khi bước sang công việc tiếp theo.',
    '',
    '*[DEMO] Nội dung minh họa luồng đọc và biên tập; muốn sử dụng chuyên môn thực tế phải bổ sung nguồn xác minh, người duyệt và điều kiện áp dụng.*',
  ].join('\n');
}

export function fullDemoPlan() {
  return Object.freeze({
    designNiches: confirmedDesignCategories.length,
    constructionNiches: FULL_DEMO_GROUPS.reduce((n,g)=>n+g.topics.length,0),
    groups: FULL_DEMO_GROUPS.length,
    roles: FULL_DEMO_ROLES.length,
    books: 3,
  });
}

async function ensureUser(client,{email,role,password}) {
  const existing=await client.query('SELECT id,role FROM conspace.cms_users WHERE email=$1',[email]);
  let id=existing.rows[0]?.id;
  if (id && existing.rows[0].role!==role) {
    throw new Error('Refusing to change existing role of '+email);
  }
  if (!id) {
    const hash=await hashPassword(password);
    const created=await client.query(
      "INSERT INTO conspace.cms_users(email,display_name,role,password_hash,is_active,must_change_password) "+
      "VALUES($1,$2,$3,$4,true,false) RETURNING id",
      [email,'[DEMO] '+role,role,hash]
    );
    id=created.rows[0].id;
  }
  await client.query(
    "INSERT INTO conspace.cms_user_roles(user_id,role,grant_source,grant_reason,legacy_compat) "+
    "VALUES($1,$2,'ADMIN_ASSIGNMENT','Local synthetic full-content seed',false) ON CONFLICT DO NOTHING",
    [id,role]
  );
  const author=await client.query('SELECT id FROM conspace.authors WHERE user_id=$1',[id]);
  if (author.rows[0]) return {userId:id,authorId:author.rows[0].id};
  const slug='demo-full-'+role.toLowerCase().replaceAll('_','-');
  const old=await client.query('SELECT id,user_id FROM conspace.authors WHERE slug=$1',[slug]);
  if (old.rows[0]) {
    if (old.rows[0].user_id!==id) throw new Error('Refusing to attach existing author '+slug);
    return {userId:id,authorId:old.rows[0].id};
  }
  const saved=await client.query(
    'INSERT INTO conspace.authors(slug,display_name,bio,user_id,verified,active) '+
    'VALUES($1,$2,$3,$4,false,true) RETURNING id',
    [slug,'[DEMO] '+role,'Tài khoản tổng hợp chỉ dùng kiểm thử local; không có tác giả thực.',id]
  );
  return {userId:id,authorId:saved.rows[0].id};
}

async function ensureGroups(client) {
  const groups=[];
  for (const [position,def] of FULL_DEMO_GROUPS.entries()) {
    let r=await client.query('SELECT id,source_ref FROM conspace.niche_groups WHERE slug=$1',[def.slug]);
    if (!r.rows.length) {
      const count=await client.query('SELECT count(*)::integer AS total FROM conspace.niche_groups');
      if (count.rows[0].total>=5) continue;
      r=await client.query(
        'INSERT INTO conspace.niche_groups(slug,name,source_ref,sort_order) VALUES($1,$2,$3,$4) RETURNING id,source_ref',
        [def.slug,def.name,FULL_DEMO_SOURCE,position+1]
      );
    }
    if (!String(r.rows[0].source_ref||'').startsWith('DEMO ONLY:')) {
      throw new Error('Refusing to reuse a real group as a demo group');
    }
    groups.push({...def,id:r.rows[0].id});
  }
  return groups;
}

async function buildNiches(client,groups,stats) {
  const design=await client.query(
    "SELECT id,slug,name,group_type AS type FROM conspace.niches WHERE group_type='design' AND is_active=true ORDER BY sort_order,name"
  );
  const construction=[];
  for (const [groupIndex,group] of groups.entries()) {
    for (const [index,[slug,title]] of group.topics.entries()) {
      let existing=await client.query('SELECT id,slug,name,source_ref FROM conspace.niches WHERE slug=$1',[slug]);
      if (!existing.rows.length) {
        const count=await client.query("SELECT count(*)::integer AS total FROM conspace.niches WHERE group_type='construction'");
        if (count.rows[0].total>=30) continue;
        existing=await client.query(
          "INSERT INTO conspace.niches(slug,name,group_type,template_key,niche_group_id,summary,source_ref,sort_order,is_active) "+
          "VALUES($1,$2,'construction','TEMPLATE_A',$3,$4,$5,$6,true) RETURNING id,slug,name,source_ref",
          [slug,'[DEMO] '+title,group.id,
           '[DEMO] Hồ sơ minh họa cho ngách '+title.toLowerCase()+'. Không thuộc danh mục ba mươi ngách đã được phê duyệt.',
           FULL_DEMO_SOURCE,100+groupIndex*6+index]
        );
        stats.constructionNichesCreated++;
      }
      if (!String(existing.rows[0].source_ref||'').startsWith('DEMO ONLY:')) {
        throw new Error('Refusing to modify non-demo niche '+slug);
      }
      construction.push({...existing.rows[0],type:'construction'});
    }
  }
  if (design.rows.length!==confirmedDesignCategories.length) {
    throw new Error('Run db:seed first to install all eight documented design categories');
  }
  return [...design.rows,...construction];
}

async function ensureSections(client,niche,users,stats) {
  if(niche.type==='design'){
    const blocks=await client.query('SELECT section_no,title FROM conspace.architectural_template_blocks ORDER BY section_no');
    for(const block of blocks.rows) {
      const existing=await client.query(
        'SELECT id FROM conspace.architectural_sections WHERE niche_id=$1 AND section_no=$2',
        [niche.id,block.section_no]
      );
      if(existing.rows.length) continue; // Preserve authored blocks and older workflow fixtures, including NEEDS_CHANGES.
      await client.query(
        "INSERT INTO conspace.architectural_sections(niche_id,section_no,content,source_ref,status,"+
        "updated_by_user_id,created_by_user_id,submitted_at,technical_reviewed_by_user_id,technical_reviewed_at,"+
        "chief_reviewed_by_user_id,chief_reviewed_at,approved_by_user_id,approved_at,published_by_user_id,published_at,"+
        "sensitivity_assessed,requires_chief_review) "+
        "VALUES($1,$2,$3,$4,'PUBLISHED',$5,$5,now()-interval '5 days',$6,now()-interval '4 days',"+
        "$7,now()-interval '3 days',$7,now()-interval '3 days',$7,now()-interval '2 days',true,true)",
        [niche.id,block.section_no,sampleText(niche.name,block.title),FULL_DEMO_SOURCE,
         users.editor.userId,users.reviewer.userId,users.chief.userId]
      );
      stats.designBlocksCreated++;
    }
  } else {
    const blocks=await client.query('SELECT section_no,title FROM conspace.niche_template_blocks ORDER BY section_no');
    for(const block of blocks.rows){
      const existing=await client.query(
        'SELECT id FROM conspace.niche_sections WHERE niche_id=$1 AND section_no=$2 AND audience_role IS NULL LIMIT 1',
        [niche.id,block.section_no]
      );
      if(existing.rows.length)continue;
      await client.query(
        "INSERT INTO conspace.niche_sections(niche_id,section_no,audience_role,content,source_ref,status,"+
        "updated_by_user_id,created_by_user_id,submitted_at,technical_reviewed_by_user_id,technical_reviewed_at,"+
        "chief_reviewed_by_user_id,chief_reviewed_at,approved_by_user_id,approved_at,published_by_user_id,published_at,"+
        "sensitivity_assessed,requires_chief_review) "+
        "VALUES($1,$2,NULL,$3,$4,'PUBLISHED',$5,$5,now()-interval '5 days',$6,now()-interval '4 days',"+
        "$7,now()-interval '3 days',$7,now()-interval '3 days',$7,now()-interval '2 days',true,true)",
        [niche.id,block.section_no,sampleText(niche.name,block.title),FULL_DEMO_SOURCE,
         users.editor.userId,users.reviewer.userId,users.chief.userId]
      );
      stats.constructionBlocksCreated++;
    }
  }
}

async function publishedArticle(client,{slug,title,excerpt,body,nicheId,role='homeowner',type='EDITORIAL',users,stats,tag='ban-nghe'}) {
  let existing=await client.query('SELECT id,title FROM conspace.articles WHERE slug=$1',[slug]);
  let created=false;
  if(!existing.rows.length) {
    existing=await client.query(
      "INSERT INTO conspace.articles(slug,title,excerpt,body,author_id,audience_role,content_type,status,"+
      "approved_by,approved_at,published_at,created_by_user_id,updated_by_user_id,sensitivity_assessed,requires_chief_review) "+
      "VALUES($1,$2,$3,$4,$5,$6,$7,'PUBLISHED',$8,now()-interval '4 days',now()-interval '2 days',"+
      "$9,$9,true,false) RETURNING id,title",
      [slug,title,excerpt,body,users.editor.authorId,role,type,users.reviewer.authorId,users.editor.userId]
    );
    created=true;
    stats.articlesCreated++;
  }
  const article=existing.rows[0];
  if(!String(article.title||'').startsWith('[DEMO]'))throw new Error('Refusing to reuse a real Article '+slug);
  await client.query(
    'INSERT INTO conspace.article_niches(article_id,niche_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
    [article.id,nicheId]
  );
  if(created){
    await client.query(
      'INSERT INTO conspace.article_sources(article_id,position,title,citation) VALUES($1,0,$2,$3)',
      [article.id,'[DEMO] Tư liệu tình huống giả lập',FULL_DEMO_SOURCE]
    );
    await client.query(
      "INSERT INTO conspace.workflow_events(entity_type,entity_id,from_status,to_status,action,actor_user_id,metadata) "+
      "VALUES('ARTICLE',$1,'APPROVED','PUBLISHED','PUBLISH',$2,$3::jsonb)",
      [article.id,users.chief.userId,JSON.stringify({syntheticFullSeed:true})]
    );
  }
  if(tag){
    const t=await client.query(
      'INSERT INTO conspace.tags(slug,name) VALUES($1,$2) ON CONFLICT(slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id',
      [tag,tag==='ban-nghe'?'Bàn nghề':'[DEMO] Nội dung mẫu']
    );
    await client.query('INSERT INTO conspace.article_tags(article_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[article.id,t.rows[0].id]);
  }
  return article.id;
}

async function seedArticles(client,niches,users,stats){
  for(let i=0;i<niches.length;i++){
    const niche=niches[i],next=niches[(i+1)%niches.length];
    for(const role of FULL_DEMO_ROLES){
      const title='[DEMO] '+role.title+' về '+niche.name.replace(/^\[DEMO\]\s*/,'');
      const id=await publishedArticle(client,{
        slug:'demo-full-'+niche.slug+'-'+role.id,title,
        excerpt:'[DEMO] Góc nhìn '+role.label+' về cách ghi nhận, phối hợp và bàn giao trong tình huống mô phỏng '+niche.name+'.',
        body:sampleText(niche.name,role.title,role.label),
        nicheId:niche.id,role:role.id,users,stats,
        tag:role.id==='contractor'?'ban-nghe':'demo-full-content'
      });
      if(role.id==='architect' && next){
        await client.query('INSERT INTO conspace.article_niches(article_id,niche_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,next.id]);
      }
    }
  }
}

async function seedBooks(client,niches,users,stats) {
  const books=await client.query(
    "SELECT id,slug,title,audience_role AS role,content_label AS kind FROM conspace.books WHERE is_active=true ORDER BY slug"
  );
  let counter=0;
  for(const book of books.rows){
    const chapters=await client.query(
      'SELECT id,chapter_no,title,article_id FROM conspace.book_chapters WHERE book_id=$1 ORDER BY chapter_no',
      [book.id]
    );
    for(const chapter of chapters.rows){
      if(chapter.article_id || (chapter.title && !String(chapter.title).startsWith('[DEMO]')))continue;
      const niche=niches[counter%niches.length];
      counter++;
      const title='[DEMO] '+book.title+' — '+(book.slug==='cam-nang-kien-truc-hoa-lac'?'Phần ':'Chương ')+chapter.chapter_no;
      const articleId=await publishedArticle(client,{
        slug:'demo-full-book-'+book.slug+'-'+chapter.chapter_no,
        title,
        excerpt:'[DEMO] Chương sách mô phỏng để kiểm thử tủ sách, điều hướng và hiển thị nội dung dài.',
        body:sampleText(book.title,'Chương mẫu '+chapter.chapter_no+' / '+book.kind,book.role),
        nicheId:niche.id,role:book.role,type:book.kind,users,stats,tag:null
      });
      const updated=await client.query(
        'UPDATE conspace.book_chapters SET article_id=$1,title=$2,published_at=now()-interval \'2 days\',updated_at=now() '+
        'WHERE id=$3 AND article_id IS NULL AND (title IS NULL OR title LIKE \'[DEMO]%\')',
        [articleId,title,chapter.id]
      );
      stats.chaptersLinked+=updated.rowCount;
    }
  }
}

async function seedFieldNotes(client,niches,users,stats){
  const chosen=niches.filter((n,i)=>i%3===0);
  for(const niche of chosen){
    const title='[DEMO] Ca hiện trường minh họa — '+niche.name.replace(/^\[DEMO\]\s*/,'');
    const articleId=await publishedArticle(client,{
      slug:'demo-full-field-'+niche.slug,title,
      excerpt:'[DEMO] Ca giả lập đã ẩn danh hoàn toàn; hiện tượng, giả thuyết và điểm chặn chỉ phục vụ kiểm thử.',
      body:sampleText(niche.name,'Ghi chép hiện trường mô phỏng'),
      nicheId:niche.id,role:'contractor',type:'FIELD_CASE',users,stats,tag:null
    });
    const result=await client.query(
      "INSERT INTO conspace.field_notes(article_id,phenomenon,root_cause,intervention_point,"+
      "unit_anonymized,address_anonymized,photo_rights_confirmed,anonymization_note) "+
      "VALUES($1,$2,$3,$4,true,true,true,$5) ON CONFLICT(article_id) DO NOTHING",
      [articleId,'[DEMO] Biên bản mô phỏng mô tả dấu hiệu cần kiểm tra khi phối hợp '+niche.name+'.',
       '[DEMO] Giả thuyết dành cho thử giao diện; không xác định nguyên nhân của công trình thực.',
       '[DEMO] Đối chiếu hồ sơ, lập danh sách câu hỏi và ghi nhận người phụ trách trước khi bàn giao.',
       'Dữ liệu tổng hợp, không có tổ chức, người, địa chỉ hay ảnh bên thứ ba. Không dùng làm chứng cứ.']
    );
    stats.fieldNotesCreated+=result.rowCount;
  }
}

async function seedTerms(client,niches,users,stats){
  for(let i=0;i<niches.length;i++){
    const niche=niches[i],slug='demo-full-term-'+String(i+1).padStart(2,'0');
    let r=await client.query('SELECT id,term FROM conspace.terms WHERE slug=$1',[slug]);
    if(!r.rows.length){
      r=await client.query(
        "INSERT INTO conspace.terms(term,slug,definition,status,reviewed_by,reviewed_at,"+
        "source_ref,created_by_user_id,updated_by_user_id,approved_by_user_id,approved_at) "+
        "VALUES($1,$2,$3,'PUBLISHED',$4,now()-interval '3 days',$5,$6,$6,$7,now()-interval '3 days') RETURNING id,term",
        ['[DEMO] Hồ sơ phối hợp — '+niche.name,slug,
         'Khái niệm mô phỏng cho chủ đề '+niche.name+
         '. Dữ liệu này chỉ mô tả cấu trúc một mục Từ điển: khái niệm, bối cảnh và câu hỏi cần đối chiếu. Không phải định nghĩa kỹ thuật.',
         users.reviewer.authorId,FULL_DEMO_SOURCE,users.editor.userId,users.reviewer.userId]
      );
      stats.termsCreated++;
    }
    if(!String(r.rows[0].term||'').startsWith('[DEMO]'))throw new Error('Refusing to edit real Term '+slug);
    await client.query('INSERT INTO conspace.term_niches(term_id,niche_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[r.rows[0].id,niche.id]);
  }
}

async function seedQuestions(client,niches,users,stats){
  for(let i=0;i<niches.length;i++){
    const niche=niches[i];
    const description='[DEMO] Trong tình huống giả lập về '+niche.name+
      ', cần trao đổi những thông tin nào trước khi thống nhất phương án?';
    let question=await client.query('SELECT id FROM conspace.reader_questions WHERE description=$1 ORDER BY created_at LIMIT 1',[description]);
    if(!question.rows.length){
      question=await client.query(
        "INSERT INTO conspace.reader_questions(description,guessed_niche_id,status,moderation_note) "+
        "VALUES($1,$2,'PUBLISHED',$3) RETURNING id",
        [description,niche.id,'[DEMO] Câu hỏi tổng hợp phục vụ kiểm thử local, không có người hỏi thực.']
      );
      stats.questionsCreated++;
    }
    const questionId=question.rows[0].id;
    const existed=await client.query('SELECT id FROM conspace.question_answers WHERE question_id=$1',[questionId]);
    if(existed.rows.length)continue;
    await client.query(
      "INSERT INTO conspace.question_answers(question_id,body,status,requires_chief_review,"+
      "created_by_user_id,updated_by_user_id,approved_by_user_id,approved_at,published_at,sensitivity_assessed) "+
      "VALUES($1,$2,'PUBLISHED',false,$3,$3,$4,now()-interval '3 days',now()-interval '2 days',true)",
      [questionId,
       '[DEMO] Tình huống giả lập; đây không phải tư vấn kỹ thuật cho công trình.\\n\\n'+
       '1. Mô tả sự việc quan sát được, phân biệt dữ kiện với giả thuyết.\\n'+
       '2. Tập hợp tài liệu có quyền chia sẻ và xác nhận phiên bản.\\n'+
       '3. Ghi câu hỏi, người chịu trách nhiệm và cách xác nhận bằng văn bản.\\n'+
       '4. Với vấn đề kỹ thuật, quy chuẩn hoặc pháp lý thực tế cần người có chuyên môn và nguồn hiện hành đánh giá.',
       users.editor.userId,users.reviewer.userId]
    );
    stats.answersCreated++;
  }
}

export async function seedFullDemo(db=pool,options={}){
  const config={
    nodeEnv:options.nodeEnv??env.nodeEnv,
    databaseUrl:options.databaseUrl??env.databaseUrl,
    confirm:options.confirm??process.env.DEMO_SEED_CONFIRM,
    password:options.password??process.env.DEMO_USER_PASSWORD,
  };
  assertLocalDemoSeedEnvironment(config);
  if(typeof config.password!=='string'||config.password.length<14||config.password.length>256){
    throw new Error('DEMO_USER_PASSWORD must contain between 14 and 256 characters');
  }
  if(!db)throw new Error('DATABASE_URL is required for full demo seed');
  const stats={
    constructionNichesCreated:0,designBlocksCreated:0,constructionBlocksCreated:0,
    articlesCreated:0,chaptersLinked:0,fieldNotesCreated:0,termsCreated:0,
    questionsCreated:0,answersCreated:0,
  };
  const client=await db.connect();
  try{
    await client.query('BEGIN');
    await assertDedicatedDatabase(client);
    await client.query('SELECT pg_advisory_xact_lock($1,$2)',[19027,31]);
    const users={
      editor:await ensureUser(client,{email:'editor.demo@conspace.local',role:'EDITOR',password:config.password}),
      reviewer:await ensureUser(client,{email:'reviewer.demo@conspace.local',role:'TECHNICAL_REVIEWER',password:config.password}),
      chief:await ensureUser(client,{email:'chief.demo@conspace.local',role:'EDITOR_IN_CHIEF',password:config.password}),
    };
    const groups=await ensureGroups(client);
    const niches=await buildNiches(client,groups,stats);
    for(const niche of niches)await ensureSections(client,niche,users,stats);
    await seedArticles(client,niches,users,stats);
    await seedBooks(client,niches,users,stats);
    await seedFieldNotes(client,niches,users,stats);
    await seedTerms(client,niches,users,stats);
    await seedQuestions(client,niches,users,stats);
    await client.query('COMMIT');
    return {...stats,designNiches:niches.filter(n=>n.type==='design').length,
      constructionNiches:niches.filter(n=>n.type==='construction').length,books:3,
      totalNiches:niches.length};
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{
    client.release();
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  seedFullDemo().then(summary=>{
    console.log('CONSPACE FULL local demo seed complete.');
    console.log(JSON.stringify(summary,null,2));
    console.log('Only synthetic [DEMO] content was added. Existing authored content was not overwritten.');
    console.log('Open public: /ngach /mang/house /tu-sach /bai-viet /hien-truong /hoi-dap /tra-nhanh');
  }).catch(error=>{
    console.error('CONSPACE FULL demo seed failed:',error.message);
    process.exitCode=1;
  }).finally(()=>closeDatabase());
}
