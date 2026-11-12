import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminRequest, adminPath } from '../api.js';
import { useAdminObject } from '../hooks.js';
import { useNotices, useSession } from '../Session.jsx';
import { CmsIcon, ConfirmDialog, EmptyState, PageHeading, Pill, SectionNote, Surface, Timestamp } from '../ui.jsx';
import { Markdown } from '../../components/Markdown.jsx';

const choices=[{value:'APPROVED',label:'Duyệt'}, {value:'REQUEST_CHANGES',label:'Yêu cầu chỉnh sửa'}, {value:'REJECTED',label:'Từ chối'}];
function ReviewDetail({selected,detail,canDecide,canStart,busy,reason,setReason,start,setConfirm}) {
  const data=selected.entityType==='NICHE_SECTION'
    ? (detail.data.sections||[]).find(item=>item.id===selected.id) || null
    : detail.data;
  if(!data)return <EmptyState title="Không tìm thấy khối nội dung" description="Hồ sơ có thể đã được thay đổi hoặc gỡ khỏi hàng đợi." icon="alert"/>;
  const title=data.title||data.term||selected.title||'Câu hỏi độc giả';
  const body=data.content||data.body||data.definition||data.answerBody||'';
  const source=data.source_ref||data.sourceRef||null;
  return <div className="cms-review-content">
    <div className="cms-review-article-heading"><Pill value={selected.status}/><h2>{title}</h2><p>{data.excerpt||data.description||(selected.entityType==='NICHE_SECTION'?'Khối '+selected.sectionNo+' · '+(selected.audienceRole||'Nội dung dùng chung'):'')}</p></div>
    <section className="cms-review-section"><h3>Nội dung</h3><div className="cms-markdown cms-review-markdown"><Markdown body={body}/></div></section>
    <section className="cms-review-section"><h3>Căn cứ và nguồn</h3>{Array.isArray(data.sources)&&data.sources.length?<ul className="cms-source-list">{data.sources.map((s,i)=><li key={i}>{s.title} {s.citation&&' — '+s.citation} {s.url?.startsWith('https://')&&<a href={s.url} rel="noreferrer" target="_blank">Mở nguồn ↗</a>}</li>)}</ul>:source?<p>{source}</p>:<SectionNote kind="warning">Chưa thấy nguồn tham khảo trong hồ sơ API. Người duyệt phải xác minh trước khi chấp thuận.</SectionNote>}</section>
    {selected.entityType==='ARTICLE'&&<Link to={'/admin/articles/'+selected.id+'/edit'} className="cms-text-link">Mở toàn bộ hồ sơ bài viết →</Link>}
    {canDecide&&<section className="cms-review-actions"><h3>Quyết định</h3>{canStart&&<button type="button" disabled={busy} className="cms-btn cms-btn--secondary" onClick={start}>Bắt đầu duyệt kỹ thuật</button>}<label htmlFor="cms-review-reason">Lý do và nhận xét (bắt buộc)</label><textarea id="cms-review-reason" rows={4} minLength={3} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Nêu rõ căn cứ, điểm cần sửa hoặc xác nhận chuyên môn…"/><div className="cms-btn-row">{choices.map(x=><button key={x.value} type="button" disabled={busy||reason.trim().length<3||selected.status==='SUBMITTED'} className={'cms-btn '+(x.value==='APPROVED'?'cms-btn--primary':x.value==='REJECTED'?'cms-btn--danger-soft':'cms-btn--secondary')} onClick={()=>setConfirm(x.value)}>{x.label}</button>)}</div></section>}
    {!canDecide&&<SectionNote kind="warning">Vai trò hiện tại không có quyền đưa ra quyết định tại bước này.</SectionNote>}
  </div>;
}
export default function Reviews(){
  const {can}=useSession(),{notice}=useNotices();const [params,setParams]=useSearchParams();
  const stage=['TECHNICAL','EDITOR_IN_CHIEF'].includes(params.get('stage'))?params.get('stage'):(can('reviews:technical:decide')?'TECHNICAL':'EDITOR_IN_CHIEF');
  const [selected,setSelected]=useState(null),[reason,setReason]=useState(''),[confirm,setConfirm]=useState(null),[busy,setBusy]=useState(false);
  const queue=useAdminObject(adminPath('/reviews/queue',{stage}));
  const detailResource=selected?.entityType==='NICHE_SECTION'
    ? '/niches/'+selected.nicheId+'/sections'
    : selected?.entityType==='ARTICLE'? '/articles/'+selected.id
      : selected?.entityType==='TERM'? '/terms/'+selected.id
        : selected?.entityType==='QUESTION_ANSWER'? '/questions/'+selected.questionId:null;
  const detail=useAdminObject(detailResource,Boolean(selected));
  const articles=queue.status==='success'?queue.data.articles||[]:[];
  const terms=queue.status==='success'?queue.data.terms||[]:[];
  const answers=queue.status==='success'?queue.data.answers||[]:[];
  const nicheSections=queue.status==='success'?queue.data.nicheSections||[]:[];
  const items=[...articles,...terms,...answers,...nicheSections];
  const canDecide=stage==='TECHNICAL'?can('reviews:technical:decide'):can('reviews:chief:decide');
  async function action(path,body){setBusy(true);try{await adminRequest(path,{method:'POST',data:body});notice('Backend đã ghi nhận thao tác và trạng thái mới.');setSelected(null);setReason('');setConfirm(null);queue.retry();detail.retry();}catch(e){notice(e.message,'error');setConfirm(null);}finally{setBusy(false);}}
  function decide(){if(!selected||!confirm||reason.trim().length<3)return;
    const base=selected.entityType==='ARTICLE'?'/reviews/articles/'+selected.id+'/decision':selected.entityType==='TERM'?'/reviews/terms/'+selected.id+'/decision':selected.entityType==='NICHE_SECTION'?'/reviews/niche-sections/'+selected.id+'/decision':'/reviews/question-answers/'+selected.id+'/decision';
    const body=selected.entityType==='TERM'?{decision:confirm,reason:reason.trim()}:selected.entityType==='NICHE_SECTION'?{templateType:selected.templateType,stage,decision:confirm,reason:reason.trim()}:{stage,decision:confirm,reason:reason.trim()};
    action(base,body);
  }
  const canStart=stage==='TECHNICAL'&&selected?.status==='SUBMITTED'&&can('reviews:technical:decide')&&selected.entityType!=='QUESTION_ANSWER';
  function start(){if(!selected)return;const path=selected.entityType==='TERM'?'/reviews/terms/'+selected.id+'/start':selected.entityType==='NICHE_SECTION'?'/reviews/niche-sections/'+selected.id+'/start':'/reviews/articles/'+selected.id+'/start';action(path,selected.entityType==='NICHE_SECTION'?{templateType:selected.templateType}:{});}
  return <><PageHeading kicker="QUY TRÌNH BIÊN TẬP" title="Hàng đợi kiểm duyệt" description="Hai tầng quyết định theo quyền kiểm duyệt do phiên Backend xác nhận." icon="review" actions={<button type="button" className="cms-btn cms-btn--secondary" onClick={queue.retry}><CmsIcon name="refresh"/> Tải lại</button>}/>
    <div className="cms-two-pane"><Surface className="cms-list-pane" title="Đang chờ" description="Bài viết, thuật ngữ và câu trả lời theo từng giai đoạn."><div className="cms-review-filter"><label htmlFor="cms-stage">Lớp duyệt</label><select id="cms-stage" value={stage} onChange={e=>{setParams({stage:e.target.value});setSelected(null);}}>{['TECHNICAL','EDITOR_IN_CHIEF'].filter(s=>s==='TECHNICAL'?can('reviews:technical:decide'):can('reviews:chief:decide')).map(s=><option key={s} value={s}>{s==='TECHNICAL'?'Kỹ thuật':'Chủ bút'}</option>)}</select></div>
      {queue.status==='loading'?<div className="cms-inline-state">Đang tải danh sách…</div>:queue.status==='error'?<EmptyState title="Chưa tải được hàng đợi" description={queue.error?.message} icon="alert"/>:items.length?<div className="cms-review-queue">{items.map(item=><button type="button" key={item.entityType+item.id} className={`cms-review-row ${selected?.id===item.id?'is-selected':''}`} onClick={()=>{setSelected(item);setReason('');}}><div className="cms-review-row-top"><span className="cms-review-stage-label">{item.entityType==='ARTICLE'?'BÀI VIẾT':item.entityType==='TERM'?'THUẬT NGỮ':item.entityType==='NICHE_SECTION'?'KHỐI NGÁCH':'CÂU TRẢ LỜI'}</span><Timestamp value={item.submittedAt}/></div><strong>{item.title||'Trả lời câu hỏi độc giả'}</strong><div className="cms-review-row-bottom"><Pill value={item.status}/><CmsIcon name="right" size={17}/></div></button>)}</div>:<EmptyState title="Không có nội dung chờ duyệt" description="API đang trả hàng đợi rỗng cho giai đoạn này." icon="review"/>}
    </Surface><Surface className="cms-review-detail" title="Hồ sơ và quyết định" description="Nguồn, nội dung và quyết định đều dựa trên hồ sơ thực tế.">
      {!selected?<EmptyState title="Chọn một hồ sơ" description="Hồ sơ sẽ mở để kiểm tra nội dung, nguồn và lý do quyết định." icon="review"/>:detail.status==='loading'?<div className="cms-inline-state">Đang tải hồ sơ…</div>:detail.status==='error'?<EmptyState title="Không đọc được hồ sơ" description={detail.error?.message} icon="alert"/>:<ReviewDetail selected={selected} detail={detail} canDecide={canDecide} canStart={canStart} busy={busy} reason={reason} setReason={setReason} start={start} setConfirm={setConfirm}/>}

    </Surface></div><ConfirmDialog open={Boolean(confirm)} busy={busy} title="Xác nhận quyết định biên tập" description="Lý do và trạng thái sẽ được Backend kiểm tra, ghi vào nhật ký kiểm duyệt." confirmText="Gửi quyết định" danger={confirm==='REJECTED'} onClose={()=>setConfirm(null)} onConfirm={decide}/>
  </>;
}
