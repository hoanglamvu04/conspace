import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminObject, adminRequest, uploadAdminImage, adminPath } from '../api.js';
import { slugify, READER_OPTIONS } from '../constants.js';
import { useAdminList, useAdminObject } from '../hooks.js';
import { useNotices, useSession } from '../Session.jsx';
import { CmsIcon, ConfirmDialog, DataState, EmptyState, FormField, PageHeading, Pager, Pill, SectionNote, Surface, Timestamp } from '../ui.jsx';
import { Markdown } from '../../components/Markdown.jsx';

function NichePicker({value=[],onChange,disabled}) {const niches=useAdminList('/niches');return <FormField label="Ngách liên quan"><div className="cms-check-list cms-check-list--columns">{niches.status==='success'?niches.data.filter(x=>x.isActive).map(x=><label key={x.id}><input type="checkbox" checked={value.includes(x.id)} disabled={disabled} onChange={e=>onChange(e.target.checked?[...value,x.id]:value.filter(v=>v!==x.id))}/>{x.name}</label>):<span>{niches.status==='error'?niches.error.message:'Đang tải danh mục…'}</span>}</div></FormField>}
function ListPane({items,selected,onSelect,kind,status}){return <>{status==='loading'?<div className="cms-inline-state">Đang tải danh sách…</div>:status==='error'?<EmptyState title="Không tải được dữ liệu" description={items.error?.message} icon="alert"/>:!items.data.length?<EmptyState title="Chưa có dữ liệu" description="Không hiển thị hồ sơ mẫu hoặc bản ghi giả." icon={kind}/>:<div className="cms-work-list">{items.data.map(x=><button type="button" key={x.id} className={`cms-work-list-row ${selected===x.id?'is-selected':''}`} onClick={()=>onSelect(x.id)}><span className="cms-work-list-icon"><CmsIcon name={kind}/></span><div><strong>{x.title||x.term||x.description?.slice(0,70)||'Hồ sơ chưa có tên'}</strong><small>{x.slug||x.guessedNiche||x.createdAt||''}</small></div><Pill value={x.status}/></button>)}</div>}</>}
const fieldEmpty={title:'',slug:'',excerpt:'',body:'',audienceRole:'homeowner',phenomenon:'',rootCause:'',interventionPoint:'',repairCostAmount:'',repairCostSource:'',unitAnonymized:false,addressAnonymized:false,photoRightsConfirmed:false,anonymizationNote:'',nicheIds:[],mediaIds:[],media:[],sources:[],sensitivityFlags:['IDENTIFIABLE_ENTITY_RISK']};
function fieldNormalize(d){return {...fieldEmpty,title:d.title||'',slug:d.slug||'',excerpt:d.excerpt||'',body:d.body||'',audienceRole:d.audienceRole||'homeowner',phenomenon:d.phenomenon||'',rootCause:d.root_cause||d.rootCause||'',interventionPoint:d.intervention_point||d.interventionPoint||'',repairCostAmount:d.repair_cost_amount??d.repairCostAmount??'',repairCostSource:d.repair_cost_source||d.repairCostSource||'',unitAnonymized:Boolean(d.unit_anonymized??d.unitAnonymized),addressAnonymized:Boolean(d.address_anonymized??d.addressAnonymized),photoRightsConfirmed:Boolean(d.photo_rights_confirmed??d.photoRightsConfirmed),anonymizationNote:d.anonymization_note||d.anonymizationNote||'',nicheIds:d.nicheIds||[],mediaIds:(d.media||[]).map(x=>x.id),media:d.media||[],sources:(d.sources||[]).map(x=>({title:x.title||'',url:x.url||'',citation:x.citation||''})),sensitivityFlags:d.sensitivityFlags||['IDENTIFIABLE_ENTITY_RISK'],articleId:d.articleId||d.article_id||null,status:d.status||'DRAFT'};}

