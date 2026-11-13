import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminRequest, adminPath } from '../api.js';
import { useAdminObject } from '../hooks.js';
import { useNotices, useSession } from '../Session.jsx';
import { CmsIcon, ConfirmDialog, EmptyState, PageHeading, Pill, SectionNote, Surface, Timestamp } from '../ui.jsx';
import { Markdown } from '../../components/Markdown.jsx';

const choices=[
  {value:'APPROVED',label:'Duyệt'},
  {value:'REQUEST_CHANGES',label:'Yêu cầu chỉnh sửa'},
  {value:'REJECTED',label:'Từ chối'},
];

function entityLabel(type){
  if(type==='ARTICLE')return 'BÀI VIẾT';
  if(type==='TERM')return 'THUẬT NGỮ';
  if(type==='NICHE_SECTION')return 'KHỐI NGÁCH';
  return 'CÂU TRẢ LỜI';
}

function detailFor(selected,detail){
  if(selected.entityType==='NICHE_SECTION')return (detail.data?.sections||[]).find(item=>item.id===selected.id)||null;
  return detail.data;
}

function sensitivityFor(selected,data){
  if(selected.entityType==='QUESTION_ANSWER')return data.answerSensitivityFlags||[];
  return data.sensitivityFlags||data.sensitivity_flags||[];
}

