import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminObject, adminRequest, uploadAdminImage } from '../api.js';
import { ROLES } from '../constants.js';
import { useAdminList } from '../hooks.js';
import { useNotices, useSession } from '../Session.jsx';
import { CmsIcon, ConfirmDialog, DataState, EmptyState, FormField, PageHeading, Pager, Pill, SectionNote, Surface, TableWrap, Timestamp } from '../ui.jsx';
const roleOptions=Object.entries(ROLES).map(([value,label])=>({value,label}));

export function Media(){
  const {can}=useSession(),{notice}=useNotices();
  const [params,setParams]=useSearchParams();
  const [page,setPage]=useState(1),[file,setFile]=useState(null),[altText,setAltText]=useState(''),[rightsNote,setRightsNote]=useState(''),[rights,setRights]=useState(false),[selected,setSelected]=useState(null),[deleteId,setDeleteId]=useState(null),[busy,setBusy]=useState(false);
  const category=params.get('category')||'',rightsFilter=params.get('rights')||'',search=params.get('search')||'';
  const list=useAdminList('/media',{page,limit:24,category:category||undefined,rights:['confirmed','unconfirmed'].includes(rightsFilter)?rightsFilter:undefined,search:search||undefined});
  const total=list.meta?.total;
  function setFilter(key,value){const next=new URLSearchParams(params);if(value)next.set(key,value);else next.delete(key);setParams(next);setPage(1);}
  async function upload(e){e.preventDefault();if(!file)return;setBusy(true);try{const item=await uploadAdminImage(file,{altText,rightsConfirmed:rights,rightsNote});notice(`Đã tải ${item.originalFilename||file.name} lên máy chủ.`);list.retry();setFile(null);setAltText('');setRights(false);setRightsNote('');}catch(error){notice(error.message,'error');}finally{setBusy(false);}}
  async function patch(e){e.preventDefault();if(!selected)return;setBusy(true);try{await adminObject(`/media/${selected.id}`,{method:'PATCH',data:{altText:selected.altText||null,rightsConfirmed:selected.rightsConfirmed,rightsNote:selected.rightsNote||null}});notice('Backend đã lưu metadata và quyền dùng tệp.');setSelected(null);list.retry();}catch(err){notice(err.message,'error');}finally{setBusy(false);}}
  async function remove(){if(!deleteId)return;setBusy(true);try{await adminRequest(`/media/${deleteId}`,{method:'DELETE'});notice('Tệp đã được lưu trạng thái xóa ở Backend.');setDeleteId(null);list.retry();}catch(err){notice(err.message,'error');}finally{setBusy(false);}}
  return <><PageHeading kicker="MEDIA / TÒA SOẠN" title="Media Library & Rights" description="Theo dõi nguồn, quyền sử dụng và nơi tệp đang được dùng trước khi công khai hoặc xóa." icon="media" actions={<button type="button" className="cms-btn cms-btn--secondary" onClick={list.retry}><CmsIcon name="refresh"/> Tải lại</button>}/>
    {can('media:upload')&&<Surface title="Tải tài nguyên" description="Tệp được lưu riêng trong CMS; xác nhận quyền chỉ khi có căn cứ."><form className="cms-stack-form" onSubmit={upload}><label className="cms-media-dropzone"><CmsIcon name="upload" size={28}/><strong>Chọn ảnh hoặc PDF có nguồn</strong><span>JPEG, PNG, WebP, PDF · mỗi tệp ≤ 10 MB</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/><small>{file?.name||'Chưa chọn tệp'}</small></label><div className="cms-form-two"><FormField label="Alt text / mô tả"><input value={altText} onChange={e=>setAltText(e.target.value)}/></FormField><FormField label="Nguồn và căn cứ quyền dùng"><input value={rightsNote} onChange={e=>setRightsNote(e.target.value)} placeholder="Ví dụ: ảnh do tác giả cung cấp, email xác nhận…"/></FormField></div><label className="cms-sensitive-check"><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/><span>Đã xác nhận quyền sử dụng theo căn cứ trên</span></label><button type="submit" className="cms-btn cms-btn--primary" disabled={busy||!file||rights&&!rightsNote.trim()}>{busy?'Đang gửi tệp…':'Tải lên Backend'}</button></form></Surface>}

    <Surface title="Kho tài nguyên" description="Bộ lọc chạy trên Backend; usage count giúp tránh xóa nhầm media đang dùng.">
      <div className="cms-table-tools">
        <select aria-label="Lọc loại tệp" value={category} onChange={e=>setFilter('category',e.target.value)}><option value="">Tất cả loại</option><option value="IMAGE">Hình ảnh</option><option value="DOCUMENT">Tài liệu PDF</option></select>
        <select aria-label="Lọc quyền sử dụng" value={rightsFilter} onChange={e=>setFilter('rights',e.target.value)}><option value="">Mọi trạng thái quyền</option><option value="unconfirmed">Chưa xác nhận quyền</option><option value="confirmed">Đã xác nhận quyền</option></select>
        <input aria-label="Tìm tệp" placeholder="Tên tệp / alt / căn cứ quyền…" value={search} onChange={e=>setFilter('search',e.target.value)}/>
      </div>
      <DataState data={list} title="Chưa có tệp" empty="Không sử dụng hình ảnh mẫu khi chưa upload." icon="media">
        <div className="cms-media-gallery">{list.data.map(x=>{const usage=(x.articleUsageCount||0)+(x.fieldNoteUsageCount||0)+(x.questionUsageCount||0);return <article className="cms-media-item" key={x.id}>
          <div className="cms-media-thumb">{x.category==='IMAGE'?<img src={`/api/admin/media/${x.id}/download`} alt={x.altText||x.originalFilename}/>:<CmsIcon name="book" size={34}/>}</div>
          <div className="cms-media-item-info"><strong>{x.originalFilename}</strong><small>{x.category} · {Math.ceil((x.sizeBytes||0)/1024)} KB · tải bởi {x.uploadedBy||'—'}</small><small><Timestamp value={x.createdAt}/></small>
            <p><Pill value={x.rightsConfirmed?'APPROVED':'DRAFT'}/> {x.rightsConfirmed?'Đã xác nhận quyền':'Chưa xác nhận quyền'}</p>
            {x.rightsNote&&<p className="cms-field-help">{x.rightsNote}</p>}
            <div className="cms-media-usage"><span>Bài viết: {x.articleUsageCount||0}</span><span>Hiện trường: {x.fieldNoteUsageCount||0}</span><span>Q&A: {x.questionUsageCount||0}</span></div>
            {x.usedPublicly&&<SectionNote kind="warning">Tệp đang được nội dung public sử dụng — Backend sẽ chặn xóa.</SectionNote>}
            {!x.rightsConfirmed&&usage>0&&<SectionNote kind="warning">Tệp đã được liên kết nhưng chưa xác nhận quyền. Nội dung liên quan không nên gửi duyệt/xuất bản.</SectionNote>}
            <div className="cms-media-item-actions"><a href={`/api/admin/media/${x.id}/download`} target="_blank" rel="noreferrer">Mở tệp</a>{can('media:write')&&<button type="button" onClick={()=>setSelected({...x})}>Sửa quyền / metadata</button>}{can('media:delete')&&<button type="button" disabled={x.usedPublicly} className="cms-text-danger" onClick={()=>setDeleteId(x.id)}>Xóa</button>}</div>
          </div>
        </article>})}</div>
        <Pager page={page} setPage={setPage} limit={24} total={total}/>
      </DataState>
    </Surface>

    {selected&&<div className="cms-dialog-layer" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><form className="cms-dialog cms-dialog--large" role="dialog" aria-modal="true" aria-labelledby="media-edit-title" onSubmit={patch}><h2 id="media-edit-title">Quyền sử dụng & metadata</h2><p>{selected.originalFilename}</p><FormField label="Alt text"><input value={selected.altText||''} onChange={e=>setSelected(x=>({...x,altText:e.target.value}))}/></FormField><FormField label="Nguồn / căn cứ quyền dùng"><textarea rows={4} value={selected.rightsNote||''} onChange={e=>setSelected(x=>({...x,rightsNote:e.target.value}))}/></FormField><label className="cms-sensitive-check"><input type="checkbox" checked={Boolean(selected.rightsConfirmed)} onChange={e=>setSelected(x=>({...x,rightsConfirmed:e.target.checked}))}/><span>Đã xác nhận quyền sử dụng</span></label>{selected.rightsConfirmed&&!selected.rightsNote?.trim()&&<SectionNote kind="warning">Không thể xác nhận quyền nếu chưa ghi căn cứ.</SectionNote>}<div className="cms-dialog-actions"><button type="button" onClick={()=>setSelected(null)} className="cms-btn cms-btn--secondary">Hủy</button><button className="cms-btn cms-btn--primary" disabled={busy||selected.rightsConfirmed&&!selected.rightsNote?.trim()}>Lưu metadata</button></div></form></div>}
    <ConfirmDialog open={Boolean(deleteId)} danger busy={busy} title="Xóa tệp này?" description="Backend sẽ kiểm tra lại mọi liên kết public, bao gồm bài viết, hiện trường và Q&A." confirmText="Xóa tệp" onConfirm={remove} onClose={()=>setDeleteId(null)}/>
  </>;
}
const blankUser={email:'',displayName:'',role:'EDITOR',extraRoles:[],permissions:[],personId:'',roleReason:'',identityReason:'',permissionReason:'',password:'',isActive:true};
const permissionOptions=[
  {value:'CONTENT_PUBLISH',label:'Được xuất bản nội dung đã qua duyệt'},
  {value:'CONTENT_WITHDRAW',label:'Được thu hồi nội dung đã xuất bản'},
];
const sameValues=(a,b)=>JSON.stringify([...(a||[])].sort())===JSON.stringify([...(b||[])].sort());