export function FieldNotes(){
  const {can}=useSession(),{notice}=useNotices();
  const [selected,setSelected]=useState(null),[creating,setCreating]=useState(false),[form,setForm]=useState({...fieldEmpty}),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[preview,setPreview]=useState(false),[confirm,setConfirm]=useState(false),[file,setFile]=useState(null),[rightsNote,setRightsNote]=useState('');
  const [page,setPage]=useState(1),[search,setSearch]=useState(''),[statusFilter,setStatusFilter]=useState(''),[complianceFilter,setComplianceFilter]=useState('');
  const records=useAdminList('/field-notes',{page,limit:20,search:search||undefined,status:statusFilter||undefined,compliance:complianceFilter||undefined},can('field-notes:read'));
  const detail=useAdminObject(selected&&!creating?`/field-notes/${selected}`:null,Boolean(selected)&&!creating);

  useEffect(()=>{if(detail.status==='success'){setForm(fieldNormalize(detail.data));setDirty(false);}},[detail.status,detail.data]);
  const edit=(k,v)=>{setForm(f=>({...f,[k]:v}));setDirty(true);};
  const mediaRightsOk=(form.media||[]).every(item=>item.rightsConfirmed===true);
  const costSourceOk=form.repairCostAmount===''||form.repairCostAmount===null||Boolean(form.repairCostSource.trim());
  const submitChecks=[
    {ok:Boolean(form.body.trim()),label:'Có nội dung mô tả để duyệt'},
    {ok:(form.sources||[]).some(source=>source.title.trim()),label:'Có ít nhất một nguồn truy vết'},
    {ok:form.unitAnonymized,label:'Đã ẩn danh đơn vị'},
    {ok:form.addressAnonymized,label:'Đã ẩn danh địa chỉ'},
    {ok:form.photoRightsConfirmed,label:'Đã xác nhận quyền sử dụng ảnh'},
    {ok:mediaRightsOk,label:'Mọi ảnh liên kết đã có quyền'},
    {ok:costSourceOk,label:'Chi phí có nguồn chứng từ nếu được khai báo'},
    {ok:!dirty,label:'Đã lưu mọi thay đổi'},
  ];
  const readyToSubmit=submitChecks.every(item=>item.ok);

  async function save(e){
    e?.preventDefault();
    if(!can(creating?'field-notes:create':'field-notes:write'))return;
    if(!form.title.trim()||!form.phenomenon.trim()||!form.rootCause.trim()||!form.interventionPoint.trim()){notice('Cần hiện tượng, nguyên nhân và mốc dừng nghiệm thu.','error');return;}
    if(!costSourceOk){notice('Giá sửa chữa phải có nguồn số liệu thực tế.','error');return;}
    setBusy(true);
    try{
      const payload={
        title:form.title.trim(),slug:slugify(form.slug||form.title),excerpt:form.excerpt||'',body:form.body||'',
        audienceRole:form.audienceRole,nicheIds:form.nicheIds||[],mediaIds:form.mediaIds||[],
        sources:(form.sources||[]).filter(source=>source.title.trim()).map(source=>({title:source.title.trim(),url:source.url.trim()||null,citation:source.citation.trim()||null})),
        sensitivityFlags:form.sensitivityFlags||['IDENTIFIABLE_ENTITY_RISK'],
        phenomenon:form.phenomenon,rootCause:form.rootCause,interventionPoint:form.interventionPoint,
        repairCostAmount:form.repairCostAmount===''?null:Number(form.repairCostAmount),repairCostSource:form.repairCostSource.trim()||null,
        unitAnonymized:form.unitAnonymized,addressAnonymized:form.addressAnonymized,photoRightsConfirmed:form.photoRightsConfirmed,
        anonymizationNote:form.anonymizationNote||null,
      };
      const item=await adminObject(creating?'/field-notes':`/field-notes/${selected}`,{method:creating?'POST':'PATCH',data:payload});
      notice('Backend đã lưu ca hiện trường.');
      records.retry();setDirty(false);
      if(creating){setCreating(false);setSelected(item.id);}else detail.retry();
    }catch(error){notice(error.message,'error');}finally{setBusy(false);}
  }

  async function upload(){
    if(!file)return;
    setBusy(true);
    try{
      const result=await uploadAdminImage(file,{rightsConfirmed:form.photoRightsConfirmed,rightsNote,altText:'Ảnh hiện trường'});
      setForm(current=>({...current,mediaIds:[...new Set([...(current.mediaIds||[]),result.id])],media:[...(current.media||[]),{id:result.id,filename:result.originalFilename,rightsConfirmed:result.rightsConfirmed}]}));
      setDirty(true);setFile(null);setRightsNote('');
      notice('Đã tải tệp lên Backend. Nhớ lưu hồ sơ để liên kết.');
    }catch(e){notice(e.message,'error');}finally{setBusy(false);}
  }

  function removeMedia(id){
    setForm(current=>({...current,mediaIds:(current.mediaIds||[]).filter(x=>x!==id),media:(current.media||[]).filter(x=>x.id!==id)}));
    setDirty(true);
  }

  async function submit(){
    setConfirm(false);
    if(!form.articleId||!can('field-notes:submit')||!readyToSubmit)return;
    setBusy(true);
    try{
      await adminRequest(`/articles/${form.articleId}/submit`,{method:'POST',data:{}});
      notice('Ca đã được gửi duyệt thông qua bài viết liên kết.');
      records.retry();detail.retry();
    }catch(e){notice(e.message,'error');}finally{setBusy(false);}
  }

  const open=creating||selected&&detail.status==='success';
  const summary=records.meta||{};

  return <><PageHeading kicker="HIỆN TRƯỜNG / COMPLIANCE" title="Nhật ký hiện trường" description="Theo dõi ca thật theo trạng thái ẩn danh, nguồn, quyền ảnh và khả năng gửi duyệt. Backend vẫn là ranh giới chặn cuối." icon="field" actions={<>{can('field-notes:create')&&<button className="cms-btn cms-btn--primary" type="button" onClick={()=>{setCreating(true);setSelected(null);setForm({...fieldEmpty,sources:[],media:[],mediaIds:[],nicheIds:[]});setDirty(false);}}><CmsIcon name="plus"/> Ghi ca mới</button>}<button type="button" className="cms-btn cms-btn--secondary" onClick={records.retry}><CmsIcon name="refresh"/> Tải lại</button></>}/>

    <div className="cms-compliance-grid">
      <div className="cms-compliance-card"><span>Tổng hồ sơ</span><strong>{summary.total??'—'}</strong><small>Dữ liệu thật từ Field Notes</small></div>
      <div className="cms-compliance-card"><span>Đủ compliance</span><strong>{summary.complianceReady??'—'}</strong><small>Ẩn danh + quyền ảnh + chi phí</small></div>
      <div className="cms-compliance-card"><span>Đang bị chặn</span><strong>{summary.blocked??'—'}</strong><small>Thiếu một hoặc nhiều điều kiện</small></div>
      <div className="cms-compliance-card"><span>Sẵn sàng gửi duyệt</span><strong>{summary.readyToSubmit??'—'}</strong><small>Compliance + nội dung + nguồn</small></div>
      <div className="cms-compliance-card"><span>Cần chỉnh sửa</span><strong>{summary.needsChanges??'—'}</strong><small>Reviewer đã trả lại</small></div>
    </div>

    <Surface title="Bộ lọc compliance" description="Lọc trực tiếp ở Backend, không lọc giả trên tập dữ liệu đã tải.">
      <div className="cms-table-tools">
        <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Tiêu đề / slug / hiện tượng…" aria-label="Tìm ca hiện trường"/>
        <select value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1);}} aria-label="Lọc trạng thái"><option value="">Mọi trạng thái</option>{['DRAFT','NEEDS_CHANGES','SUBMITTED','TECHNICAL_REVIEW','EDITOR_IN_CHIEF_REVIEW','APPROVED','SCHEDULED','PUBLISHED','REJECTED','WITHDRAWN','ARCHIVED'].map(status=><option key={status} value={status}>{status}</option>)}</select>
        <select value={complianceFilter} onChange={e=>{setComplianceFilter(e.target.value);setPage(1);}} aria-label="Lọc compliance"><option value="">Mọi mức compliance</option><option value="ready">Đủ compliance</option><option value="blocked">Đang bị chặn</option></select>
      </div>
    </Surface>

    <div className="cms-two-pane"><Surface className="cms-list-pane" title="Hồ sơ công trường" description="Mỗi dòng hiển thị readiness tính từ dữ liệu thật.">
      {records.status==='loading'?<div className="cms-inline-state">Đang tải hồ sơ…</div>:records.status==='error'?<EmptyState title="Không tải được hiện trường" description={records.error?.message} icon="alert"/>:records.data.length?<><div className="cms-work-list">{records.data.map(item=><button type="button" key={item.id} className={`cms-work-list-row ${selected===item.id?'is-selected':''}`} onClick={()=>{setSelected(item.id);setCreating(false);}}><span className="cms-work-list-icon"><CmsIcon name="field"/></span><div><strong>{item.title}</strong><small>{item.sourceCount||0} nguồn · {item.mediaCount||0} ảnh · {item.unconfirmedMediaCount||0} ảnh thiếu quyền</small><small>{item.fieldComplianceReady?'Đủ compliance':'Compliance chưa đủ'} · {item.reviewReady&&['DRAFT','NEEDS_CHANGES'].includes(item.status)?'Có thể gửi duyệt':'Chưa sẵn sàng gửi duyệt'}</small></div><Pill value={item.status}/></button>)}</div><Pager page={page} setPage={setPage} total={summary.total} limit={20}/></>:<EmptyState title="Không có ca phù hợp" description="Không có dữ liệu khớp bộ lọc hiện tại." icon="field"/>}
    </Surface>

    <Surface className="cms-editor-side" title={creating?'Nhập ca mới':'Biên tập hồ sơ'} description="Mỗi trường phải gắn với quan sát, nguồn hoặc mốc nghiệm thu thật.">
      {!open&&<EmptyState title="Chọn ca hiện trường" description={detail.error?.message||'Chỉ ca đã được nhập vào API mới xuất hiện tại đây.'} icon="field"/>}
      {open&&<form className="cms-stack-form" onSubmit={save}>
        <FormField label="Tiêu đề" required><input value={form.title} required disabled={!can('field-notes:write')} onChange={e=>{edit('title',e.target.value);if(creating)edit('slug',slugify(e.target.value));}}/></FormField>
        <FormField label="Slug"><input value={form.slug} disabled={!can('field-notes:write')} onChange={e=>edit('slug',slugify(e.target.value))}/></FormField>
        <FormField label="Hiện tượng (quan sát nguyên trạng)" required><textarea rows={5} value={form.phenomenon} disabled={!can('field-notes:write')} onChange={e=>edit('phenomenon',e.target.value)} required/></FormField>
        <FormField label="Nguyên nhân gốc (có đối chiếu)" required><textarea rows={5} value={form.rootCause} disabled={!can('field-notes:write')} onChange={e=>edit('rootCause',e.target.value)} required/></FormField>
        <FormField label="Điểm dừng nghiệm thu" required><textarea rows={4} value={form.interventionPoint} disabled={!can('field-notes:write')} onChange={e=>edit('interventionPoint',e.target.value)} required/></FormField>

        <div className="cms-form-two"><FormField label="Chi phí sửa (chỉ nếu có thật)"><input type="number" min={0} value={form.repairCostAmount} onChange={e=>edit('repairCostAmount',e.target.value)}/></FormField><FormField label="Nguồn chứng từ chi phí"><input value={form.repairCostSource} onChange={e=>edit('repairCostSource',e.target.value)}/></FormField></div>

        <NichePicker value={form.nicheIds} onChange={v=>edit('nicheIds',v)} disabled={!can('field-notes:write')}/>

        <FormField label="Nguồn truy vết"><div className="cms-stack-form">{(form.sources||[]).map((source,index)=><div className="cms-source-editor" key={index}><input disabled={!can('field-notes:write')} value={source.title} onChange={e=>edit('sources',form.sources.map((x,i)=>i===index?{...x,title:e.target.value}:x))} placeholder="Tên nguồn / hồ sơ / biên bản"/><input type="url" disabled={!can('field-notes:write')} value={source.url} onChange={e=>edit('sources',form.sources.map((x,i)=>i===index?{...x,url:e.target.value}:x))} placeholder="URL https nếu có"/><input disabled={!can('field-notes:write')} value={source.citation} onChange={e=>edit('sources',form.sources.map((x,i)=>i===index?{...x,citation:e.target.value}:x))} placeholder="Trích dẫn / số hồ sơ"/>{can('field-notes:write')&&<button type="button" className="cms-btn cms-btn--light" onClick={()=>edit('sources',form.sources.filter((_,i)=>i!==index))}>Bỏ nguồn</button>}</div>)}{can('field-notes:write')&&<button type="button" className="cms-btn cms-btn--light" onClick={()=>edit('sources',[...(form.sources||[]),{title:'',url:'',citation:''}])}><CmsIcon name="plus"/> Thêm nguồn</button>}</div></FormField>

        <div className="cms-list-editor-head"><h3>Nội dung mô tả bổ sung</h3><button className="cms-btn cms-btn--light" type="button" onClick={()=>setPreview(!preview)}>Preview / Soạn</button></div>
        {preview?<div className="cms-markdown cms-preview"><Markdown body={form.body}/></div>:<textarea className="cms-body-textarea" rows={8} value={form.body} onChange={e=>edit('body',e.target.value)} />}

        <FormField label="Ảnh và tài liệu"><div className="cms-check-list">{(form.media||[]).map(item=><span key={item.id}><a href={`/api/admin/media/${item.id}/download`} target="_blank" rel="noreferrer">Mở {item.filename||item.id.slice(0,8)}</a> · {item.rightsConfirmed?'đã có quyền':'chưa có quyền'} {can('field-notes:write')&&<button type="button" className="cms-text-danger" onClick={()=>removeMedia(item.id)}>Bỏ liên kết</button>}</span>)}</div><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/><input placeholder="Căn cứ quyền sử dụng ảnh" aria-label="Căn cứ quyền ảnh" value={rightsNote} onChange={e=>setRightsNote(e.target.value)}/><button type="button" disabled={busy||!file||form.photoRightsConfirmed&&!rightsNote.trim()} className="cms-btn cms-btn--secondary" onClick={upload}>Tải ảnh lên Backend</button></FormField>

        <FormField label="Ghi chú ẩn danh"><textarea rows={3} value={form.anonymizationNote} onChange={e=>edit('anonymizationNote',e.target.value)} placeholder="Cách che địa chỉ, tên đơn vị, biển hiệu…"/></FormField>
        {[['unitAnonymized','Đã ẩn danh đơn vị'],['addressAnonymized','Đã ẩn danh địa chỉ'],['photoRightsConfirmed','Đã kiểm tra quyền sử dụng ảnh']].map(([key,label])=><label className="cms-sensitive-check" key={key}><input type="checkbox" checked={form[key]} onChange={e=>edit(key,e.target.checked)} /><span>{label}</span></label>)}

        <div className="cms-submit-checklist"><h3>Điều kiện gửi duyệt hiện trường</h3>{submitChecks.map(item=><p key={item.label} className={item.ok?'is-ok':'is-missing'}><CmsIcon name={item.ok?'check':'alert'} size={16}/> {item.label}</p>)}</div>

        <div className="cms-form-footer">{dirty?'Thay đổi chưa lưu':<Pill value={form.status}/>}<div className="cms-btn-row">{can('field-notes:write')&&<button className="cms-btn cms-btn--primary" disabled={busy}>{busy?'Đang lưu…':'Lưu ca'}</button>}{selected&&form.articleId&&can('field-notes:submit')&&['DRAFT','NEEDS_CHANGES'].includes(form.status)&&<button className="cms-btn cms-btn--secondary" type="button" disabled={busy||!readyToSubmit} onClick={()=>setConfirm(true)}>Gửi duyệt bài hiện trường</button>}</div></div>
        {form.articleId&&<Link className="cms-text-link" to={`/admin/articles/${form.articleId}/edit`}>Xem bài viết của ca →</Link>}
      </form>}
    </Surface></div>

    <ConfirmDialog open={confirm} title="Gửi duyệt ca hiện trường?" description="Backend sẽ kiểm tra lại nội dung, nguồn, ẩn danh và quyền media trước khi chuyển trạng thái." onClose={()=>setConfirm(false)} onConfirm={submit} confirmText="Gửi duyệt"/>
  </>;
}

