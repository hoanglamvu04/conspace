import { Link } from 'react-router-dom';
import { useAdminList, useAdminObject } from '../hooks.js';
import { adminPath } from '../api.js';
import { useSession } from '../Session.jsx';
import { CmsIcon, EmptyState, PageHeading, Pill, Surface, Timestamp, TableWrap } from '../ui.jsx';

function Metric({title,value,icon,to,note}){
  return <Link to={to} className="cms-metric"><div className="cms-metric-top"><span className="cms-metric-icon"><CmsIcon name={icon}/></span><CmsIcon name="right" size={16}/></div><div className="cms-metric-value">{value}</div><div className="cms-metric-name">{title}</div><small>{note}</small></Link>;
}
const total=(resource)=>resource.status==='success'&&Number.isFinite(resource.meta?.total)?resource.meta.total:null;
const show=(value)=>Number.isFinite(value)?value.toLocaleString('vi-VN'):'—';

export default function Dashboard(){
  const {user,can}=useSession();
  const drafts=useAdminList('/articles',{status:'DRAFT',page:1,limit:1});
  const submitted=useAdminList('/articles',{status:'SUBMITTED',page:1,limit:1});
  const technical=useAdminList('/articles',{status:'TECHNICAL_REVIEW',page:1,limit:1});
  const chief=useAdminList('/articles',{status:'EDITOR_IN_CHIEF_REVIEW',page:1,limit:1});
  const approved=useAdminList('/articles',{status:'APPROVED',page:1,limit:1});
  const returned=useAdminList('/articles',{status:'NEEDS_CHANGES',page:1,limit:8},can('articles:write'));
  const scheduled=useAdminList('/articles',{status:'SCHEDULED',page:1,limit:20},can('articles:schedule'));
  const changed=useAdminList('/articles',{page:1,limit:8});
  const users=useAdminList('/users',{},can('users:read'));
  const questions=useAdminList('/questions',{status:'SUBMITTED',page:1,limit:1},can('questions:read'));
  const mediaPending=useAdminList('/media',{rights:'unconfirmed',page:1,limit:1},can('media:read'));
  const audit=useAdminList('/audit',{page:1,limit:10},can('audit:read'));
  const stage=can('reviews:chief:decide')&&!can('reviews:technical:decide')?'EDITOR_IN_CHIEF':'TECHNICAL';
  const queue=useAdminObject(adminPath('/reviews/queue',{stage}),can('reviews:read'));
  const queueItems=queue.status==='success'?[...(queue.data.articles||[]),...(queue.data.terms||[]),...(queue.data.answers||[]),...(queue.data.nicheSections||[])]:[];
  const reviewTotal=(total(submitted)??0)+(total(technical)??0);

  function refresh(){
    [drafts,submitted,technical,chief,approved,returned,scheduled,changed,users,questions,mediaPending,audit].forEach(x=>x.retry?.());
    queue.retry?.();
  }

  return <><PageHeading kicker="TỔNG QUAN TÒA SOẠN" title={`Chào ${user?.displayName||'bạn'},`} description="Bàn điều phối lấy trực tiếp từ trạng thái workflow, audit, Q&A và quyền media; không dùng số liệu giả." icon="dashboard" actions={<><button type="button" className="cms-btn cms-btn--secondary" onClick={refresh}><CmsIcon name="refresh" size={17}/> Cập nhật</button>{can('articles:create')&&<Link className="cms-btn cms-btn--primary" to="/admin/articles/new"><CmsIcon name="plus"/> Viết bài</Link>}</>}/>

    <div className="cms-metric-grid">
      {can('articles:write')&&<Metric title="Bài nháp" value={show(total(drafts))} icon="article" to="/admin/articles?status=DRAFT" note="Bản thảo chưa gửi duyệt"/>}
      {can('reviews:read')&&<Metric title="Duyệt kỹ thuật" value={show(reviewTotal)} icon="review" to="/admin/reviews?stage=TECHNICAL" note="SUBMITTED + TECHNICAL_REVIEW"/>}
      {can('reviews:read')&&<Metric title="Chờ Chủ bút" value={show(total(chief))} icon="shield" to="/admin/reviews?stage=EDITOR_IN_CHIEF" note="Nội dung nhạy cảm"/>}
      {(can('articles:publish')||can('articles:write'))&&<Metric title="Đã duyệt, chờ xuất bản" value={show(total(approved))} icon="check" to="/admin/articles?status=APPROVED" note="APPROVED chưa public"/>}
      {can('questions:read')&&<Metric title="Q&A mới" value={show(total(questions))} icon="question" to="/admin/questions" note="Câu hỏi đang SUBMITTED"/>}
      {can('media:read')&&<Metric title="Media thiếu quyền" value={show(total(mediaPending))} icon="media" to="/admin/media?rights=unconfirmed" note="Chưa xác nhận quyền sử dụng"/>}
      {can('users:read')&&<Metric title="Tài khoản CMS" value={show(users.status==='success'?users.data.length:null)} icon="users" to="/admin/users" note="Tài khoản thực tế trong hệ thống"/>}
      {can('audit:read')&&<Metric title="Nhật ký kiểm soát" value={show(total(audit))} icon="clock" to="/admin/audit" note="Audit + workflow events"/>}
    </div>

    <div className="cms-dashboard-grid">
      <Surface title="Việc cần tôi xử lý" description="Ưu tiên hồ sơ đúng với quyền hiện tại.">
        {can('reviews:read')?(
          queue.status==='loading'?<div className="cms-inline-state">Đang tải hàng đợi…</div>
          :queue.status==='error'?<EmptyState title="Không thể lấy hàng đợi" description={queue.error?.message} icon="alert"/>
          :queueItems.length?<div className="cms-task-list">{queueItems.slice(0,8).map(item=><div className="cms-task" key={item.entityType+item.id}><span className="cms-task-dot"/><div><strong>{item.title||'Câu trả lời đang duyệt'}</strong><p>{item.entityType} · {item.status}</p></div><Link className="cms-text-link" to={`/admin/reviews?stage=${stage}`}>Mở →</Link></div>)}</div>
          :<EmptyState title="Không có hồ sơ chờ duyệt" description="Hàng đợi hiện tại đang rỗng." icon="check"/>
        ):returned.status==='success'&&returned.data.length?<div className="cms-task-list">{returned.data.map(x=><div className="cms-task" key={x.id}><span className="cms-task-dot"/><div><strong>{x.title}</strong><p>Cần chỉnh sửa và gửi duyệt lại</p></div><Link className="cms-text-link" to={`/admin/articles/${x.id}/edit`}>Mở →</Link></div>)}</div>:<EmptyState title="Chưa có việc tồn" description="Nội dung cần sửa sẽ xuất hiện tại đây." icon="check"/>}
      </Surface>

      <Surface title="Lịch xuất bản" description="Chỉ hiển thị bài SCHEDULED có thời điểm thật từ Backend.">
        {scheduled.status==='success'&&scheduled.data.length?<div className="cms-schedule-list">{scheduled.data.filter(x=>x.scheduledAt).map(x=><div className="cms-schedule-item" key={x.id}><div className="cms-schedule-day"><CmsIcon name="calendar"/></div><div><strong>{x.title}</strong><p><Timestamp value={x.scheduledAt} withTime/></p></div><Pill value="SCHEDULED"/></div>)}</div>:<EmptyState title={scheduled.status==='error'?'Chưa thể tải lịch':'Chưa có bài lên lịch'} description={scheduled.error?.message||'Không có lịch xuất bản đang chờ.'} icon="calendar"/>}
      </Surface>
    </div>

    {can('audit:read')&&<Surface title="Hoạt động kiểm soát gần đây" description="Nguồn: audit_logs và workflow_events, không suy diễn từ thời gian cập nhật.">
      {audit.status==='success'&&audit.data.length?<div className="cms-task-list">{audit.data.map(event=><div className="cms-task" key={event.eventType+event.id}><span className="cms-task-dot"/><div><strong>{event.action}</strong><p>{event.actorName||'Hệ thống'} · {event.entityType}{event.toStatus?' · '+event.toStatus:''}</p></div><Timestamp value={event.createdAt} withTime/></div>)}</div>:<EmptyState title="Chưa có audit event" description={audit.error?.message||'Nhật ký hiện chưa có dữ liệu.'} icon="clock"/>}
      <Link className="cms-text-link" to="/admin/audit">Mở toàn bộ Audit History →</Link>
    </Surface>}

    <Surface title="Nội dung cập nhật gần đây" description="Danh sách bài được cập nhật gần nhất; dùng để điều hướng, không thay thế audit.">
      {changed.status==='success'&&changed.data.length?<TableWrap><thead><tr><th>Bài viết</th><th>Người cập nhật</th><th>Trạng thái</th><th>Thời gian</th></tr></thead><tbody>{changed.data.map(x=><tr key={x.id}><td><Link className="cms-row-link" to={`/admin/articles/${x.id}/edit`}>{x.title}</Link></td><td>{x.updatedBy||'—'}</td><td><Pill value={x.status}/></td><td><Timestamp value={x.updatedAt} withTime/></td></tr>)}</tbody></TableWrap>:<EmptyState title="Chưa có dữ liệu cập nhật" description={changed.error?.message||'Hiện chưa có bài viết.'} icon="clock"/>}
    </Surface>
  </>;
}