export function Users(){
  const {can,user}=useSession(),{notice}=useNotices();
  const [search,setSearch]=useState(''),[selected,setSelected]=useState(null),[creating,setCreating]=useState(false);
  const [form,setForm]=useState({...blankUser,extraRoles:[],permissions:[]}),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[revokeTarget,setRevokeTarget]=useState(null);
  const users=useAdminList('/users',{},can('users:read'));
  const filtered=useMemo(()=>users.data.filter(x=>(x.email+' '+x.displayName+' '+(x.personId||'')).toLowerCase().includes(search.toLowerCase())),[users.data,search]);
  const identities=useMemo(()=>{
    const map=new Map();
    for(const item of users.data){
      if(!item.personId)continue;
      if(!map.has(item.personId))map.set(item.personId,{personId:item.personId,people:[]});
      map.get(item.personId).people.push(item);
    }
    return [...map.values()];
  },[users.data]);
  const assignedRoles=[form.role,...(form.extraRoles||[])].filter((x,i,a)=>a.indexOf(x)===i);
  const originalRoles=selected?(selected.roles?.length?selected.roles:[selected.role]):[];
  const originalPermissions=selected?.permissions||[];
  const primaryRoleChanged=Boolean(selected)&&form.role!==selected.role;
  const rolesChanged=Boolean(selected)&&(primaryRoleChanged||!sameValues(assignedRoles,originalRoles));
  const permissionsChanged=Boolean(selected)&&!sameValues(form.permissions||[],originalPermissions);
  const identityChanged=Boolean(selected)&&Boolean(form.personId)&&form.personId!==selected.personId;
  const identityReasonRequired=creating?Boolean(form.personId):identityChanged;
  const identityPeers=form.personId?users.data.filter(x=>x.personId===form.personId&&x.id!==selected?.id):[];

  function open(x){
    const roles=x.roles?.length?x.roles:[x.role];
    setSelected(x);setCreating(false);setConfirm(false);
    setForm({email:x.email||'',displayName:x.displayName||'',role:x.role,extraRoles:roles.filter(role=>role!==x.role),permissions:x.permissions||[],personId:x.personId||'',roleReason:'',identityReason:'',permissionReason:'',isActive:Boolean(x.isActive),password:''});
  }
  function newUser(){setCreating(true);setSelected(null);setConfirm(false);setForm({...blankUser,extraRoles:[],permissions:[]});}
  async function save(){
    if(!can('users:write'))return;
    const roles=[form.role,...(form.extraRoles||[])].filter((x,i,a)=>a.indexOf(x)===i);
    const payload=creating
      ? {email:form.email.trim(),displayName:form.displayName.trim(),role:form.role,password:form.password,
          ...(roles.length>1?{roles,roleReason:form.roleReason.trim()}:{}),
          ...(form.personId?{personId:form.personId,identityReason:form.identityReason.trim()}:{}),
          ...(form.permissions?.length?{permissions:form.permissions,permissionReason:form.permissionReason.trim()}:{})}
      : {displayName:form.displayName.trim(),isActive:form.isActive,
          ...(rolesChanged?{role:form.role,roles,roleReason:form.roleReason.trim()}:{}),
          ...(identityChanged?{personId:form.personId,identityReason:form.identityReason.trim()}:{}),
          ...(permissionsChanged?{permissions:form.permissions,permissionReason:form.permissionReason.trim()}:{}),
          ...(form.password?{password:form.password}:{})};
    setBusy(true);
    try{
      const resource=creating?'/users':'/users/'+selected.id;
      await adminObject(resource,{method:creating?'POST':'PATCH',data:payload});
      notice(creating?'Đã tạo nhân sự nội bộ với vai trò được cấp.':'Backend đã cập nhật tài khoản, vai trò và quyền được ủy quyền.');
      users.retry();setCreating(false);setSelected(null);setConfirm(false);setForm({...blankUser,extraRoles:[],permissions:[]});
    }catch(e){notice(e.message,'error');}finally{setBusy(false);}
  }
  async function revokeSessions(){
    if(!revokeTarget||revokeTarget.id===user?.id)return;
    setBusy(true);
    try{
      const result=await adminObject('/users/'+revokeTarget.id+'/revoke-sessions',{method:'POST',data:{}});
      notice(`Đã thu hồi ${result.revokedSessions||0} phiên đăng nhập của ${revokeTarget.displayName}.`);
      setRevokeTarget(null);users.retry();
    }catch(e){notice(e.message,'error');}finally{setBusy(false);}
  }

  const editable=can('users:write');
  const roleReasonRequired=creating?assignedRoles.length>1:rolesChanged;
  const permissionReasonRequired=creating?(form.permissions||[]).length>0:permissionsChanged;
  const validReasons=(!roleReasonRequired||form.roleReason.trim().length>=3)&&(!identityReasonRequired||form.identityReason.trim().length>=3)&&(!permissionReasonRequired||form.permissionReason.trim().length>=3);

  return <><PageHeading kicker="TÀI KHOẢN / RBAC" title="Nhân sự tòa soạn" description="Quản lý tài khoản, person identity, vai trò kiêm nhiệm, quyền bổ sung và phiên đăng nhập. Mọi thay đổi nhạy cảm đều được Backend audit." icon="users" actions={editable?<button type="button" className="cms-btn cms-btn--primary" onClick={newUser}><CmsIcon name="plus"/> Thêm nhân sự</button>:null}/>
    <Surface title="Danh sách tài khoản" description="Person ID là ranh giới chống tự duyệt: nhiều tài khoản cùng personId vẫn được coi là cùng một người.">
      <label className="cms-search cms-collection-search"><CmsIcon name="search"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tên, email hoặc personId…" aria-label="Tìm tài khoản"/></label>
      <DataState data={users} title="Chưa có nhân sự" empty="Chỉ tài khoản nội bộ thực tế từ API." icon="users">
        <TableWrap><thead><tr><th>Nhân sự</th><th>Vai trò và quyền</th><th>Danh tính</th><th>Phiên / đăng nhập</th><th>Trạng thái</th><th>Quản lý</th></tr></thead><tbody>{filtered.map(x=><tr key={x.id}>
          <td><div className="cms-person"><span>{x.displayName?.slice(0,1).toUpperCase()||'C'}</span><div><strong>{x.displayName}</strong><small>{x.email}</small><small>Tạo <Timestamp value={x.createdAt}/></small></div></div></td>
          <td><div className="cms-role-tags">{(x.roles?.length?x.roles:[x.role]).map(role=><span className="cms-pill" key={role}>{ROLES[role]||role}</span>)}{(x.permissions||[]).map(permission=><span className="cms-pill cms-pill--orange" key={permission}>{permission==='CONTENT_PUBLISH'?'Quyền xuất bản':'Quyền thu hồi'}</span>)}</div></td>
          <td><code className="cms-identity-code">{x.personId?.slice(0,8)||'—'}</code>{users.data.filter(peer=>peer.personId&&peer.personId===x.personId).length>1&&<small className="cms-field-help">Có tài khoản khác cùng danh tính</small>}</td>
          <td><strong>{x.activeSessionCount||0} phiên</strong><small>{x.lastLoginAt?<><br/>Lần cuối <Timestamp value={x.lastLoginAt} withTime/></>:' · Chưa đăng nhập'}</small>{x.mustChangePassword&&<p><span className="cms-pill cms-pill--orange">Phải đổi mật khẩu</span></p>}</td>
          <td><Pill value={x.isActive?'ACTIVE':'INACTIVE'}/></td>
          <td>{editable&&<div className="cms-btn-row"><button type="button" className="cms-btn cms-btn--light cms-btn--small" onClick={()=>open(x)}>Sửa</button><button type="button" className="cms-btn cms-btn--light cms-btn--small" disabled={!x.activeSessionCount||x.id===user?.id} onClick={()=>setRevokeTarget(x)}>Thu hồi phiên</button></div>}</td>
        </tr>)}</tbody></TableWrap>
      </DataState>
    </Surface>

    {(creating||selected)&&<div className="cms-dialog-layer" onMouseDown={e=>{if(e.target===e.currentTarget){setCreating(false);setSelected(null);}}}>
      <form className="cms-dialog cms-dialog--large" role="dialog" aria-modal="true" aria-labelledby="cms-user-editor" onSubmit={e=>{e.preventDefault();if(validReasons)setConfirm(true);}}>
        <h2 id="cms-user-editor">{creating?'Tạo nhân sự nội bộ':'Quản trị tài khoản & quyền'}</h2>
        {creating&&<FormField label="Email"><input type="email" required value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></FormField>}
        <FormField label="Họ tên"><input minLength={2} maxLength={120} required value={form.displayName} onChange={e=>setForm(f=>({...f,displayName:e.target.value}))}/></FormField>

        <FormField label="Danh tính nhân sự (personId)">
          <select value={form.personId} onChange={e=>setForm(f=>({...f,personId:e.target.value}))}>
            {creating&&<option value="">Tạo personId mới riêng cho tài khoản này</option>}
            {!creating&&form.personId&&!identities.some(x=>x.personId===form.personId)&&<option value={form.personId}>{form.personId}</option>}
            {identities.map(identity=><option key={identity.personId} value={identity.personId}>{identity.people.map(x=>x.displayName).join(' / ')} · {identity.personId.slice(0,8)}</option>)}
          </select>
          <span className="cms-field-help">Chỉ chọn personId của người khác khi đây thật sự là tài khoản thứ hai của cùng một con người. Backend dùng personId để chặn tự duyệt.</span>
        </FormField>
        {identityPeers.length>0&&<SectionNote kind="warning">Danh tính này đang được dùng bởi: {identityPeers.map(x=>x.displayName+' ('+x.email+')').join(', ')}.</SectionNote>}
        {identityReasonRequired&&<FormField label="Lý do liên kết/thay đổi danh tính"><textarea rows={2} minLength={3} maxLength={500} required value={form.identityReason} onChange={e=>setForm(f=>({...f,identityReason:e.target.value}))}/></FormField>}

        <FormField label="Vai trò chính"><select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value,extraRoles:(f.extraRoles||[]).filter(role=>role!==e.target.value)}))}>{roleOptions.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></FormField>
        <div className="cms-field"><span className="cms-field-help">Vai trò kiêm nhiệm — chỉ cấp khi người này thực sự đảm nhiệm nhiều trách nhiệm.</span><div className="cms-stack-form">{roleOptions.filter(x=>x.value!==form.role).map(x=><label className="cms-sensitive-check" key={x.value}><input type="checkbox" checked={(form.extraRoles||[]).includes(x.value)} onChange={e=>setForm(f=>({...f,extraRoles:e.target.checked?[...(f.extraRoles||[]),x.value]:(f.extraRoles||[]).filter(role=>role!==x.value)}))}/><span>{x.label}</span></label>)}</div></div>
        {roleReasonRequired&&<FormField label="Lý do cấp/thay đổi vai trò"><textarea rows={2} minLength={3} maxLength={500} required value={form.roleReason} onChange={e=>setForm(f=>({...f,roleReason:e.target.value}))}/></FormField>}

        <div className="cms-field"><span className="cms-field-help">Quyền bổ sung — không tự phát sinh từ vai trò.</span><div className="cms-stack-form">{permissionOptions.map(x=><label className="cms-sensitive-check" key={x.value}><input type="checkbox" checked={(form.permissions||[]).includes(x.value)} onChange={e=>setForm(f=>({...f,permissions:e.target.checked?[...(f.permissions||[]),x.value]:(f.permissions||[]).filter(permission=>permission!==x.value)}))}/><span>{x.label}</span></label>)}</div></div>
        {permissionReasonRequired&&<FormField label="Lý do cấp/thu hồi quyền bổ sung"><textarea rows={2} minLength={3} maxLength={500} required value={form.permissionReason} onChange={e=>setForm(f=>({...f,permissionReason:e.target.value}))}/></FormField>}

        {!creating&&selected?.roleAssignments?.length>0&&<details className="cms-assignment-history"><summary>Lịch sử nguồn cấp vai trò</summary>{selected.roleAssignments.map(item=><p key={item.role}><strong>{ROLES[item.role]||item.role}</strong> · {item.grantSource}{item.legacyCompat?' · legacy':''}<br/><small>{item.grantReason} · {item.grantedBy||'Hệ thống'} · <Timestamp value={item.grantedAt}/></small></p>)}</details>}
        {!creating&&selected?.permissionAssignments?.length>0&&<details className="cms-assignment-history"><summary>Lịch sử quyền bổ sung</summary>{selected.permissionAssignments.map(item=><p key={item.permission}><strong>{item.permission}</strong><br/><small>{item.grantReason} · {item.grantedBy||'Hệ thống'} · <Timestamp value={item.grantedAt}/></small></p>)}</details>}

        <FormField label={creating?'Mật khẩu khởi tạo (ít nhất 14 ký tự)':'Đặt lại mật khẩu (để trống nếu giữ nguyên)'}><input type="password" autoComplete="new-password" minLength={14} maxLength={256} required={creating} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))}/></FormField>
        {!creating&&<label className="cms-sensitive-check"><input type="checkbox" checked={form.isActive} onChange={e=>setForm(f=>({...f,isActive:e.target.checked}))}/><span>Tài khoản đang hoạt động</span></label>}
        <SectionNote kind="warning">ADMIN chỉ quản trị hệ thống. Quyền duyệt kỹ thuật, Chủ bút và xuất bản phải được cấp tường minh; mọi tài khoản cùng personId được coi là cùng một người khi kiểm tra tự duyệt.</SectionNote>
        <div className="cms-dialog-actions"><button type="button" className="cms-btn cms-btn--secondary" onClick={()=>{setCreating(false);setSelected(null);}}>Hủy</button><button type="submit" className="cms-btn cms-btn--primary" disabled={busy||!validReasons}>Xác nhận dữ liệu</button></div>
      </form>
    </div>}

    <ConfirmDialog open={confirm} busy={busy} title="Xác nhận thay đổi nhân sự?" description="Backend sẽ xác thực ADMIN, cập nhật person identity, vai trò/quyền, ghi lý do vào audit log và thu hồi phiên khi cần." confirmText="Lưu tài khoản" onClose={()=>setConfirm(false)} onConfirm={save}/>
    <ConfirmDialog open={Boolean(revokeTarget)} busy={busy} danger title="Thu hồi toàn bộ phiên?" description={revokeTarget?`Tài khoản ${revokeTarget.displayName} sẽ phải đăng nhập lại trên mọi thiết bị. Thao tác được ghi Audit History.`:''} confirmText="Thu hồi phiên" onClose={()=>setRevokeTarget(null)} onConfirm={revokeSessions}/>
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
