import { useAdminList } from './hooks.js';
import { useSession } from './Session.jsx';
import { CmsIcon, SectionNote, Timestamp } from './ui.jsx';

function isDecision(event){
  return event?.eventType==='WORKFLOW' && ['REQUEST_CHANGES','REJECTED','APPROVED'].includes(event.action);
}

export function ReviewFeedback({entityType,entityId,status,limit=30,showHistory=true}){
  const {can}=useSession();
  const history=useAdminList('/audit',{entityType,entityId,page:1,limit},Boolean(entityId)&&can('audit:read'));
  if(!entityId||!can('audit:read'))return null;

  const decisions=history.status==='success'?history.data.filter(isDecision):[];
  const latestReturn=decisions.find(event=>event.action==='REQUEST_CHANGES'||event.toStatus==='NEEDS_CHANGES')||null;

  return <div className="cms-review-feedback">
    {status==='NEEDS_CHANGES'&&<SectionNote kind="warning">
      <strong>Cần chỉnh sửa trước khi gửi lại.</strong>
      {latestReturn
        ? <span> {latestReturn.reason||'Reviewer chưa ghi lý do chi tiết.'} — {latestReturn.actorName||'Reviewer'} · <Timestamp value={latestReturn.createdAt} withTime/></span>
        : <span> Hồ sơ đang ở trạng thái NEEDS_CHANGES; mở lịch sử kiểm duyệt để đối chiếu yêu cầu trả lại.</span>}
    </SectionNote>}
    {history.status==='error'&&<SectionNote kind="warning">Không tải được lịch sử kiểm duyệt: {history.error?.message}</SectionNote>}
    {showHistory&&decisions.length>0&&<details className="cms-review-feedback-history" open={status==='NEEDS_CHANGES'}>
      <summary>Phản hồi & quyết định kiểm duyệt ({decisions.length})</summary>
      <div className="cms-history-list">{decisions.map(event=><div className="cms-task" key={event.eventType+event.id}>
        <span className="cms-task-dot"/>
        <div><strong>{event.action==='REQUEST_CHANGES'?'Yêu cầu chỉnh sửa':event.action==='APPROVED'?'Đã duyệt':'Từ chối'}</strong>
          <p>{event.fromStatus||'—'} → {event.toStatus||'—'} · {event.actorName||'Hệ thống'}{event.metadata?.stage?' · '+event.metadata.stage:''}</p>
          {event.reason&&<p><strong>Nhận xét:</strong> {event.reason}</p>}
        </div>
        <Timestamp value={event.createdAt} withTime/>
      </div>)}</div>
    </details>}
    {history.status==='success'&&status==='NEEDS_CHANGES'&&!decisions.length&&<p className="cms-field-help"><CmsIcon name="info" size={14}/> Chưa có decision event trong Audit cho hồ sơ này.</p>}
  </div>;
}
