import { useEffect, useState } from 'react';
import { adminObject } from '../api.js';
import { useAdminList, useAdminObject } from '../hooks.js';
import { useNotices, useSession } from '../Session.jsx';
import { CmsIcon, EmptyState, FormField, PageHeading, Pager, Pill, SectionNote, Surface, Timestamp } from '../ui.jsx';

const TYPE_LABELS={
  PROJECT:'Dự án',
  ARCHITECT:'Kiến trúc sư',
  CONTRACTOR:'Nhà thầu',
  JOIN:'Tham gia',
};

export default function Connections(){
  const {can}=useSession();
  const {notice}=useNotices();
  const [page,setPage]=useState(1);
  const [status,setStatus]=useState('');
  const [type,setType]=useState('');
  const [search,setSearch]=useState('');
  const [selected,setSelected]=useState(null);
  const [moderationNote,setModerationNote]=useState('');
  const [nextStatus,setNextStatus]=useState('IN_REVIEW');
  const [busy,setBusy]=useState(false);

  const list=useAdminList('/connections',{
    page,limit:20,status:status||undefined,type:type||undefined,search:search||undefined,
  },can('connections:read'));
  const detail=useAdminObject(selected?'/connections/'+selected:null,Boolean(selected)&&can('connections:read'));

  useEffect(()=>{
    if(detail.status==='success'){
      setModerationNote(detail.data.moderationNote||'');
      setNextStatus(detail.data.status||'IN_REVIEW');
    }
  },[detail.status,detail.data]);

  async function saveTriage(event){
    event.preventDefault();
    if(!selected||!can('connections:write'))return;
    if(moderationNote.trim().length<3){
      notice('Cần ghi ít nhất 3 ký tự lý do hoặc ghi chú xử lý.','error');
      return;
    }
    setBusy(true);
    try{
      await adminObject('/connections/'+selected,{
        method:'PATCH',
        data:{status:nextStatus,moderationNote:moderationNote.trim()},
      });
      notice('Đã cập nhật trạng thái yêu cầu kết nối.');
      list.retry();
      detail.retry();
    }catch(error){
      notice(error.message,'error');
    }finally{
      setBusy(false);
    }
  }

  const data=detail.data;
  return <>
    <PageHeading
      kicker="KẾT NỐI / TIẾP NHẬN RIÊNG TƯ"
      title="Hàng đợi Kết nối"
      description="Yêu cầu từ website không được công khai. Contact chỉ giải mã ở màn chi tiết; lượt truy cập được Backend ghi audit."
      icon="users"
      actions={<button type="button" className="cms-btn cms-btn--secondary" onClick={list.retry}><CmsIcon name="refresh"/> Tải lại</button>}
    />

    <SectionNote kind="warning">Đây không phải CRM marketplace. Không dùng danh sách này để công khai nhu cầu, đấu giá, chấm sao hoặc xếp hạng nhà thầu/KTS.</SectionNote>

    <Surface title="Bộ lọc tiếp nhận" description="Lọc trực tiếp ở Backend; contact mã hóa không tham gia tìm kiếm.">
      <div className="cms-table-tools">
        <label className="cms-search"><CmsIcon name="search"/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Nhu cầu, khu vực, mảng/ngách…" aria-label="Tìm yêu cầu kết nối"/></label>
        <select value={type} onChange={e=>{setType(e.target.value);setPage(1);}} aria-label="Lọc loại kết nối">
          <option value="">Mọi loại</option>
          {Object.entries(TYPE_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
        <select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}} aria-label="Lọc trạng thái">
          <option value="">Mọi trạng thái</option>
          {['SUBMITTED','IN_REVIEW','CLOSED','REJECTED'].map(value=><option key={value} value={value}>{value}</option>)}
        </select>
      </div>
    </Surface>

    <div className="cms-two-pane">
      <Surface className="cms-list-pane" title="Yêu cầu đã tiếp nhận" description="Không hiển thị contact ở danh sách.">
        {list.status==='loading'?<div className="cms-inline-state">Đang tải yêu cầu…</div>
          :list.status==='error'?<EmptyState title="Không tải được Kết nối" description={list.error?.message} icon="alert"/>
          :list.data.length?<><div className="cms-work-list">{list.data.map(item=><button type="button" key={item.id} className={`cms-work-list-row ${selected===item.id?'is-selected':''}`} onClick={()=>setSelected(item.id)}>
            <span className="cms-work-list-icon"><CmsIcon name="users"/></span>
            <div><strong>{TYPE_LABELS[item.type]||item.type}</strong><small>{item.region||'Chưa có khu vực'}{item.nicheName?' · '+item.nicheName:''}</small><small>{item.description.slice(0,100)}{item.description.length>100?'…':''}</small><small><Timestamp value={item.createdAt} withTime/></small></div>
            <Pill value={item.status}/>
          </button>)}</div><Pager page={page} setPage={setPage} total={list.meta.total} limit={20}/></>
          :<EmptyState title="Chưa có yêu cầu kết nối" description="Website chưa gửi yêu cầu riêng tư nào phù hợp bộ lọc." icon="users"/>}
      </Surface>

      <Surface className="cms-editor-side" title="Chi tiết tiếp nhận" description="Mở hồ sơ sẽ giải mã contact và Backend ghi audit người đã truy cập.">
        {!selected?<EmptyState title="Chọn một yêu cầu" description="Chi tiết và contact riêng tư chỉ tải khi bạn chủ động mở hồ sơ." icon="users"/>
          :detail.status==='loading'?<div className="cms-inline-state">Đang mở hồ sơ riêng tư…</div>
          :detail.status==='error'?<EmptyState title="Không mở được yêu cầu" description={detail.error?.message} icon="alert"/>
          :<div className="cms-stack-form">
            <div className="cms-question-quote"><span>{TYPE_LABELS[data.type]||data.type} · <Timestamp value={data.createdAt} withTime/></span><p>{data.description}</p><small>Khu vực: {data.region||'Chưa cung cấp'} · Mảng/ngách: {data.nicheName||'Chưa xác định'}</small></div>
            <SectionNote>Contact bên dưới là dữ liệu riêng tư đã được giải mã cho phiên CMS này. Không sao chép vào nội dung public.</SectionNote>
            <FormField label="Cách liên hệ riêng"><input readOnly value={data.privateContact||'Không đọc được contact'}/></FormField>
            <p><strong>Trạng thái hiện tại:</strong> <Pill value={data.status}/></p>

            {can('connections:write')?<form className="cms-stack-form" onSubmit={saveTriage}>
              <FormField label="Trạng thái xử lý"><select value={nextStatus} onChange={e=>setNextStatus(e.target.value)}>{['SUBMITTED','IN_REVIEW','CLOSED','REJECTED'].map(value=><option key={value} value={value}>{value}</option>)}</select></FormField>
              <FormField label="Ghi chú xử lý"><textarea rows={5} minLength={3} maxLength={2000} value={moderationNote} onChange={e=>setModerationNote(e.target.value)} placeholder="Ghi lý do, bước tiếp theo hoặc kết quả xử lý…"/></FormField>
              <button className="cms-btn cms-btn--primary" type="submit" disabled={busy||moderationNote.trim().length<3}>{busy?'Đang lưu…':'Lưu triage'}</button>
            </form>:<SectionNote kind="warning">Tài khoản hiện tại chỉ được xem. Chỉ Biên tập viên được thay đổi trạng thái triage.</SectionNote>}
          </div>}
      </Surface>
    </div>
  </>;
}
