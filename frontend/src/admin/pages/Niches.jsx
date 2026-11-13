import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminObject } from '../api.js';
import { DESIGN_AREAS, slugify } from '../constants.js';
import { useAdminList, useAdminObject } from '../hooks.js';
import { useSession, useNotices } from '../Session.jsx';
import { CmsIcon, DataState, EmptyState, FormField, PageHeading, Pill, SectionNote, SearchFilters, Surface, Timestamp } from '../ui.jsx';
import { Markdown } from '../../components/Markdown.jsx';
import {
  TEMPLATE_A_ROLES,
  mapSectionCells,
  sectionKey,
  buildSectionSavePayload,
  buildSectionSubmitPayload,
  buildSectionPublishPayload,
  isSectionEditable,
  isSectionSubmittable,
} from '../nicheWorkflow.js';

const empty={slug:'',name:'',code:'',groupType:'construction',groupId:'',summary:'',sourceRef:'',sortOrder:0,isActive:false};
const sensitivityOptions=['INDUSTRY_DARK_SIDE','PRICE_OR_RATE','WARRANTY_PERIOD','IDENTIFIABLE_ENTITY_RISK','LEGAL_CONTENT'];
const emptyCell=(sectionNo,audienceRole=null)=>({id:null,sectionNo,audienceRole,content:'',sourceRef:'',status:'DRAFT',sensitivityAssessed:false,sensitivityFlags:[],requiresChiefReview:false,existing:false});

