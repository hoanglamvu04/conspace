import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useNiches } from '../hooks/useResources.js';
import { postJson } from '../lib/api.js';
import { Breadcrumbs, PageIntro } from '../components/UI.jsx';
import { Icon } from '../components/Icons.jsx';

const TYPES=Object.freeze({
  'du-an':{
    api:'project',icon:'home',eyebrow:'KẾT NỐI / DỰ ÁN',
    title:'Tôi có một dự án cần trao đổi',
    description:'Gửi nhu cầu riêng tư để đội ngũ tiếp nhận và phân loại thủ công. CONSPACE không công khai nhu cầu và không mở đấu thầu.',
  },
  'kien-truc-su':{
    api:'architect',icon:'draft',eyebrow:'KẾT NỐI / KIẾN TRÚC SƯ',
    title:'Tôi muốn kết nối về kiến trúc',
    description:'Mô tả nhu cầu và phạm vi bạn đang tìm kiếm. Yêu cầu được xử lý riêng tư, không tạo bảng xếp hạng hay hồ sơ quảng cáo.',
  },
  'nha-thau':{
    api:'contractor',icon:'hardhat',eyebrow:'KẾT NỐI / NHÀ THẦU',
    title:'Tôi muốn kết nối về thi công',
    description:'Gửi tình huống hoặc nhu cầu thi công để nhân sự phụ trách phân loại thủ công. Không có cơ chế chào giá công khai trên website.',
  },
  'tham-gia':{
    api:'join',icon:'users',eyebrow:'KẾT NỐI / THAM GIA',
    title:'Tôi muốn tham gia cùng CONSPACE',
    description:'Dành cho người muốn đóng góp chuyên môn, tư liệu hoặc tham gia hoạt động nội dung. Mọi trao đổi ban đầu được giữ riêng tư.',
  },
});

const TYPE_LINKS=[
  ['du-an','Dự án'],
  ['kien-truc-su','Kiến trúc sư'],
  ['nha-thau','Nhà thầu'],
  ['tham-gia','Tham gia'],
];

export function ConnectionLanding(){
  return <>
    <PageIntro eyebrow="CONSPACE / KẾT NỐI RIÊNG TƯ" title="Bạn muốn kết nối về điều gì?" description="Đây là kênh tiếp nhận riêng tư và xử lý thủ công. Không có nhu cầu nào được đăng công khai, không đấu giá, không xếp hạng nhà thầu hay kiến trúc sư."/>
    <main className="container content-page">
      <Breadcrumbs items={[{label:'Kết nối'}]}/>
      <div className="connection-choice-grid">
        {TYPE_LINKS.map(([slug,label],index)=>{
          const item=TYPES[slug];
          return <Link className="connection-choice-card" to={'/ket-noi/'+slug} key={slug}>
            <span className="connection-choice-index">{String(index+1).padStart(2,'0')}</span>
            <span className="connection-choice-icon"><Icon name={item.icon} size={28}/></span>
            <strong>{label}</strong>
            <p>{item.description}</p>
            <span className="text-link">Mở biểu mẫu <Icon name="arrow" size={16}/></span>
          </Link>;
        })}
      </div>
      <div className="section-inline-note"><Icon name="shield" size={20}/><p>Thông tin liên hệ được gửi vào hệ thống nội bộ và mã hóa trước khi lưu. Website không có danh sách nhu cầu công khai.</p></div>
    </main>
  </>;
}

