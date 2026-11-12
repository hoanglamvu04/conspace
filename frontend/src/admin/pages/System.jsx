import { useEffect, useMemo, useState } from 'react';
import { adminObject, adminRequest, uploadAdminImage } from '../api.js';
import { ROLES } from '../constants.js';
import { useAdminList } from '../hooks.js';
import { useNotices, useSession } from '../Session.jsx';
import { CmsIcon, ConfirmDialog, DataState, EmptyState, FormField, PageHeading, Pager, Pill, SectionNote, Surface, TableWrap, Timestamp } from '../ui.jsx';
const roleOptions=Object.entries(ROLES).map(([value,label])=>({value,label}));

export function Media(){
  const {can}=useSession(),{notice}=useNotices();
  const [page,setPage]=useState(1),[category,setCategory]=useState(''),[search,setSearch]=useState(''),[file,setFile]=useState(null),[altText,setAltText]=useState(''),[rightsNote,setRightsNote]=useState(''),[rights,setRights]=useState(false),[selected,setSelected]=useState(null),[deleteId,setDeleteId]=useState(null),[busy,setBusy]=useState(false);
  const list=useAdminList('/media',{page,limit:24,category:category||undefined});
  const shown=useMemo(()=>list.data.filter(x=>!search||`${x.originalFilename} ${x.altText||''}`.toLowerCase().includes(search.toLowerCase())),[list.data,search]);
  async function upload(e){e.preventDefault();if(!file)return;setBusy(true);try{const item=await uploadAdminImage(file,{altText,rightsConfirmed:rights,rightsNote});notice(`Đã tải ${item.originalFilename||file.name} lên máy chủ.`);list.retry();setFile(null);setAltText('');setRights(false);setRightsNote('');}catch(error){notice(error.message,'error');}finally{setBusy(false);}}
  async function patch(e){e.preventDefault();if(!selected)return;setBusy(true);try{await adminObject(`/media/${selected.id}`,{method:'PATCH',data:{altText:selected.altText||null,rightsConfirmed:selected.rightsConfirmed,rightsNote:selected.rightsNote||null}});notice('Backend đã lưu metadata và quyền dùng tệp.');setSelected(null);list.retry();}catch(err){notice(err.message,'error');}finally{setBusy(false);}}
  async function remove(){if(!deleteId)return;setBusy(true);try{await adminRequest(`/media/${deleteId}`,{method:'DELETE'});notice('Tệp đã được lưu trạng thái xóa ở Backend.');setDeleteId(null);list.retry();}catch(err){notice(err.message,'error');}finally{setBusy(false);}}
  return <><PageHeading kicker="MEDIA / TÒA SOẠN" title="Thư viện tài nguyên" description="Tệp riêng tư trong CMS, quyền dùng ảnh được ghi rõ, tệp xuất bản mới có đường dẫn công khai." icon="media"/>
    {can('media:upload')&&<Surface title="Tải tài nguyên" description="Backend nhận JSON base64, đối chiếu định dạng tệp; không gửi trực tiếp vào thư mục public."><form className="cms-stack-form" onSubmit={upload}><label className="cms-media-dropzone"><CmsIcon name="upload" size={28}/><strong>Chọn ảnh hoặc PDF có nguồn</strong><span>JPEG, PNG, WebP, PDF · mỗi tệp ≤ 10 MB</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/><small>{file?.name||'Chưa chọn tệp'}</small></label><div className="cms-form-two"><FormField label="Mô tả ảnh / văn bản thay thế"><input value={altText} onChange={e=>setAltText(e.target.value)}/></FormField><FormField label="Nguồn và quyền dùng tệp"><input value={rightsNote} onChange={e=>setRightsNote(e.target.value)} placeholder="Ghi căn cứ xác nhận, không suy đoán"/></FormField></div><label className="cms-sensitive-check"><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/><span>Đã xác nhận quyền sử dụng theo căn cứ trên</span></label><button type="submit" className="cms-btn cms-btn--primary" disabled={busy||!file||rights&&!rightsNote.trim()}>{busy?'Đang gửi tệp…':'Tải lên Backend'}</button></form></Surface>}
    <Surface title="Tệp đã lưu" description="Mở tệp qua endpoint CMS có xác thực, không tự công khai ảnh chưa duyệt."><div className="cms-table-tools"><select aria-label="Lọc loại tệp" value={category} onChange={e=>{setCategory(e.target.value);setPage(1);}}><option value="">Tất cả</option><option value="IMAGE">Hình ảnh</option><option value="DOCUMENT">Tài liệu PDF</option></select><input aria-label="Tìm tên tệp trong trang" placeholder="Tìm tệp trong trang hiện tại…" value={search} onChange={e=>setSearch(e.target.value)}/></div><DataState data={list} title="Chưa có tệp" empty="Không sử dụng hình ảnh mẫu khi chưa upload." icon="media"><div className="cms-media-gallery">{shown.map(x=><article className="cms-media-item" key={x.id}><div className="cms-media-thumb"><CmsIcon name={x.category==='DOCUMENT'?'book':'media'} size={34}/></div><div className="cms-media-item-info"><strong>{x.originalFilename}</strong><small>{x.category} · {Math.ceil((x.sizeBytes||0)/1024)} KB</small><small><Timestamp value={x.createdAt}/></small><p><Pill value={x.rightsConfirmed?'APPROVED':'DRAFT'}/> Quyền sử dụng: {x.rightsConfirmed?'đã xác nhận':'chưa xác nhận'}</p><div className="cms-media-item-actions"><a href={`/api/admin/media/${x.id}/download`} target="_blank" rel="noreferrer">Tải tệp</a>{can('media:write')&&<button type="button" onClick={()=>setSelected({...x})}>Sửa metadata</button>}{can('media:delete')&&<button type="button" className="cms-text-danger" onClick={()=>setDeleteId(x.id)}>Xóa</button>}</div></div></article>)}</div>{!shown.length&&<p className="cms-muted">Không có tệp phù hợp bộ lọc.</p>}<Pager page={page} setPage={setPage} limit={24} hasMore={list.data.length===24}/></DataState></Surface>
    {selected&&<div className="cms-dialog-layer" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><form className="cms-dialog cms-dialog--large" role="dialog" aria-modal="true" aria-labelledby="media-edit-title" onSubmit={patch}><h2 id="media-edit-title">Chỉnh quyền và mô tả</h2><p>{selected.originalFilename}</p><FormField label="Alt text"><input value={selected.altText||''} onChange={e=>setSelected(x=>({...x,altText:e.target.value}))}/></FormField><FormField label="Nguồn quyền dùng tệp"><textarea rows={3} value={selected.rightsNote||''} onChange={e=>setSelected(x=>({...x,rightsNote:e.target.value}))}/></FormField><label className="cms-sensitive-check"><input type="checkbox" checked={Boolean(selected.rightsConfirmed)} onChange={e=>setSelected(x=>({...x,rightsConfirmed:e.target.checked}))}/><span>Đã xác nhận quyền sử dụng</span></label><div className="cms-dialog-actions"><button type="button" onClick={()=>setSelected(null)} className="cms-btn cms-btn--secondary">Hủy</button><button className="cms-btn cms-btn--primary" disabled={busy||selected.rightsConfirmed&&!selected.rightsNote?.trim()}>Lưu</button></div></form></div>}
    <ConfirmDialog open={Boolean(deleteId)} danger busy={busy} title="Xóa tệp này?" description="Backend sẽ chặn việc xóa nếu tệp đã được gắn vào nội dung xuất bản." confirmText="Xóa tệp" onConfirm={remove} onClose={()=>setDeleteId(null)}/>
  </>;
}
const blankUser={email:'',displayName:'',role:'EDITOR',extraRoles:[],permissions:[],roleReason:'',permissionReason:'',password:''};
const permissionOptions=[
  {value:'CONTENT_PUBLISH',label:'Được xuất bản nội dung đã qua duyệt'},
  {value:'CONTENT_WITHDRAW',label:'Được thu hồi nội dung đã xuất bản'},
];
const sameValues=(a,b)=>JSON.stringify([...(a||[])].sort())===JSON.stringify([...(b||[])].sort());
export function Users(){
  const {can}=useSession(),{notice}=useNotices();
  const [search,setSearch]=useState(''),[selected,setSelected]=useState(null),[creating,setCreating]=useState(false);
  const [form,setForm]=useState({...blankUser,extraRoles:[],permissions:[]}),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false);
  const users=useAdminList('/users',{},can('users:read'));
  const filtered=useMemo(()=>users.data.filter(x=>(x.email+' '+x.displayName).toLowerCase().includes(search.toLowerCase())),[users.data,search]);
  const assignedRoles=[form.role,...(form.extraRoles||[])].filter((x,i,a)=>a.indexOf(x)===i);
  const originalRoles=selected?(selected.roles?.length?selected.roles:[selected.role]):[];
  const originalPermissions=selected?.permissions||[];
  const rolesChanged=Boolean(selected)&&!sameValues(assignedRoles,originalRoles);
  const permissionsChanged=Boolean(selected)&&!sameValues(form.permissions||[],originalPermissions);
  function open(x){
    const roles=x.roles?.length?x.roles:[x.role];
    setSelected(x);setCreating(false);
    setForm({email:x.email||'',displayName:x.displayName||'',role:x.role,extraRoles:roles.filter(role=>role!==x.role),permissions:x.permissions||[],roleReason:'',permissionReason:'',isActive:Boolean(x.isActive),password:''});
  }
  function newUser(){setCreating(true);setSelected(null);setForm({...blankUser,extraRoles:[],permissions:[]});}
  async function save(){
    if(!can('users:write'))return;
    const roles=[form.role,...(form.extraRoles||[])].filter((x,i,a)=>a.indexOf(x)===i);
    const payload=creating
      ? {email:form.email.trim(),displayName:form.displayName.trim(),role:form.role,password:form.password,
          ...(roles.length>1?{roles,roleReason:form.roleReason.trim()}:{}),
          ...(form.permissions?.length?{permissions:form.permissions,permissionReason:form.permissionReason.trim()}:{})}
      : {displayName:form.displayName.trim(),isActive:form.isActive,
          ...(rolesChanged?{role:form.role,roles,roleReason:form.roleReason.trim()}:{}),
          ...(permissionsChanged?{permissions:form.permissions,permissionReason:form.permissionReason.trim()}:{}),
          ...(form.password?{password:form.password}:{})};
    setBusy(true);
    try{
      const resource=creating?'/users':'/users/'+selected.id;
      await adminObject(resource,{method:creating?'POST':'PATCH',data:payload});
      notice(creating?'Đã tạo nhân sự nội bộ với vai trò được cấp.':'Backend đã cập nhật vai trò và quyền được ủy quyền.');
      users.retry();setCreating(false);setSelected(null);setConfirm(false);setForm({...blankUser,extraRoles:[],permissions:[]});
    }catch(e){notice(e.message,'error');}finally{setBusy(false);}
  }
  const editable=can('users:write');
  const roleReasonRequired=creating?assignedRoles.length>1:rolesChanged;
  const permissionReasonRequired=creating?(form.permissions||[]).length>0:permissionsChanged;
  const validReasons=(!roleReasonRequired||form.roleReason.trim().length>=3)&&(!permissionReasonRequired||form.permissionReason.trim().length>=3);
  return <><PageHeading kicker="TÀI KHOẢN / RBAC" title="Nhân sự tòa soạn" description="Tài khoản nội bộ do ADMIN tạo. Một người có thể kiêm nhiệm nhiều vai trò; quyền xuất bản bổ sung phải có lý do và được audit." icon="users" actions={editable?<button type="button" className="cms-btn cms-btn--primary" onClick={newUser}><CmsIcon name="plus"/> Thêm nhân sự</button>:null}/>
    <Surface title="Danh sách tài khoản" description="Backend kiểm soát vai trò, quyền bổ sung và chống khóa nhầm quản trị viên cuối cùng.">
      <label className="cms-search cms-collection-search"><CmsIcon name="search"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tên hoặc email…" aria-label="Tìm tài khoản"/></label>
      <DataState data={users} title="Chưa có nhân sự" empty="Chỉ tài khoản nội bộ thực tế từ API." icon="users">
        <TableWrap><thead><tr><th>Nhân sự</th><th>Vai trò và quyền</th><th>Trạng thái</th><th>Ngày tạo</th><th>Quản lý</th></tr></thead><tbody>{filtered.map(x=><tr key={x.id}>
          <td><div className="cms-person"><span>{x.displayName?.slice(0,1).toUpperCase()||'C'}</span><div><strong>{x.displayName}</strong><small>{x.email}</small></div></div></td>
          <td><div className="cms-role-tags">{(x.roles?.length?x.roles:[x.role]).map(role=><span className="cms-pill" key={role}>{ROLES[role]||role}</span>)}{(x.permissions||[]).map(permission=><span className="cms-pill cms-pill--orange" key={permission}>{permission==='CONTENT_PUBLISH'?'Quyền xuất bản':'Quyền thu hồi'}</span>)}</div></td>
          <td><Pill value={x.isActive?'ACTIVE':'INACTIVE'}/></td><td><Timestamp value={x.createdAt}/></td>
          <td>{editable&&<button type="button" className="cms-btn cms-btn--light cms-btn--small" onClick={()=>open(x)}>Sửa quyền</button>}</td>
        </tr>)}</tbody></TableWrap>
      </DataState>
    </Surface>
    {(creating||selected)&&<div className="cms-dialog-layer" onMouseDown={e=>{if(e.target===e.currentTarget){setCreating(false);setSelected(null);}}}>
      <form className="cms-dialog cms-dialog--large" role="dialog" aria-modal="true" aria-labelledby="cms-user-editor" onSubmit={e=>{e.preventDefault();if(validReasons)setConfirm(true);}}>
        <h2 id="cms-user-editor">{creating?'Tạo nhân sự nội bộ':'Thay đổi quyền tài khoản'}</h2>
        {creating&&<FormField label="Email"><input type="email" required value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></FormField>}
        <FormField label="Họ tên"><input minLength={2} maxLength={120} required value={form.displayName} onChange={e=>setForm(f=>({...f,displayName:e.target.value}))}/></FormField>
        <FormField label="Vai trò chính"><select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value,extraRoles:(f.extraRoles||[]).filter(role=>role!==e.target.value)}))}>{roleOptions.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></FormField>
        <div className="cms-field"><span className="cms-field-help">Vai trò kiêm nhiệm — chỉ cấp khi người này thực sự đảm nhiệm nhiều trách nhiệm.</span><div className="cms-stack-form">{roleOptions.filter(x=>x.value!==form.role).map(x=><label className="cms-sensitive-check" key={x.value}><input type="checkbox" checked={(form.extraRoles||[]).includes(x.value)} onChange={e=>setForm(f=>({...f,extraRoles:e.target.checked?[...(f.extraRoles||[]),x.value]:(f.extraRoles||[]).filter(role=>role!==x.value)}))}/><span>{x.label}</span></label>)}</div></div>
        {roleReasonRequired&&<FormField label="Lý do cấp/thay đổi vai trò"><textarea rows={2} minLength={3} maxLength={500} required value={form.roleReason} onChange={e=>setForm(f=>({...f,roleReason:e.target.value}))}/></FormField>}
        <div className="cms-field"><span className="cms-field-help">Quyền bổ sung — không tự phát sinh từ vai trò.</span><div className="cms-stack-form">{permissionOptions.map(x=><label className="cms-sensitive-check" key={x.value}><input type="checkbox" checked={(form.permissions||[]).includes(x.value)} onChange={e=>setForm(f=>({...f,permissions:e.target.checked?[...(f.permissions||[]),x.value]:(f.permissions||[]).filter(permission=>permission!==x.value)}))}/><span>{x.label}</span></label>)}</div></div>
        {permissionReasonRequired&&<FormField label="Lý do cấp/thu hồi quyền bổ sung"><textarea rows={2} minLength={3} maxLength={500} required value={form.permissionReason} onChange={e=>setForm(f=>({...f,permissionReason:e.target.value}))}/></FormField>}
        <FormField label={creating?'Mật khẩu khởi tạo (ít nhất 14 ký tự)':'Mật khẩu mới (để trống nếu giữ nguyên)'}><input type="password" autoComplete="new-password" minLength={14} maxLength={256} required={creating} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))}/></FormField>
        {!creating&&<label className="cms-sensitive-check"><input type="checkbox" checked={form.isActive} onChange={e=>setForm(f=>({...f,isActive:e.target.checked}))}/><span>Tài khoản đang hoạt động</span></label>}
        <SectionNote kind="warning">ADMIN chỉ quản trị hệ thống. Quyền duyệt kỹ thuật, chủ bút và xuất bản phải được cấp tường minh; người viết không được tự duyệt nội dung của mình.</SectionNote>
        <div className="cms-dialog-actions"><button type="button" className="cms-btn cms-btn--secondary" onClick={()=>{setCreating(false);setSelected(null);}}>Hủy</button><button type="submit" className="cms-btn cms-btn--primary" disabled={busy||!validReasons}>Xác nhận dữ liệu</button></div>
      </form>
    </div>}
    <ConfirmDialog open={confirm} busy={busy} title="Xác nhận thay đổi nhân sự?" description="Backend sẽ xác thực ADMIN, cập nhật vai trò và quyền, ghi lý do vào audit log và thu hồi phiên khi cần thiết." confirmText="Lưu tài khoản" onClose={()=>setConfirm(false)} onConfirm={save}/>
  </>;
}
export function Settings(){
  const {user,expiresAt,can}=useSession(),{notice}=useNotices();
  const [currentPassword,setCurrentPassword]=useState(''),[newPassword,setNewPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState(''),[busy,setBusy]=useState(false);
  async function change(e){e.preventDefault();if(newPassword!==confirmPassword){notice('Mật khẩu xác nhận chưa trùng.','error');return;}setBusy(true);try{await adminObject('/auth/password',{method:'POST',data:{currentPassword,newPassword}});notice('Backend đã thay đổi mật khẩu và thu hồi các phiên khác.');setCurrentPassword('');setNewPassword('');setConfirmPassword('');}catch(err){notice(err.message,'error');}finally{setBusy(false);}}
  return <><PageHeading kicker="CÀI ĐẶT / TÀI KHOẢN" title="Thiết lập tòa soạn" description="Quản lý bảo mật tài khoản thực tế. Quy tắc biên tập nằm ở Backend, không mở nút thay đổi trái phép." icon="settings"/>
    <div className="cms-dashboard-grid"><Surface title="Phiên đăng nhập" description="Thông tin xác nhận từ /api/admin/auth/session"><div className="cms-meta-stack"><p><strong>Tài khoản:</strong> {user?.displayName} · {user?.email}</p><p><strong>Vai trò:</strong> {ROLES[user?.role]||user?.role}</p><p><strong>Hết hạn phiên:</strong> <Timestamp value={expiresAt} withTime/></p><p><strong>Yêu cầu thay mật khẩu:</strong> {user?.mustChangePassword?'Có':'Không'}</p></div><SectionNote>Cookie phiên được đặt HttpOnly và SameSite=Strict tại máy chủ; trình duyệt không giữ token đăng nhập trong localStorage.</SectionNote></Surface><Surface title="Đổi mật khẩu" description="Thao tác gửi trực tiếp tới API auth/password; yêu cầu ít nhất 14 ký tự."><form className="cms-stack-form" onSubmit={change}><FormField label="Mật khẩu hiện tại"><input autoComplete="current-password" type="password" required value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></FormField><FormField label="Mật khẩu mới"><input autoComplete="new-password" minLength={14} maxLength={256} type="password" required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></FormField><FormField label="Nhập lại mật khẩu mới"><input autoComplete="new-password" minLength={14} maxLength={256} type="password" required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></FormField><button className="cms-btn cms-btn--primary" disabled={busy||!currentPassword||newPassword.length<14||newPassword!==confirmPassword}>{busy?'Đang cập nhật…':'Đổi mật khẩu an toàn'}</button></form></Surface></div>
    <Surface title="Cấu hình nghiệp vụ" description="Chỉ hiển thị nguyên tắc đã áp dụng bởi Backend."><SectionNote kind="warning">Backend chưa cung cấp endpoint PATCH /api/admin/settings. Vì vậy các chính sách duyệt kỹ thuật, chủ bút và riêng tư không có công tắc giả ở giao diện.</SectionNote><p>Vai trò biên tập, xét duyệt kỹ thuật và chủ bút tuân theo phân quyền do Backend thi hành. Cài đặt hạ tầng, môi trường và secret do đội vận hành quản lý ngoài website.</p></Surface>
  </>;
}