export default function Niches(){
  const {can}=useSession(),{notice}=useNotices();
  const [group,setGroup]=useState(''),[search,setSearch]=useState(''),[selected,setSelected]=useState(null),[creating,setCreating]=useState(false);
  const [form,setForm]=useState({...empty}),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false);
  const [sectionModel,setSectionModel]=useState(null),[audience,setAudience]=useState('homeowner'),[activeNo,setActiveNo]=useState(1),[preview,setPreview]=useState(false);
  const [transitionReason,setTransitionReason]=useState('');
  const [newGroup,setNewGroup]=useState({slug:'',name:'',sourceRef:''}),[showGroup,setShowGroup]=useState(false);
  const niches=useAdminList('/niches'),groups=useAdminList('/niches/groups');
  const sectionResponse=useAdminObject(selected?'/niches/'+selected+'/sections':null,Boolean(selected)&&!creating);

  const filtered=useMemo(()=>niches.data.filter(n=>(!group||n.groupType===group)&&(!search||`${n.slug} ${n.name} ${n.code||''} ${n.groupName||''}`.toLowerCase().includes(search.toLowerCase()))),[niches.data,group,search]);

  useEffect(()=>{
    if(sectionResponse.status!=='success')return;
    try{
      const mapped=mapSectionCells(sectionResponse.data);
      setSectionModel(mapped);
      const first=mapped.sections.find(row=>mapped.templateType==='TEMPLATE_B'||row.audienceRole===audience);
      setActiveNo(first?.sectionNo||1);
    }catch(error){notice(error.message,'error');}
  },[sectionResponse.status,sectionResponse.data]);

  const templateType=sectionModel?.templateType || (form.groupType==='design'?'TEMPLATE_B':'TEMPLATE_A');
  const isTemplateB=templateType==='TEMPLATE_B';
  const rows=sectionModel?.sections||[];
  const visibleRows=useMemo(()=>{
    if(isTemplateB)return rows;
    return rows.filter(row=>row.audienceRole===audience);
  },[rows,isTemplateB,audience]);

  useEffect(()=>{
    if(!visibleRows.length)return;
    if(!visibleRows.some(row=>row.sectionNo===activeNo))setActiveNo(visibleRows[0].sectionNo);
  },[visibleRows,activeNo]);

  const currentRow=visibleRows.find(row=>row.sectionNo===activeNo) || null;
  const currentKey=sectionKey(activeNo,isTemplateB?null:audience);
  const cell=sectionModel?.cells?.[currentKey] || {
    ...emptyCell(activeNo,isTemplateB?null:audience),
    title:currentRow?.title||'',
    sourceDescription:currentRow?.sourceDescription||'',
    blockKey:currentRow?.blockKey||null,
  };
  const editable=isSectionEditable(cell.status)&&can('niches:write');

  function open(n){
    setSectionModel(null);setSelected(n.id);setCreating(false);
    setForm({...empty,slug:n.slug,name:n.name,code:n.code||'',groupType:n.groupType,groupId:n.groupId||'',summary:n.summary||'',sourceRef:n.sourceRef||'',sortOrder:n.sortOrder||0,isActive:Boolean(n.isActive)});
    setAudience('homeowner');setActiveNo(1);setDirty(false);setTransitionReason('');
  }
  function startNew(){setCreating(true);setSelected(null);setForm({...empty});setDirty(false);setSectionModel(null);}
  function change(k,v){setForm(f=>({...f,[k]:v}));setDirty(true);}

  async function saveMetadata(){
    if(!can('niches:write'))return;
    if(!form.name.trim()||!form.sourceRef.trim()||!form.slug.trim()){notice('Tên ngách, slug và nguồn xác nhận là bắt buộc.','error');return;}
    setBusy(true);
    try{
      const body={...form,code:form.code||null,groupId:form.groupType==='design'?null:form.groupId||null,sortOrder:Number(form.sortOrder)};
      const saved=await adminObject(creating?'/niches':'/niches/'+selected,{method:creating?'POST':'PATCH',data:body});
      notice('Backend đã xác nhận lưu hồ sơ ngách.');niches.retry();setDirty(false);
      if(creating){setCreating(false);setSelected(saved.id);}
    }catch(e){notice(e.message,'error');}finally{setBusy(false);}
  }

  async function addGroup(){
    if(!can('niches:write'))return;setBusy(true);
    try{
      await adminObject('/niches/groups',{method:'POST',data:{...newGroup,slug:slugify(newGroup.slug)}});
      notice('Đã tạo nhóm có nguồn theo Backend.');groups.retry();setNewGroup({slug:'',name:'',sourceRef:''});setShowGroup(false);
    }catch(e){notice(e.message,'error');}finally{setBusy(false);}
  }

  function writeCell(field,value){
    setSectionModel(model=>{
      if(!model)return model;
      const base=model.cells[currentKey]||emptyCell(activeNo,isTemplateB?null:audience);
      return {...model,cells:{...model.cells,[currentKey]:{...base,[field]:value,dirty:true}}};
    });
  }
  function toggleFlag(flag,checked){
    const next=checked?[...new Set([...(cell.sensitivityFlags||[]),flag])]:(cell.sensitivityFlags||[]).filter(x=>x!==flag);
    writeCell('sensitivityFlags',next);
  }

  async function saveSection(){
    if(!selected||!editable)return;
    setBusy(true);
    try{
      await adminObject('/niches/'+selected+'/sections/'+activeNo,{
        method:'PUT',
        data:buildSectionSavePayload({
          templateType,audienceRole:isTemplateB?null:audience,content:cell.content,sourceRef:cell.sourceRef,
          sensitivityAssessed:cell.sensitivityAssessed,sensitivityFlags:cell.sensitivityFlags,
        }),
      });
      notice('Đã lưu bản nháp khối theo đúng contract.');sectionResponse.retry();
    }catch(e){notice(e.message,'error');}finally{setBusy(false);}
  }

  async function submitSection(){
    if(!selected||!can('niches:write')||!isSectionSubmittable(cell)||transitionReason.trim().length<3)return;
    setBusy(true);
    try{
      if(cell.dirty||!cell.existing){
        await adminObject('/niches/'+selected+'/sections/'+activeNo,{
          method:'PUT',
          data:buildSectionSavePayload({
            templateType,audienceRole:isTemplateB?null:audience,content:cell.content,sourceRef:cell.sourceRef,
            sensitivityAssessed:cell.sensitivityAssessed,sensitivityFlags:cell.sensitivityFlags,
          }),
        });
      }
      await adminObject('/niches/'+selected+'/sections/'+activeNo+'/submit',{
        method:'POST',
        data:buildSectionSubmitPayload(templateType,isTemplateB?null:audience,transitionReason),
      });
      notice('Khối đã được gửi vào hàng đợi duyệt kỹ thuật.');setTransitionReason('');sectionResponse.retry();
    }catch(e){notice(e.message,'error');}finally{setBusy(false);}
  }

  async function publishSection(){
    if(!selected||!can('niches:publish')||cell.status!=='APPROVED'||transitionReason.trim().length<3)return;
    setBusy(true);
    try{
      await adminObject('/niches/'+selected+'/sections/'+activeNo+'/publish',{
        method:'POST',
        data:buildSectionPublishPayload(templateType,isTemplateB?null:audience,transitionReason),
      });
      notice('Khối đã được xuất bản sau khi hoàn tất kiểm duyệt.');setTransitionReason('');sectionResponse.retry();
    }catch(e){notice(e.message,'error');}finally{setBusy(false);}
  }

  return <><PageHeading kicker="TRANG TRỤ NGÁCH" title="Kho ngách chuyên môn" description="Template A: 12 khối theo lớp độc giả. Template B: 7 khối kiến trúc dùng chung. Không trộn hai cấu trúc." icon="niches" actions={can('niches:write')?<button type="button" className="cms-btn cms-btn--primary" onClick={startNew}><CmsIcon name="plus"/> Thêm ngách đã xác nhận</button>:null}/>
    <div className="cms-niche-summary"><span>08 mảng thiết kế</span><span>30 ngách thi công tối đa</span><span>Template A · 12 khối</span><span>Template B · 07 khối</span></div>
    <div className="cms-two-pane cms-niche-layout">
      <Surface className="cms-list-pane" title="Danh mục" description="Danh sách thật từ API nội bộ.">
        <SearchFilters query={search} onQuery={setSearch} status={group} onStatus={setGroup} statuses={[{value:'design',label:'Mảng kiến trúc'},{value:'construction',label:'Ngách thi công'}]} placeholder="Tên / mã / nhóm ngách…"/>
        <DataState data={niches} title="Chưa có ngách" empty="Chưa có danh mục nào trong database." icon="niches"><div className="cms-niche-list">{filtered.map(n=><button type="button" key={n.id} className={`cms-niche-item ${selected===n.id?'is-selected':''}`} onClick={()=>open(n)}><span className="cms-niche-item-code">{n.code||'—'}</span><div><strong>{n.name}</strong><small>{n.groupType==='design'?'Template B · Kiến trúc':(n.groupName||'Thi công')+' · Template A'}</small></div><span className={`cms-activity-dot ${n.isActive?'active':''}`}/></button>)}</div></DataState>
        {can('niches:write')&&<div className="cms-form-footer"><button type="button" className="cms-btn cms-btn--light" onClick={()=>setShowGroup(!showGroup)}>Quản lý nhóm thi công</button></div>}
        {showGroup&&<div className="cms-stack-form"><h3>Nhóm có nguồn</h3><div className="cms-check-list">{groups.data.map(g=><p key={g.id}><strong>{g.name}</strong> · {g.nicheCount} ngách</p>)}</div><FormField label="Tên nhóm"><input value={newGroup.name} onChange={e=>setNewGroup(g=>({...g,name:e.target.value,slug:slugify(e.target.value)}))}/></FormField><FormField label="Slug"><input value={newGroup.slug} onChange={e=>setNewGroup(g=>({...g,slug:slugify(e.target.value)}))}/></FormField><FormField label="Nguồn phân nhóm"><input value={newGroup.sourceRef} onChange={e=>setNewGroup(g=>({...g,sourceRef:e.target.value}))}/></FormField><button type="button" className="cms-btn cms-btn--primary" disabled={busy||newGroup.sourceRef.trim().length<3||!newGroup.name.trim()} onClick={addGroup}>Tạo nhóm</button></div>}
      </Surface>

      <Surface className="cms-niche-edit-pane" title="Biên tập ngách" description="Metadata và nội dung đều tuân theo template do Backend trả về.">
        {!selected&&!creating&&<EmptyState title="Chọn một ngách" description="Ngách chưa có dữ liệu không được tự động tạo nội dung giả." icon="niches"/>}
        {(selected||creating)&&<div className="cms-niche-editor">
          <div className="cms-form-two"><FormField label="Mã ngách"><input disabled={!can('niches:write')} value={form.code} onChange={e=>change('code',e.target.value)} maxLength={30}/></FormField><FormField label="Nhóm"><select disabled={!can('niches:write')} value={form.groupType} onChange={e=>change('groupType',e.target.value)}><option value="design">Thiết kế · Template B</option><option value="construction">Thi công · Template A</option></select></FormField></div>
          <FormField label="Tên ngách" required><input disabled={!can('niches:write')} value={form.name} onChange={e=>{change('name',e.target.value);if(creating)change('slug',slugify(e.target.value));}} placeholder="Nhập đúng danh mục đã phê duyệt"/></FormField>
          <div className="cms-form-two"><FormField label="Slug" required><input disabled={!can('niches:write')} value={form.slug} onChange={e=>change('slug',slugify(e.target.value))}/></FormField><FormField label="Thứ tự"><input disabled={!can('niches:write')} min={0} max={1000} type="number" value={form.sortOrder} onChange={e=>change('sortOrder',e.target.value)}/></FormField></div>
          {form.groupType==='construction'&&<FormField label="Nhóm thi công đã xác minh"><select disabled={!can('niches:write')} value={form.groupId} onChange={e=>change('groupId',e.target.value)}><option value="">Chọn nhóm có nguồn</option>{groups.data.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></FormField>}
          <FormField label="Nguồn xác nhận" required><input disabled={!can('niches:write')} value={form.sourceRef} onChange={e=>change('sourceRef',e.target.value)} placeholder="Tên tài liệu, quy chuẩn hoặc hồ sơ"/></FormField>
          <FormField label="Mô tả"><textarea rows={3} disabled={!can('niches:write')} value={form.summary} onChange={e=>change('summary',e.target.value)}/></FormField>
          <label className="cms-sensitive-check"><input type="checkbox" disabled={!can('niches:write')} checked={form.isActive} onChange={e=>change('isActive',e.target.checked)}/><span>Đã đủ nguồn để kích hoạt</span></label>
          {can('niches:write')&&<div className="cms-form-footer"><span className={dirty?'cms-unsaved':'cms-saved'}>{dirty?'Có thay đổi metadata':'Dữ liệu từ API'}</span><button type="button" className="cms-btn cms-btn--primary" onClick={saveMetadata} disabled={busy||!form.name||form.sourceRef.length<3||form.groupType==='construction'&&!form.groupId}>{busy?'Đang lưu…':'Lưu hồ sơ ngách'}</button></div>}

          {selected&&<>{sectionResponse.status==='loading'?<div className="cms-inline-state">Đang tải cấu trúc template…</div>:sectionResponse.status==='error'?<SectionNote kind="warning">{sectionResponse.error?.message}</SectionNote>:sectionModel&&<>
            <div className="cms-niche-content-head"><div><h3>{isTemplateB?'Template B · 07 khối kiến trúc':'Template A · 12 khối chuyên môn'}</h3><p>{isTemplateB?'Nội dung dùng chung, không tạo lớp độc giả giả.':'Mỗi góc nhìn chỉ hiện các block được mapping trong IA.'}</p></div><button className="cms-btn cms-btn--light" type="button" onClick={()=>setPreview(!preview)}><CmsIcon name="eye"/> {preview?'Soạn':'Preview'}</button></div>

            {!isTemplateB&&<div className="cms-review-filter"><label htmlFor="niche-audience">Lớp độc giả</label><select id="niche-audience" value={audience} onChange={e=>{setAudience(e.target.value);setTransitionReason('');}}>{TEMPLATE_A_ROLES.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></div>}
            {isTemplateB&&<SectionNote>Template B dành cho 08 mảng thiết kế đã xác nhận: {DESIGN_AREAS.join(' · ')}. Bảy khối là nội dung dùng chung.</SectionNote>}

            <div className="cms-check-list">{visibleRows.map(row=><button key={(row.audienceRole||'shared')+'-'+row.sectionNo} type="button" className={`cms-btn ${activeNo===row.sectionNo?'cms-btn--primary':'cms-btn--light'}`} onClick={()=>{setActiveNo(row.sectionNo);setTransitionReason('');}}>{String(row.sectionNo).padStart(2,'0')} · {row.title}</button>)}</div>

            {!visibleRows.length?<EmptyState title="Không có block cho lớp này" description="Mapping được lấy trực tiếp từ Backend; không tự tạo thêm block." icon="niches"/>:<div className="cms-niche-block">
              <div><span>{String(activeNo).padStart(2,'0')}</span><strong>{cell.title||currentRow?.title}</strong><small>{cell.sourceDescription||currentRow?.sourceDescription||cell.blockKey}</small></div>
              <div className="cms-btn-row"><Pill value={cell.status}/>{cell.requiresChiefReview&&<span className="cms-review-stage-label">BẮT BUỘC CHỦ BÚT</span>}</div>
              {preview?<div className="cms-markdown cms-preview"><Markdown body={cell.content}/></div>:<textarea rows={10} disabled={!editable} value={cell.content} onChange={e=>writeCell('content',e.target.value)} placeholder="Chỉ nhập thông tin có căn cứ được xác minh…"/>}
              <FormField label="Nguồn của khối" required><input disabled={!editable} value={cell.sourceRef} onChange={e=>writeCell('sourceRef',e.target.value)}/></FormField>

              <div className="cms-stack-form"><strong>Đánh giá nhạy cảm</strong>{sensitivityOptions.map(flag=><label key={flag} className="cms-sensitive-check"><input type="checkbox" disabled={!editable||(!isTemplateB&&activeNo===6&&flag==='INDUSTRY_DARK_SIDE')} checked={(cell.sensitivityFlags||[]).includes(flag)||(!isTemplateB&&activeNo===6&&flag==='INDUSTRY_DARK_SIDE')} onChange={e=>toggleFlag(flag,e.target.checked)}/><span>{flag.replaceAll('_',' ')}</span></label>)}<label className="cms-sensitive-check"><input type="checkbox" disabled={!editable} checked={Boolean(cell.sensitivityAssessed)} onChange={e=>writeCell('sensitivityAssessed',e.target.checked)}/><span>Đã đánh giá nội dung nhạy cảm trước khi gửi duyệt</span></label></div>

              {cell.status==='PUBLISHED'&&<SectionNote kind="warning">Khối đang live. Backend chặn ghi đè trực tiếp để nội dung công khai không biến mất. Cần workflow revision riêng cho lần sửa sau.</SectionNote>}
              {cell.status==='NEEDS_CHANGES'&&<SectionNote kind="warning">Khối đã bị trả về. Chỉnh đúng nội dung/nguồn rồi lưu và gửi duyệt lại.</SectionNote>}
              {['SUBMITTED','TECHNICAL_REVIEW','EDITOR_IN_CHIEF_REVIEW'].includes(cell.status)&&<SectionNote>Khối đang trong quy trình duyệt. Mở Hàng đợi duyệt để xử lý theo vai trò.</SectionNote>}
              {cell.submittedAt&&<p><small>Gửi duyệt: <Timestamp value={cell.submittedAt}/></small></p>}
              {cell.approvedAt&&<p><small>Phê duyệt: <Timestamp value={cell.approvedAt}/></small></p>}
              {cell.publishedAt&&<p><small>Xuất bản: <Timestamp value={cell.publishedAt}/></small></p>}

              {editable&&<div className="cms-btn-row"><button type="button" disabled={busy} className="cms-btn cms-btn--secondary" onClick={saveSection}>Lưu nháp</button></div>}
              {can('niches:write')&&isSectionEditable(cell.status)&&<div className="cms-stack-form"><FormField label="Lý do gửi duyệt" required><textarea rows={3} value={transitionReason} onChange={e=>setTransitionReason(e.target.value)} placeholder="Nêu phạm vi nội dung đã kiểm tra và căn cứ nguồn…"/></FormField><button type="button" disabled={busy||transitionReason.trim().length<3||!isSectionSubmittable(cell)} className="cms-btn cms-btn--primary" onClick={submitSection}>Gửi duyệt kỹ thuật</button></div>}
              {cell.status==='APPROVED'&&can('niches:publish')&&<div className="cms-stack-form"><FormField label="Lý do xuất bản" required><textarea rows={3} value={transitionReason} onChange={e=>setTransitionReason(e.target.value)}/></FormField><button type="button" disabled={busy||transitionReason.trim().length<3} className="cms-btn cms-btn--primary" onClick={publishSection}>Xuất bản khối đã duyệt</button></div>}
              {['SUBMITTED','TECHNICAL_REVIEW','EDITOR_IN_CHIEF_REVIEW'].includes(cell.status)&&can('reviews:read')&&<Link className="cms-text-link" to={`/admin/reviews?stage=${cell.status==='EDITOR_IN_CHIEF_REVIEW'?'EDITOR_IN_CHIEF':'TECHNICAL'}`}>Mở hàng đợi duyệt →</Link>}
            </div>}

            <Link to={`/ngach/${form.slug}`} className="cms-text-link" target="_blank">Xem URL ngách công khai ↗</Link>
          </>}</>}
        </div>}
      </Surface>
    </div>
  </>;
}