export function ConnectionForm(){
  const {type}=useParams();
  const config=TYPES[type];
  const niches=useNiches();
  const [description,setDescription]=useState('');
  const [region,setRegion]=useState('');
  const [nicheId,setNicheId]=useState('');
  const [contact,setContact]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState(null);
  const nicheOptions=useMemo(()=>niches.status==='success'?niches.data:[],[niches.status,niches.data]);

  if(!config) return <main className="container content-page"><Breadcrumbs items={[{label:'Kết nối',to:'/ket-noi'},{label:'Không hợp lệ'}]}/><div className="state-panel" role="status"><h3>Loại kết nối không tồn tại</h3><p>Chọn một biểu mẫu từ trang Kết nối.</p><Link className="button button--primary" to="/ket-noi">Về Kết nối</Link></div></main>;

  async function submit(event){
    event.preventDefault();
    setError('');
    setSuccess(null);
    if(description.trim().length<20){setError('Vui lòng mô tả ít nhất 20 ký tự để người tiếp nhận hiểu đúng nhu cầu.');return;}
    if(contact.trim().length<6){setError('Vui lòng để lại một cách liên hệ hợp lệ.');return;}
    setBusy(true);
    try{
      const result=await postJson('/connections',{
        type:config.api,
        description:description.trim(),
        region:region.trim()||null,
        nicheId:nicheId||null,
        contact:contact.trim(),
      });
      setSuccess(result.data);
      setDescription('');setRegion('');setNicheId('');setContact('');
    }catch(requestError){
      setError(requestError.message||'Chưa thể gửi yêu cầu kết nối.');
    }finally{
      setBusy(false);
    }
  }

  return <>
    <PageIntro eyebrow={config.eyebrow} title={config.title} description={config.description}/>
    <main className="container content-page">
      <Breadcrumbs items={[{label:'Kết nối',to:'/ket-noi'},{label:TYPE_LINKS.find(([slug])=>slug===type)?.[1]||'Biểu mẫu'}]}/>
      {success?<div className="connection-success" role="status">
        <span className="connection-success-icon"><Icon name="check" size={30}/></span>
        <h2>Đã tiếp nhận riêng tư</h2>
        <p>{success.message}</p>
        <small>Mã tiếp nhận: {success.id}</small>
        <div className="connection-success-actions"><Link className="button button--primary" to="/">Về trang chủ</Link><button type="button" className="button button--outline" onClick={()=>setSuccess(null)}>Gửi yêu cầu khác</button></div>
      </div>:<div className="connection-form-layout">
        <form className="connection-form" onSubmit={submit}>
          <label htmlFor="connection-description">Bạn cần trao đổi điều gì? <span aria-hidden="true">*</span></label>
          <textarea id="connection-description" rows={8} minLength={20} maxLength={5000} required value={description} onChange={e=>setDescription(e.target.value)} placeholder="Mô tả bối cảnh, nhu cầu và điều bạn muốn được kết nối..."/>
          <div className="public-form-meta"><span>Tối thiểu 20 · tối đa 5.000 ký tự</span><span>{description.length.toLocaleString('vi-VN')} / 5.000</span></div>

          <div className="connection-form-two">
            <div><label htmlFor="connection-region">Khu vực (không bắt buộc)</label><input id="connection-region" maxLength={160} value={region} onChange={e=>setRegion(e.target.value)} placeholder="Ví dụ: Hà Nội"/></div>
            <div><label htmlFor="connection-niche">Mảng / ngách liên quan</label><select id="connection-niche" value={nicheId} onChange={e=>setNicheId(e.target.value)}><option value="">Chưa xác định</option>{nicheOptions.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          </div>

          <label htmlFor="connection-contact">Cách liên hệ riêng <span aria-hidden="true">*</span></label>
          <input id="connection-contact" required minLength={6} maxLength={200} value={contact} onChange={e=>setContact(e.target.value)} placeholder="Email hoặc số điện thoại"/>
          <p className="public-privacy-note">Thông tin liên hệ chỉ dùng để xử lý yêu cầu này. Nội dung nhu cầu không được đưa lên danh sách công khai. Nhân sự nội bộ truy cập contact sẽ để lại dấu vết audit.</p>
          {error&&<p className="public-form-error" role="alert">{error}</p>}
          <button className="button button--primary" type="submit" disabled={busy}>{busy?'Đang gửi...':'Gửi yêu cầu riêng tư'} <Icon name="arrow" size={17}/></button>
        </form>
        <aside className="connection-side-note">
          <Icon name="shield" size={28}/>
          <h2>Không phải marketplace.</h2>
          <p>CONSPACE chỉ tiếp nhận và phân loại thủ công ở giai đoạn này. Không đăng công khai nhu cầu, không cho các bên đấu giá, không chấm sao và không tạo “top nhà thầu/KTS”.</p>
          <Link className="text-link" to="/quy-tac-noi-dung">Đọc nguyên tắc nội dung <Icon name="arrow" size={15}/></Link>
        </aside>
      </div>}
    </main>
  </>;
}