const emptyTerm={term:'',slug:'',definition:'',sourceRef:'',nicheIds:[]};
export function DictionaryAdmin(){
  const {can}=useSession(),{notice}=useNotices();const [page,setPage]=useState(1),[search,setSearch]=useState(''),[selected,setSelected]=useState(null),[creating,setCreating]=useState(false),[form,setForm]=useState({...emptyTerm}),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);
  const list=useAdminList('/terms',{page,limit:15,search:search||undefined});const detail=useAdminObject(selected&&!creating?`/terms/${selected}`:null,Boolean(selected)&&!creating);
  useEffect(()=>{if(detail.status==='success'){const x=detail.data;setForm({term:x.term||'',slug:x.slug||'',definition:x.definition||'',sourceRef:x.source_ref||x.sourceRef||'',nicheIds:x.nicheIds||[],status:x.status||'DRAFT'});setDirty(false);}},[detail.status,detail.data]);
  const edit=(k,v)=>{setForm(f=>({...f,[k]:v}));setDirty(true);};
  async function save(e){e.preventDefault();setBusy(true);try{const data={term:form.term.trim(),slug:slugify(form.slug||form.term),definition:form.definition.trim(),sourceRef:form.sourceRef.trim(),nicheIds:form.nicheIds};const res=await adminObject(creating?'/terms':`/terms/${selected}`,{method:creating?'POST':'PATCH',data});notice('Đã lưu định nghĩa và nguồn vào Backend.');list.retry();setDirty(false);if(creating){setSelected(res.id);setCreating(false);}else detail.retry();}catch(err){notice(err.message,'error');}finally{setBusy(false);}}
  async function transition(action){if(!selected)return;setBusy(true);try{await adminRequest(`/terms/${selected}/${action}`,{method:'POST',data:{}});notice('Backend ghi nhận trạng thái thuật ngữ.');detail.retry();list.retry();}catch(e){notice(e.message,'error');}finally{setBusy(false);}}
  const editable=can('dictionary:write')&&(creating||['DRAFT','NEEDS_CHANGES'].includes(form.status));
  return <><PageHeading kicker="TỪ ĐIỂN NGHỀ" title="Quản lý thuật ngữ" description="Định nghĩa chính xác có nguồn và xác nhận chuyên môn." icon="dictionary" actions={can('dictionary:create')?<button type="button" className="cms-btn cms-btn--primary" onClick={()=>{setCreating(true);setSelected(null);setForm({...emptyTerm});setDirty(false);}}><CmsIcon name="plus"/> Thêm thuật ngữ</button>:null}/><div className="cms-two-pane"><Surface title="Thuật ngữ" className="cms-list-pane"><label className="cms-search"><CmsIcon name="search"/><input aria-label="Tìm thuật ngữ" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Từ / định nghĩa"/></label><ListPane items={list} selected={selected} onSelect={id=>{setSelected(id);setCreating(false);}} kind="dictionary" status={list.status}/>{list.status==='success'&&<Pager page={page} setPage={setPage} total={list.meta.total} limit={15}/>}</Surface><Surface title={creating?'Tạo định nghĩa':'Hồ sơ thuật ngữ'} className="cms-editor-side">{!(creating||selected)?<EmptyState title="Chọn một thuật ngữ" icon="dictionary"/>:detail.status==='loading'&&!creating?<div className="cms-inline-state">Đang tải…</div>:<form className="cms-stack-form" onSubmit={save}><FormField label="Thuật ngữ" required><input required disabled={!editable} value={form.term} onChange={e=>{edit('term',e.target.value);if(creating)edit('slug',slugify(e.target.value));}}/></FormField><FormField label="Slug"><input disabled={!editable} value={form.slug} onChange={e=>edit('slug',slugify(e.target.value))}/></FormField><FormField label="Định nghĩa" required><textarea rows={8} disabled={!editable} required value={form.definition} onChange={e=>edit('definition',e.target.value)}/></FormField><FormField label="Nguồn đã kiểm chứng" required><textarea rows={4} disabled={!editable} required value={form.sourceRef} onChange={e=>edit('sourceRef',e.target.value)}/></FormField><NichePicker value={form.nicheIds} onChange={v=>edit('nicheIds',v)} disabled={!editable}/><div className="cms-btn-row">{editable&&<button disabled={busy} className="cms-btn cms-btn--primary" type="submit">Lưu thuật ngữ</button>}{selected&&!dirty&&can('dictionary:submit')&&['DRAFT','NEEDS_CHANGES'].includes(form.status)&&<button className="cms-btn cms-btn--secondary" type="button" onClick={()=>transition('submit')}>Gửi duyệt kỹ thuật</button>}{selected&&!dirty&&can('dictionary:publish')&&form.status==='APPROVED'&&<button className="cms-btn cms-btn--primary" type="button" onClick={()=>transition('publish')}>Xuất bản thuật ngữ</button>}</div></form>}</Surface></div></>;
}

