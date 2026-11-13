import { useState } from 'react';
import { useAdminList } from '../hooks.js';
import { CmsIcon, EmptyState, PageHeading, Pager, Pill, Surface, Timestamp } from '../ui.jsx';

function JsonPreview({value}){
  if(value===null||value===undefined)return <span className="cms-muted">—</span>;
  return <pre className="cms-audit-json">{JSON.stringify(value,null,2)}</pre>;
}

export default function Audit(){
  const [page,setPage]=useState(1),[entityType,setEntityType]=useState(''),[action,setAction]=useState('');
  const events=useAdminList('/audit',{entityType:entityType||undefined,action:action||undefined,page,limit:30});
  return <><PageHeading kicker="KIỂM SOÁT / NHẬT KÝ" title="Audit History" description="Mọi thay đổi và chuyển trạng thái được đọc trực tiếp từ audit_logs + workflow_events. Không suy diễn từ updated_at." icon="clock" actions={<button type="button" className="cms-btn cms-btn--secondary" onClick={events.retry}><CmsIcon name="refresh"/> Tải lại</button>}/>
    <Surface title="Nhật ký hệ thống" description="Có thể lọc theo loại thực thể và hành động. Dữ liệu before/after chỉ hiển thị đúng những gì Backend đã ghi audit.">
      <div className="cms-table-tools">
        <select value={entityType} onChange={e=>{setEntityType(e.target.value);setPage(1);}} aria-label="Lọc loại thực thể">
          <option value="">Tất cả thực thể</option>
          {['ARTICLE','NICHE_SECTION','ARCHITECTURAL_SECTION','TERM','QUESTION','QUESTION_ANSWER','FIELD_NOTE','MEDIA','CMS_USER'].map(x=><option key={x} value={x}>{x}</option>)}
        </select>
        <input value={action} onChange={e=>{setAction(e.target.value);setPage(1);}} placeholder="Lọc theo action…" aria-label="Lọc action"/>
      </div>
      {events.status==='loading'?<div className="cms-inline-state">Đang tải nhật ký…</div>:events.status==='error'?<EmptyState title="Không đọc được audit" description={events.error?.message} icon="alert"/>:events.data.length?<div className="cms-audit-list">{events.data.map(event=><details className="cms-audit-event" key={event.eventType+'-'+event.id}>
        <summary><div><span className="cms-review-stage-label">{event.eventType}</span> <strong>{event.action}</strong><p>{event.entityType}{event.entityId?' · '+event.entityId:''}</p></div><div><Pill value={event.toStatus||event.fromStatus||event.eventType}/><Timestamp value={event.createdAt} withTime/></div></summary>
        <div className="cms-audit-grid">
          <div><h4>Người thực hiện</h4><p>{event.actorName||'Hệ thống'}{event.actorEmail?' · '+event.actorEmail:''}</p>{event.reason&&<><h4>Lý do</h4><p>{event.reason}</p></>}</div>
          <div><h4>Chuyển trạng thái</h4><p>{event.fromStatus||'—'} → {event.toStatus||'—'}</p><h4>Metadata</h4><JsonPreview value={event.metadata}/></div>
          <div><h4>Trước thay đổi</h4><JsonPreview value={event.beforeData}/></div>
          <div><h4>Sau thay đổi</h4><JsonPreview value={event.afterData}/></div>
        </div>
      </details>)}</div>:<EmptyState title="Chưa có sự kiện phù hợp" description="Không có audit/workflow event khớp bộ lọc hiện tại." icon="clock"/>}
      <Pager page={page} setPage={setPage} limit={30} total={events.meta.total}/>
    </Surface>
  </>;
}
