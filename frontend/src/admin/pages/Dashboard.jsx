import { Link } from 'react-router-dom';
import { useAdminList, useAdminObject } from '../hooks.js';
import { adminPath } from '../api.js';
import { useSession } from '../Session.jsx';
import { CmsIcon, EmptyState, PageHeading, Pill, Surface, Timestamp, TableWrap } from '../ui.jsx';

const counts = [
  {key:'DRAFT',label:'Bài nháp',icon:'article'},
  {key:'SUBMITTED',label:'Chờ duyệt kỹ thuật',icon:'review'},
  {key:'EDITOR_IN_CHIEF_REVIEW',label:'Chờ chủ bút',icon:'shield'},
  {key:'PUBLISHED',label:'Đã xuất bản',icon:'book'},
];
function StatCard({title,icon,source,to,extra=0}) {
  return <Link to={to} className="cms-metric"><div className="cms-metric-top"><span className="cms-metric-icon"><CmsIcon name={icon}/></span><CmsIcon name="right" size={16}/></div><div className="cms-metric-value">{source.status==='success'&&Number.isFinite(source.meta.total)?(source.meta.total+extra).toLocaleString('vi-VN'):'—'}</div><div className="cms-metric-name">{title}</div><small>{source.status==='error'?source.error?.message:source.status==='loading'?'Đang lấy từ API':'Dữ liệu bài viết thực tế'}</small></Link>;
}
export default function Dashboard(){
  const {user,can}=useSession();
  const drafts=useAdminList('/articles',{status:'DRAFT',page:1,limit:1});
  const submitted=useAdminList('/articles',{status:'SUBMITTED',page:1,limit:1});
  const technical=useAdminList('/articles',{status:'TECHNICAL_REVIEW',page:1,limit:1});
  const chief=useAdminList('/articles',{status:'EDITOR_IN_CHIEF_REVIEW',page:1,limit:1});
  const published=useAdminList('/articles',{status:'PUBLISHED',page:1,limit:1});
  const scheduled=useAdminList('/articles',{status:'SCHEDULED',page:1,limit:20});
  const changed=useAdminList('/articles',{page:1,limit:8});
  const queue=useAdminObject(adminPath('/reviews/queue',{stage:can('reviews:chief:decide')&&!can('reviews:technical:decide')?'EDITOR_IN_CHIEF':'TECHNICAL'}),can('reviews:read'));
  const returned=useAdminList('/articles',{status:'NEEDS_CHANGES',page:1,limit:8},can('articles:write'));
  const all=[drafts,submitted,technical,chief,published,scheduled,changed];
  function refresh(){all.forEach(x=>x.retry());if(can('reviews:read'))queue.retry();if(can('articles:write'))returned.retry();}
  const queueItems=queue.status==='success'?[...(queue.data.articles||[]),...(queue.data.terms||[]),...(queue.data.answers||[])]:[];
  return <><PageHeading kicker="TỔNG QUAN TÒA SOẠN" title={`Chào ${user?.displayName||'bạn'},`} description="Các chỉ số được tổng hợp trực tiếp từ danh sách bài viết và hàng đợi thực tế." icon="dashboard" actions={<><button type="button" className="cms-btn cms-btn--secondary" onClick={refresh}><CmsIcon name="refresh" size={17}/> Cập nhật</button>{can('articles:create')&&<Link className="cms-btn cms-btn--primary" to="/admin/articles/new"><CmsIcon name="plus"/> Viết bài</Link>}</>}/>
    <div className="cms-metric-grid"><StatCard title="Bài nháp" icon="article" source={drafts} to="/admin/articles?status=DRAFT"/><Link to="/admin/articles?status=SUBMITTED" className="cms-metric"><div className="cms-metric-top"><span className="cms-metric-icon"><CmsIcon name="review"/></span><CmsIcon name="right" size={16}/></div><div className="cms-metric-value">{submitted.status==='success'&&technical.status==='success'?Number(submitted.meta.total)+Number(technical.meta.total):'—'}</div><div className="cms-metric-name">Chờ / đang duyệt kỹ thuật</div><small>{submitted.status==='error'||technical.status==='error'?'Không thể tính đủ dữ liệu':'Hai trạng thái SUBMITTED + TECHNICAL_REVIEW'}</small></Link><StatCard title="Chờ chủ bút" icon="shield" source={chief} to="/admin/articles?status=EDITOR_IN_CHIEF_REVIEW"/><StatCard title="Đã xuất bản" icon="book" source={published} to="/admin/articles?status=PUBLISHED"/></div>
    <div className="cms-dashboard-grid"><Surface title="Công việc cần xử lý" description="Hồ sơ hiện đang chờ bước xử lý phù hợp với vai trò.">
      {can('reviews:read') ? queue.status==='loading'?<div className="cms-inline-state">Đang tải hàng đợi…</div>:queue.status==='error'?<EmptyState title="Không thể lấy hàng đợi" description={queue.error?.message} icon="alert"/>:queueItems.length?<div className="cms-task-list">{queueItems.slice(0,8).map((item)=><div className="cms-task" key={item.entityType+item.id}><span className="cms-task-dot"/><div><strong>{item.title||'Câu trả lời đang duyệt'}</strong><p>{item.entityType} · {item.status}</p></div><Link className="cms-text-link" to="/admin/reviews">Mở →</Link></div>)}</div>:<EmptyState title="Không có hồ sơ chờ duyệt" description="Hàng đợi hiện tại của Backend chưa có hồ sơ." icon="check"/>:returned.status==='success'&&returned.data.length?<div className="cms-task-list">{returned.data.map(x=><div className="cms-task" key={x.id}><span className="cms-task-dot"/><div><strong>{x.title}</strong><p>Cần chỉnh sửa và gửi duyệt lại</p></div><Link to={`/admin/articles/${x.id}/edit`}>Mở →</Link></div>)}</div>:<EmptyState title="Chưa có công việc cần xử lý" description="Bài cần sửa sẽ hiển thị khi Backend trả dữ liệu." icon="check"/>}
    </Surface><Surface title="Lịch xuất bản" description="Chỉ các bài có trạng thái SCHEDULED và mốc giờ do API cung cấp.">
      {scheduled.status==='success'&&scheduled.data.length?<div className="cms-schedule-list">{scheduled.data.filter(x=>x.scheduledAt).map(x=><div className="cms-schedule-item" key={x.id}><div className="cms-schedule-day"><CmsIcon name="calendar"/></div><div><strong>{x.title}</strong><p><Timestamp value={x.scheduledAt} withTime/></p></div><Pill value="SCHEDULED"/></div>)}</div>:<EmptyState title={scheduled.status==='error'?'Chưa thể tải lịch':'Chưa có bài lên lịch'} description={scheduled.error?.message||'Khi bài được lên lịch, danh sách sẽ lấy từ API bài viết.'} icon="calendar"/>}
    </Surface></div>
    <Surface title="Cập nhật nội dung gần đây" description="Danh sách bài được cập nhật gần nhất, không phải nhật ký audit.">{changed.status==='success'&&changed.data.length?<TableWrap><thead><tr><th>Bài viết</th><th>Người cập nhật</th><th>Trạng thái</th><th>Thời gian</th></tr></thead><tbody>{changed.data.map(x=><tr key={x.id}><td><Link className="cms-row-link" to={`/admin/articles/${x.id}/edit`}>{x.title}</Link></td><td>{x.updatedBy||'—'}</td><td><Pill value={x.status}/></td><td><Timestamp value={x.updatedAt} withTime/></td></tr>)}</tbody></TableWrap>:<EmptyState title="Chưa có dữ liệu cập nhật" description={changed.error?.message||'Hiện chưa có bài viết.'} icon="clock"/>}<p className="cms-field-help">Backend hiện không cung cấp endpoint audit log riêng cho dashboard. Mục này hiển thị bản ghi cập nhật thực tế, không gọi chúng là hoạt động audit.</p></Surface>
  </>;
}