function ReviewDetail({stage,selected,detail,canDecide,canStart,busy,reason,setReason,start,setConfirm}) {
  const data=detailFor(selected,detail);
  if(!data)return <EmptyState title="Không tìm thấy hồ sơ" description="Hồ sơ có thể đã đổi trạng thái hoặc rời hàng đợi." icon="alert"/>;

  const title=data.title||data.term||selected.title||'Câu hỏi độc giả';
  const body=selected.entityType==='QUESTION_ANSWER'
    ? (data.answerBody||'')
    : (data.content||data.body||data.definition||'');
  const source=data.sourceRef||data.source_ref||null;
  const flags=sensitivityFor(selected,data);
  const status=data.status||data.answerStatus||selected.status;
  const expectedDecisionStatus=stage==='TECHNICAL'?'TECHNICAL_REVIEW':'EDITOR_IN_CHIEF_REVIEW';
  const decisionReady=selected.entityType==='QUESTION_ANSWER'
    ? status===expectedDecisionStatus
    : status===expectedDecisionStatus;
  const templateType=selected.templateType||data.templateType||null;

  return <div className="cms-review-content">
    <div className="cms-review-article-heading">
      <div className="cms-btn-row"><span className="cms-review-stage-label">{entityLabel(selected.entityType)}</span><Pill value={status}/>{templateType&&<span className="cms-review-stage-label">{templateType}</span>}</div>
      <h2>{title}</h2>
      <p>{data.excerpt||data.description||(selected.entityType==='NICHE_SECTION'?`Khối ${selected.sectionNo} · ${selected.audienceRole||'Nội dung dùng chung'}`:'')}</p>
    </div>

    {selected.entityType==='NICHE_SECTION'&&<section className="cms-review-section"><h3>Phạm vi khối</h3><div className="cms-check-list"><p><strong>Section:</strong> {selected.sectionNo}</p><p><strong>Lớp:</strong> {selected.audienceRole||'Dùng chung'}</p><p><strong>Template:</strong> {templateType}</p>{data.blockKey&&<p><strong>Block key:</strong> {data.blockKey}</p>}</div></section>}

    <section className="cms-review-section"><h3>Nội dung</h3>{body?<div className="cms-markdown cms-review-markdown"><Markdown body={body}/></div>:<SectionNote kind="warning">Hồ sơ không có nội dung để duyệt.</SectionNote>}</section>

    <section className="cms-review-section"><h3>Căn cứ và nguồn</h3>
      {Array.isArray(data.sources)&&data.sources.length
        ? <ul className="cms-source-list">{data.sources.map((item,index)=><li key={index}><strong>{item.title}</strong>{item.citation&&' — '+item.citation} {item.url?.startsWith('https://')&&<a href={item.url} rel="noreferrer" target="_blank">Mở nguồn ↗</a>}</li>)}</ul>
        : source?<p>{source}</p>
          :<SectionNote kind="warning">Chưa thấy nguồn tham khảo trong hồ sơ API. Không duyệt nếu chưa xác minh được nguồn.</SectionNote>}
    </section>

    <section className="cms-review-section"><h3>Kiểm soát nhạy cảm</h3>
      {flags.length?<div className="cms-check-list">{flags.map(flag=><p key={flag}><strong>{flag.replaceAll('_',' ')}</strong></p>)}</div>:<p>Không có cờ nhạy cảm được khai báo.</p>}
      {(data.requiresChiefReview||data.requires_chief_review||data.answerRequiresChiefReview)&&<SectionNote kind="warning">Hồ sơ này bắt buộc đi qua bước duyệt Chủ bút trước khi được APPROVED.</SectionNote>}
    </section>

    <section className="cms-review-section"><h3>Dấu thời gian</h3><div className="cms-check-list">
      <p>Gửi duyệt: <Timestamp value={data.submittedAt||selected.submittedAt}/></p>
      {(data.approvedAt||data.answerPublishedAt)&&<p>{data.approvedAt?'Phê duyệt':'Xuất bản'}: <Timestamp value={data.approvedAt||data.answerPublishedAt}/></p>}
      {data.publishedAt&&<p>Xuất bản: <Timestamp value={data.publishedAt}/></p>}
    </div></section>

    {selected.entityType==='ARTICLE'&&<Link to={'/admin/articles/'+selected.id+'/edit'} className="cms-text-link">Mở toàn bộ hồ sơ bài viết →</Link>}
    {selected.entityType==='NICHE_SECTION'&&<Link to="/admin/niches" className="cms-text-link">Mở kho ngách →</Link>}

    {canDecide&&<section className="cms-review-actions">
      <h3>{stage==='TECHNICAL'?'Quyết định kỹ thuật':'Quyết định Chủ bút'}</h3>
      {canStart&&<><SectionNote>Hồ sơ mới ở trạng thái SUBMITTED. Hãy nhận hồ sơ vào bước TECHNICAL_REVIEW trước khi quyết định.</SectionNote><button type="button" disabled={busy} className="cms-btn cms-btn--secondary" onClick={start}>Bắt đầu duyệt kỹ thuật</button></>}
      {!canStart&&!decisionReady&&<SectionNote kind="warning">Trạng thái hiện tại không cho phép đưa ra quyết định ở lớp duyệt này. Tải lại hàng đợi nếu hồ sơ vừa được người khác xử lý.</SectionNote>}
      {decisionReady&&<><label htmlFor="cms-review-reason">Lý do và nhận xét (bắt buộc)</label><textarea id="cms-review-reason" rows={5} minLength={3} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Nêu rõ căn cứ, điểm cần sửa hoặc xác nhận chuyên môn…"/><div className="cms-btn-row">{choices.map(x=><button key={x.value} type="button" disabled={busy||reason.trim().length<3} className={'cms-btn '+(x.value==='APPROVED'?'cms-btn--primary':x.value==='REJECTED'?'cms-btn--danger-soft':'cms-btn--secondary')} onClick={()=>setConfirm(x.value)}>{x.label}</button>)}</div></>}
    </section>}
    {!canDecide&&<SectionNote kind="warning">Vai trò hiện tại chỉ được đọc hồ sơ, không có quyền quyết định ở lớp này.</SectionNote>}
  </div>;
}

export default function Reviews(){
  const {can}=useSession(),{notice}=useNotices();
  const [params,setParams]=useSearchParams();
  const allowedStages=['TECHNICAL','EDITOR_IN_CHIEF'].filter(value=>value==='TECHNICAL'?can('reviews:technical:decide'):can('reviews:chief:decide'));
  const requested=params.get('stage');
  const stage=allowedStages.includes(requested)?requested:(allowedStages[0]||'TECHNICAL');
  const [selected,setSelected]=useState(null),[reason,setReason]=useState(''),[confirm,setConfirm]=useState(null),[busy,setBusy]=useState(false);

  const queue=useAdminObject(adminPath('/reviews/queue',{stage}));
  const detailResource=selected?.entityType==='NICHE_SECTION'
    ? '/niches/'+selected.nicheId+'/sections'
    : selected?.entityType==='ARTICLE'?'/articles/'+selected.id
      : selected?.entityType==='TERM'?'/terms/'+selected.id
        : selected?.entityType==='QUESTION_ANSWER'?'/questions/'+selected.questionId:null;
  const detail=useAdminObject(detailResource,Boolean(selected));

  const articles=queue.status==='success'?queue.data.articles||[]:[];
  const terms=queue.status==='success'?queue.data.terms||[]:[];
  const answers=queue.status==='success'?queue.data.answers||[]:[];
  const nicheSections=queue.status==='success'?queue.data.nicheSections||[]:[];
  const items=[...articles,...terms,...answers,...nicheSections];
  const canDecide=stage==='TECHNICAL'?can('reviews:technical:decide'):can('reviews:chief:decide');

  async function action(path,body){
    setBusy(true);
    try{
      await adminRequest(path,{method:'POST',data:body});
      notice('Backend đã ghi nhận thao tác và trạng thái mới.');
      setSelected(null);setReason('');setConfirm(null);queue.retry();
    }catch(e){notice(e.message,'error');setConfirm(null);}finally{setBusy(false);}
  }

  function decide(){
    if(!selected||!confirm||reason.trim().length<3)return;
    const base=selected.entityType==='ARTICLE'
      ? '/reviews/articles/'+selected.id+'/decision'
      : selected.entityType==='TERM'
        ? '/reviews/terms/'+selected.id+'/decision'
        : selected.entityType==='NICHE_SECTION'
          ? '/reviews/niche-sections/'+selected.id+'/decision'
          : '/reviews/question-answers/'+selected.id+'/decision';
    const body=selected.entityType==='TERM'
      ? {decision:confirm,reason:reason.trim()}
      : selected.entityType==='NICHE_SECTION'
        ? {templateType:selected.templateType,stage,decision:confirm,reason:reason.trim()}
        : {stage,decision:confirm,reason:reason.trim()};
    action(base,body);
  }

  const canStart=stage==='TECHNICAL'&&selected?.status==='SUBMITTED'&&can('reviews:technical:decide')&&selected.entityType!=='QUESTION_ANSWER';
  function start(){
    if(!selected)return;
    const path=selected.entityType==='TERM'
      ? '/reviews/terms/'+selected.id+'/start'
      : selected.entityType==='NICHE_SECTION'
        ? '/reviews/niche-sections/'+selected.id+'/start'
        : '/reviews/articles/'+selected.id+'/start';
    action(path,selected.entityType==='NICHE_SECTION'?{templateType:selected.templateType}:{});
  }

  return <><PageHeading kicker="QUY TRÌNH BIÊN TẬP" title="Bàn kiểm duyệt" description="Reviewer kiểm nội dung, nguồn, sensitivity và quyết định đúng từng lớp workflow. Xuất bản là bước riêng sau APPROVED." icon="review" actions={<button type="button" className="cms-btn cms-btn--secondary" onClick={queue.retry}><CmsIcon name="refresh"/> Tải lại</button>}/>
    <div className="cms-two-pane">
      <Surface className="cms-list-pane" title="Đang chờ" description="Bài viết, thuật ngữ, Q&A và khối ngách theo đúng stage Backend.">
        <div className="cms-review-filter"><label htmlFor="cms-stage">Lớp duyệt</label><select id="cms-stage" value={stage} disabled={!allowedStages.length} onChange={e=>{setParams({stage:e.target.value});setSelected(null);setReason('');}}>{allowedStages.map(value=><option key={value} value={value}>{value==='TECHNICAL'?'Kỹ thuật':'Chủ bút'}</option>)}</select></div>
        {queue.status==='loading'?<div className="cms-inline-state">Đang tải danh sách…</div>:queue.status==='error'?<EmptyState title="Chưa tải được hàng đợi" description={queue.error?.message} icon="alert"/>:items.length?<div className="cms-review-queue">{items.map(item=><button type="button" key={item.entityType+item.id} className={`cms-review-row ${selected?.id===item.id?'is-selected':''}`} onClick={()=>{setSelected(item);setReason('');}}><div className="cms-review-row-top"><span className="cms-review-stage-label">{entityLabel(item.entityType)}</span><Timestamp value={item.submittedAt}/></div><strong>{item.title||'Trả lời câu hỏi độc giả'}</strong>{item.entityType==='NICHE_SECTION'&&<small>{item.templateType} · Khối {item.sectionNo} · {item.audienceRole||'Dùng chung'}</small>}<div className="cms-review-row-bottom"><Pill value={item.status}/>{item.requiresChiefReview&&<span className="cms-review-stage-label">CHIEF</span>}<CmsIcon name="right" size={17}/></div></button>)}</div>:<EmptyState title="Không có nội dung chờ duyệt" description="API đang trả hàng đợi rỗng cho giai đoạn này." icon="review"/>}
      </Surface>
      <Surface className="cms-review-detail" title="Hồ sơ và quyết định" description="Bắt đầu duyệt, quyết định và lý do là các thao tác tách biệt, được Backend ghi audit.">
        {!selected?<EmptyState title="Chọn một hồ sơ" description="Hồ sơ sẽ mở nội dung, nguồn, sensitivity và trạng thái workflow." icon="review"/>:detail.status==='loading'?<div className="cms-inline-state">Đang tải hồ sơ…</div>:detail.status==='error'?<EmptyState title="Không đọc được hồ sơ" description={detail.error?.message} icon="alert"/>:<ReviewDetail stage={stage} selected={selected} detail={detail} canDecide={canDecide} canStart={canStart} busy={busy} reason={reason} setReason={setReason} start={start} setConfirm={setConfirm}/>}
      </Surface>
    </div>
    <ConfirmDialog open={Boolean(confirm)} busy={busy} title="Xác nhận quyết định biên tập" description="Lý do và trạng thái sẽ được Backend kiểm tra, ghi vào nhật ký kiểm duyệt." confirmText="Gửi quyết định" danger={confirm==='REJECTED'} onClose={()=>setConfirm(null)} onConfirm={decide}/>
  </>;
}
