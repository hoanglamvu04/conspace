import { useMemo, useState } from 'react';
import { adminObject } from '../api.js';
import { useAdminList } from '../hooks.js';
import { slugify } from '../constants.js';
import { useNotices, useSession } from '../Session.jsx';
import { CmsIcon, ConfirmDialog, DataState, EmptyState, FormField, PageHeading, Pill, SectionNote, Surface, Timestamp } from '../ui.jsx';

const empty={displayName:'',slug:'',bio:'',active:true,verified:false};

export default function Authors(){
  const {can}=useSession();
  const {notice}=useNotices();
  const authors=useAdminList('/authors',{},can('authors:read'));
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState(null);
  const [creating,setCreating]=useState(false);
  const [form,setForm]=useState({...empty});
  const [busy,setBusy]=useState(false);
  const [confirmDeactivate,setConfirmDeactivate]=useState(false);

  const filtered=useMemo(()=>{
    const text=query.trim().toLowerCase();
    if(!text)return authors.data;
    return authors.data.filter(item=>`${item.displayName} ${item.slug} ${item.accountEmail||''}`.toLowerCase().includes(text));
  },[authors.data,query]);

  function open(item){
    setCreating(false);
    setSelected(item.id);
    setConfirmDeactivate(false);
    setForm({
      displayName:item.displayName||'',
      slug:item.slug||'',
      bio:item.bio||'',
      active:Boolean(item.active),
      verified:Boolean(item.verified),
    });
  }

  function startCreate(){
    setCreating(true);
    setSelected(null);
    setConfirmDeactivate(false);
    setForm({...empty});
  }

  function change(key,value){
    setForm(current=>({...current,[key]:value}));
  }

  async function save(event){
    event.preventDefault();
    const canWrite=can('authors:write');
    const canVerify=can('authors:verify');
    if(!creating&&!selected)return;
    if(creating&&!can('authors:create'))return;
    const data={};
    if(creating||canWrite){
      if(!form.displayName.trim()){notice('Cần tên hiển thị tác giả.','error');return;}
      const slug=slugify(form.slug||form.displayName);
      if(!slug){notice('Slug tác giả không hợp lệ.','error');return;}
      data.displayName=form.displayName.trim();
      data.slug=slug;
      data.bio=form.bio.trim()||null;
      if(!creating)data.active=Boolean(form.active);
    }
    if(!creating&&canVerify)data.verified=Boolean(form.verified);
    if(!Object.keys(data).length)return;

    setBusy(true);
    try{
      const saved=await adminObject(creating?'/authors':`/authors/${selected}`,{
        method:creating?'POST':'PATCH',
        data,
      });
      notice(creating?'Đã tạo hồ sơ tác giả.':'Đã cập nhật hồ sơ tác giả.');
      setCreating(false);
      setSelected(saved.id||selected);
      setForm(current=>({...current,...saved,bio:saved.bio??current.bio}));
      authors.retry();
    }catch(error){
      notice(error.message,'error');
    }finally{
      setBusy(false);
    }
  }

  async function deactivate(){
    if(!selected||!can('authors:write'))return;
    setBusy(true);
    try{
      await adminObject('/authors/'+selected,{method:'DELETE'});
      notice('Đã vô hiệu hồ sơ tác giả.');
      setConfirmDeactivate(false);
      setForm(current=>({...current,active:false,verified:false}));
      authors.retry();
    }catch(error){
      notice(error.message,'error');
    }finally{
      setBusy(false);
    }
  }

  const selectedRecord=authors.data.find(item=>item.id===selected)||null;
  const profileEditable=creating?can('authors:create'):can('authors:write');
  const verifyEditable=!creating&&can('authors:verify');

  return <>
    <PageHeading
      kicker="BIÊN TẬP / TÁC GIẢ"
      title="Hồ sơ tác giả"
      description="Quản lý tên hiển thị, bio, trạng thái hoạt động và xác minh tác giả. Hồ sơ tác giả tách biệt với tài khoản đăng nhập CMS."
      icon="users"
      actions={can('authors:create')?<button type="button" className="cms-btn cms-btn--primary" onClick={startCreate}><CmsIcon name="plus"/> Tác giả mới</button>:null}
    />

    <SectionNote>
      ADMIN chỉ kiểm soát trạng thái xác minh. Editor/Chief quản lý nội dung hồ sơ tác giả; việc xác minh không trao thêm quyền CMS.
    </SectionNote>

    <div className="cms-two-pane">
      <Surface className="cms-list-pane" title="Danh sách tác giả" description="Bao gồm hồ sơ liên kết tài khoản CMS và tác giả biên tập độc lập.">
        <label className="cms-search"><CmsIcon name="search"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Tìm tên, slug hoặc email…" aria-label="Tìm tác giả"/></label>
        <DataState data={authors} title="Chưa có tác giả" empty="Tác giả được tạo khi biên tập nội dung hoặc từ màn hình này." icon="users">
          {filtered.length?<div className="cms-work-list">{filtered.map(item=><button type="button" key={item.id} className={`cms-work-list-row ${selected===item.id?'is-selected':''}`} onClick={()=>open(item)}>
            <span className="cms-work-list-icon"><CmsIcon name="users"/></span>
            <div>
              <strong>{item.displayName}</strong>
              <small>{item.slug}{item.accountEmail?' · '+item.accountEmail:''}</small>
              <small>{item.articleCount||0} bài · {item.publishedCount||0} đã xuất bản</small>
            </div>
            <span>{item.verified?<Pill value="APPROVED"/>:<Pill value={item.active?'ACTIVE':'ARCHIVED'}/>}</span>
          </button>)}</div>:<EmptyState title="Không có tác giả phù hợp" description="Thử từ khóa khác." icon="users"/>}
        </DataState>
      </Surface>

      <Surface className="cms-editor-side" title={creating?'Tạo hồ sơ tác giả':'Chi tiết tác giả'} description="Dữ liệu lưu trực tiếp qua Author API.">
        {!(creating||selected)?<EmptyState title="Chọn một tác giả" description="Xem hồ sơ, số bài và trạng thái xác minh." icon="users"/>
          :<form className="cms-stack-form" onSubmit={save}>
            {selectedRecord?.userId&&<SectionNote>Hồ sơ này đang liên kết với tài khoản CMS: {selectedRecord.accountEmail||selectedRecord.userId}. Không đổi liên kết tài khoản tại đây.</SectionNote>}
            <FormField label="Tên hiển thị" required><input disabled={!profileEditable} maxLength={160} value={form.displayName} onChange={event=>{const value=event.target.value;setForm(current=>({...current,displayName:value,slug:creating?slugify(value):current.slug}));}}/></FormField>
            <FormField label="Slug" required help="Dùng cho định danh tác giả, không phải quyền đăng nhập."><input disabled={!profileEditable} maxLength={120} value={form.slug} onChange={event=>change('slug',slugify(event.target.value))}/></FormField>
            <FormField label="Bio"><textarea disabled={!profileEditable} rows={8} maxLength={5000} value={form.bio} onChange={event=>change('bio',event.target.value)} placeholder="Mô tả ngắn về vai trò/chuyên môn đã được xác minh…"/></FormField>

            {!creating&&<div className="cms-form-two">
              <label className="cms-sensitive-check"><input type="checkbox" disabled={!profileEditable} checked={form.active} onChange={event=>change('active',event.target.checked)}/><span><strong>Đang hoạt động</strong><small>Hồ sơ inactive không nên được chọn cho bài mới.</small></span></label>
              <label className="cms-sensitive-check"><input type="checkbox" disabled={!verifyEditable} checked={form.verified} onChange={event=>change('verified',event.target.checked)}/><span><strong>Đã xác minh</strong><small>Chỉ ADMIN có thể thay đổi trạng thái này.</small></span></label>
            </div>}

            {selectedRecord&&<div className="cms-question-quote">
              <span>THỐNG KÊ HỒ SƠ</span>
              <p>{selectedRecord.articleCount||0} bài liên kết · {selectedRecord.publishedCount||0} bài đã xuất bản</p>
              <small>Tạo: <Timestamp value={selectedRecord.createdAt}/> · cập nhật: <Timestamp value={selectedRecord.updatedAt}/></small>
            </div>}

            <div className="cms-btn-row">
              {(creating?can('authors:create'):(can('authors:write')||can('authors:verify')))&&<button type="submit" className="cms-btn cms-btn--primary" disabled={busy}>{busy?'Đang lưu…':creating?'Tạo tác giả':'Lưu thay đổi'}</button>}
              {!creating&&form.active&&can('authors:write')&&<button type="button" className="cms-btn cms-btn--danger-soft" disabled={busy} onClick={()=>setConfirmDeactivate(true)}>Vô hiệu tác giả</button>}
            </div>
          </form>}
      </Surface>
    </div>

    <ConfirmDialog open={confirmDeactivate} danger busy={busy} title="Vô hiệu hồ sơ tác giả?" description="Hồ sơ không bị xóa khỏi lịch sử bài viết. Trạng thái active và verified sẽ được tắt." confirmText="Vô hiệu tác giả" onClose={()=>setConfirmDeactivate(false)} onConfirm={deactivate}/>
  </>;
}