export function Questions(){
  const {can}=useSession(),{notice}=useNotices();const [page,setPage]=useState(1),[selected,setSelected]=useState(null),[body,setBody]=useState(''),[flags,setFlags]=useState([]),[assessed,setAssessed]=useState(false),[preview,setPreview]=useState(false),[busy,setBusy]=useState(false),[moderation,setModeration]=useState('');
  const list=useAdminList('/questions',{page,limit:15});const detail=useAdminObject(selected?`/questions/${selected}`:null,Boolean(selected));
  useEffect(()=>{if(detail.status==='success'){setBody(detail.data.answerBody||'');setFlags(detail.data.answerSensitivityFlags||[]);setAssessed(Boolean(detail.data.answerSensitivityAssessed));setModeration('');}},[detail.status,detail.data]);
  const q=detail.data;
  async function saveAnswer(){if(!selected||!body.trim())return;setBusy(true);try{await adminObject(`/questions/${selected}/answer`,{method:'POST',data:{body:body.trim(),sensitivityFlags:flags,sensitivityAssessed:assessed}});notice('Backend đã lưu câu trả lời và trạng thái nháp.');list.retry();detail.retry();}catch(e){notice(e.message,'error');}finally{setBusy(false);}}
  async function answerAction(action){setBusy(true);try{await adminRequest(`/questions/${selected}/answer/${action}`,{method:'POST',data:{}});notice('Backend đã ghi nhận chuyển trạng thái.');detail.retry();list.retry();}catch(e){notice(e.message,'error');}finally{setBusy(false);}}
  async function moderate(status){if(!moderation.trim())return;setBusy(true);try{await adminObject(`/questions/${selected}`,{method:'PATCH',data:{status,moderationNote:moderation.trim()}});notice('Đã cập nhật tình trạng xử lý câu hỏi.');detail.retry();list.retry();}catch(e){notice(e.message,'error');}finally{setBusy(false);}}
  return <><PageHeading kicker="HỎI ĐÁP / BẠN ĐỌC" title="Hộp thư hỏi đáp" description="Không mở tài khoản độc giả. Chỉ trả lời câu hỏi thật sau kiểm duyệt, tôn trọng quyền riêng tư." icon="question"/><div className="cms-two-pane"><Surface title="Câu hỏi gửi đến" className="cms-list-pane"><ListPane items={list} selected={selected} onSelect={setSelected} kind="question" status={list.status}/>{list.status==='success'&&<Pager page={page} setPage={setPage} limit={15} total={list.meta.total}/>}</Surface><Surface title="Phân tích và trả lời" className="cms-editor-side">{!selected?<EmptyState title="Chọn câu hỏi" icon="question"/>:detail.status==='loading'?<div className="cms-inline-state">Đang tải chi tiết…</div>:detail.status==='error'?<EmptyState title="Không mở được câu hỏi" description={detail.error?.message} icon="alert"/>:<div className="cms-stack-form"><div className="cms-question-quote"><span>CÂU HỎI GỐC · <Timestamp value={q.created_at||q.createdAt}/></span><p>{q.description}</p><small>Ngách được người gửi chọn: {q.guessedNiche||'Chưa xác định'}</small></div>{q.requestPrivateReply&&<SectionNote kind="warning">Người gửi yêu cầu trả lời riêng. Thông tin liên hệ chỉ hiển thị cho ADMIN/EDITOR và lượt truy cập được Backend ghi audit.</SectionNote>}{can('questions:write')&&q.privateContact&&<p>Liên hệ được cấp phép: <strong>{q.privateContact}</strong></p>}
      <div className="cms-media-grid">{(q.media||[]).map(m=><a key={m.id} className="cms-btn cms-btn--secondary" href={`/api/admin/media/${m.id}/download`} target="_blank" rel="noreferrer"><CmsIcon name="media"/> Mở tệp {m.filename||m.id.slice(0,8)}</a>)}</div><div className="cms-list-editor-head"><h3>Trả lời có nguồn</h3><button type="button" className="cms-btn cms-btn--light" onClick={()=>setPreview(!preview)}>Preview</button></div>{preview?<div className="cms-markdown cms-preview"><Markdown body={body}/></div>:<textarea className="cms-body-textarea" rows={14} disabled={!can('questions:write')||!['DRAFT','NEEDS_CHANGES',null].includes(q.answerStatus)} value={body} onChange={e=>setBody(e.target.value)} placeholder="Chỉ trả lời đúng phạm vi dữ liệu đã xác minh…"/>}
      {['INDUSTRY_DARK_SIDE','PRICE_OR_RATE','WARRANTY_PERIOD','IDENTIFIABLE_ENTITY_RISK','LEGAL_CONTENT'].map(f=><label key={f} className="cms-sensitive-check"><input type="checkbox" checked={flags.includes(f)} onChange={e=>setFlags(arr=>e.target.checked?[...arr,f]:arr.filter(x=>x!==f))}/><span>{f.replaceAll('_',' ')}</span></label>)}<label className="cms-sensitive-check"><input type="checkbox" checked={assessed} onChange={e=>setAssessed(e.target.checked)}/><span>Đã đánh giá nội dung nhạy cảm của câu trả lời</span></label><div className="cms-btn-row">{can('questions:write')&&<button type="button" className="cms-btn cms-btn--primary" disabled={busy||!body.trim()||!['DRAFT','NEEDS_CHANGES',null].includes(q.answerStatus)} onClick={saveAnswer}>Lưu câu trả lời</button>}{can('questions:submit')&&['DRAFT','NEEDS_CHANGES'].includes(q.answerStatus)&&<button type="button" className="cms-btn cms-btn--secondary" disabled={busy||!assessed} onClick={()=>answerAction('submit')}>Gửi duyệt</button>}{can('questions:publish')&&q.answerStatus==='APPROVED'&&<button type="button" className="cms-btn cms-btn--primary" disabled={busy} onClick={()=>answerAction('publish')}>Xuất bản câu trả lời</button>}</div>
      {can('questions:write')&&<><FormField label="Ghi chú điều phối / lý do loại"><textarea rows={3} value={moderation} onChange={e=>setModeration(e.target.value)}/></FormField><div className="cms-btn-row"><button type="button" className="cms-btn cms-btn--secondary" disabled={busy||moderation.trim().length<3} onClick={()=>moderate('IN_REVIEW')}>Đang xử lý</button><button type="button" className="cms-btn cms-btn--danger-soft" disabled={busy||moderation.trim().length<3} onClick={()=>moderate('REJECTED')}>Từ chối</button></div></>}
      <SectionNote kind="warning">Backend không có API sửa ngách do độc giả đoán. Không ghi giả liên kết phân loại hoặc công khai ảnh chưa xác nhận quyền.</SectionNote>
    </div>}</Surface></div></>;
}
