import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DESIGN_AREAS, READERS, SECTION_LINKS } from '../config.js';
import { useReader } from '../context/ReaderContext.jsx';
import { useArticles, useNiches } from '../hooks/useResources.js';
import { ArticleCard, NicheCard, SectionHeading, StatusPanel } from '../components/UI.jsx';
import { Icon } from '../components/Icons.jsx';

export function ConstructionDrawing() {
  return <div className="hero-art" aria-label="Minh họa đường nét một công trình nhìn từ ba phía" role="img">
    <div className="hero-art-grid" aria-hidden="true" />
    <span className="art-label art-label--top">CONSPACE / 001</span>
    <div className="drawing-frame"><svg viewBox="0 0 480 360" fill="none" aria-hidden="true">
      <defs><linearGradient id="blueprintGradient" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#2c80ad"/><stop offset="1" stopColor="#20506e"/></linearGradient></defs>
      <g stroke="url(#blueprintGradient)" strokeWidth="2" strokeLinejoin="round"><path d="M66 304 232 344 411 280 247 241Z" fill="#b8dbe9" fillOpacity=".35"/><path d="M102 278V126l136-75 143 63v156l-143 67-136-59Z" fill="#eff8fc" fillOpacity=".45"/><path d="M238 51v286M102 126l136 60 143-72M238 186l143-72M102 278l136 59"/><path d="M141 146v103l60 25V172Z"/><path d="M274 172v-54l69 30v54Z"/><path d="M274 239v-45l69 29v44Z"/><path d="M121 119 237 57 360 113" strokeDasharray="5 7" strokeWidth="1"/></g>
      <g stroke="#5b9cbc" strokeWidth="1.2" strokeDasharray="4 5" opacity=".72"><path d="M86 126V36M237 50V20M383 112V29M75 304v33M418 283v37"/><path d="M86 35h298M75 339h345"/><path d="M411 283 447 265M381 114l34-14"/></g>
      <g fill="#ffffff" stroke="#18658a" strokeWidth="2"><circle cx="100" cy="128" r="6"/><circle cx="240" cy="53" r="6"/><circle cx="380" cy="270" r="6"/></g>
      <g fill="#155e82" fontFamily="sans-serif" fontSize="13" fontWeight="700"><text x="81" y="24">A—A</text><text x="378" y="23">B—B</text><text x="416" y="333">01</text></g>
    </svg></div>
    <div className="art-perspective art-perspective--one"><span>01</span><strong>CHỦ NHÀ</strong><small>Người sử dụng</small></div>
    <div className="art-perspective art-perspective--two"><span>02</span><strong>KIẾN TRÚC SƯ</strong><small>Người thiết kế</small></div>
    <div className="art-perspective art-perspective--three"><span>03</span><strong>NHÀ THẦU</strong><small>Người thi công</small></div>
    <span className="art-caption">THẤY ĐỦ BA PHÍA · HIỂU ĐÚNG VẤN ĐỀ</span>
  </div>;
}

export default function Home() {
  const { reader, setReader } = useReader();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const articles = useArticles(reader, null, 5);
  const niches = useNiches();
  const published = niches.status === 'success' ? niches.data : [];
  const design = published.filter((item) => item.group === 'design');
  const construction = published.filter((item) => item.group === 'construction');

  function search(event) {
    event.preventDefault();
    navigate(`/tra-cuu${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
  }

  return <>
    <section className="home-hero">
      <div className="container home-hero-grid">
        <div className="hero-copy">
          <div className="hero-kicker"><span className="kicker-line"/> SỰ THẬT NGÀNH XÂY</div>
          <h1>Một công trình.<br /><span>Ba góc nhìn.</span></h1>
          <p className="hero-lead">Chủ nhà thấy một điều. Kiến trúc sư nghĩ một cách. Nhà thầu đối diện một thực tế khác. CONSPACE là nơi những câu chuyện ấy được đặt cạnh nhau.</p>
          <div className="hero-actions"><Link to="/ngach" className="button button--primary">Khám phá kho tri thức <Icon name="arrow" size={19}/></Link><Link to="/ve-conspace" className="button button--quiet">Về CONSPACE <Icon name="upRight" size={17}/></Link></div>
          <p className="hero-footnote"><Icon name="check" size={16}/> Không quảng cáo trả tiền. Không xếp hạng nhà thầu.</p>
        </div>
        <ConstructionDrawing />
      </div>
      <div className="container hero-choice"><div className="choice-intro"><span className="eyebrow">BẮT ĐẦU TỪ BẠN</span><h2>Bạn đang ở phía nào của công trình?</h2><p>Chọn một góc nhìn để bài viết hiển thị gần với điều bạn quan tâm.</p></div><div className="choice-grid">{READERS.map((role) => <button type="button" className={`choice-card ${reader === role.id ? 'is-active' : ''}`} aria-pressed={reader === role.id} onClick={() => setReader(role.id)} key={role.id}><span className="choice-icon"><Icon name={role.icon} size={26}/></span><span className="choice-text"><span className="choice-index">GÓC NHÌN {role.number}</span><strong>{role.heading}</strong><span>{role.description}</span></span><Icon className="choice-arrow" name="upRight" size={21}/></button>)}</div></div>
    </section>

    <div className="container"><form className="quick-search" onSubmit={search} role="search" aria-label="Tra cứu kiến thức"><div className="quick-search-label"><span className="search-symbol"><Icon name="search" size={22}/></span><div><strong>Bạn đang muốn tìm hiểu điều gì?</strong><span>Tra thuật ngữ hoặc tìm đúng ngách chuyên môn.</span></div></div><div className="quick-search-input"><label className="sr-only" htmlFor="home-search">Từ khóa tra cứu</label><input id="home-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ví dụ: chống thấm, móng, bản vẽ..."/><button className="button button--primary" type="submit">Tra cứu <Icon name="arrow" size={17}/></button></div></form></div>

    <section className="section section--editorial"><div className="container"><SectionHeading eyebrow="DÒNG NỘI DUNG" title="Mới trên CONSPACE" description="Những bài đã được xuất bản, ưu tiên theo góc nhìn bạn chọn." action="Xem tất cả bài viết" to="/bai-viet"/>
      {articles.status === 'success' && articles.data.length > 0 ? <div className="home-articles"><ArticleCard article={articles.data[0]} featured/><div className="home-articles-side">{articles.data.slice(1, 4).map((item) => <ArticleCard key={item.id} article={item}/>)}</div></div> : <StatusPanel status={articles.status} onRetry={articles.retry} kind="articles" description={articles.status === 'error' ? 'Chưa lấy được bài viết từ API. Bạn có thể thử tải lại.' : 'Khi có bài đã duyệt và xuất bản, nội dung mới sẽ hiển thị ở đây.'}/>}
    </div></section>

    <section className="section section--blue" id="kho-ngach"><div className="container"><div className="taxonomy-header"><SectionHeading eyebrow="BẢN ĐỒ CHUYÊN MÔN" title="38 lĩnh vực. Một bản đồ ngành Xây." description="Phân loại theo 8 mảng kiến trúc và 30 ngách thi công. Dữ liệu danh mục được đồng bộ từ hệ thống." action="Mở toàn bộ danh mục" to="/ngach"/><div className="taxonomy-totals" aria-label="Cơ cấu phân loại đã được quy hoạch"><div><strong>08</strong><span>Mảng kiến trúc</span></div><div><strong>30</strong><span>Ngách thi công</span></div></div></div>
      <div className="taxonomy-two-col"><div className="taxonomy-area"><div className="taxonomy-area-head"><span className="taxonomy-round"><Icon name="draft" size={22}/></span><div><h3>Thiết kế kiến trúc</h3><p>Phân theo loại công trình</p></div><Link to="/ngach?group=design" aria-label="Xem mảng thiết kế"><Icon name="upRight" size={19}/></Link></div><div className="design-tile-grid">{DESIGN_AREAS.map((name, index) => { const live = design.find((item) => item.name?.toUpperCase() === name); return <Link key={name} to={live ? `/ngach/${encodeURIComponent(live.slug)}` : `/ngach?group=design&q=${encodeURIComponent(name)}`} className="design-tile"><span>{String(index + 1).padStart(2, '0')}</span><strong>{name}</strong><Icon name="upRight" size={17}/></Link>; })}</div><p className="taxonomy-source"><Icon name="info" size={15}/> Tên 8 mảng theo tài liệu phân loại CONSPACE. Bài viết lấy từ API.</p></div><div className="taxonomy-area taxonomy-area--construction"><div className="taxonomy-area-head"><span className="taxonomy-round"><Icon name="hardhat" size={22}/></span><div><h3>Chuyên ngách thi công</h3><p>Phân theo công việc và chuyên môn</p></div><Link to="/ngach?group=construction" aria-label="Xem ngách thi công"><Icon name="upRight" size={19}/></Link></div><div className="construction-list">{niches.status === 'success' && construction.length ? construction.slice(0, 5).map((item, index) => <Link key={item.id} to={`/ngach/${encodeURIComponent(item.slug)}`} className="construction-list-item"><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.name}</strong><Icon name="upRight" size={17}/></Link>) : <div className="construction-placeholder"><Icon name="layers" size={31}/><strong>{niches.status === 'error' ? 'Chưa kết nối được danh mục' : 'Đang cập nhật các ngách thi công'}</strong><p>Danh sách chuyên ngách chỉ xuất hiện khi API trả dữ liệu đã được xác nhận.</p>{niches.status === 'error' && <button className="text-link" type="button" onClick={niches.retry}>Thử kết nối lại <Icon name="refresh" size={16}/></button>}</div>}</div><Link to="/ngach?group=construction" className="taxonomy-more">Tra cứu ngách thi công <Icon name="arrow" size={18}/></Link></div></div>
    </div></section>

    <section className="section section--explore"><div className="container"><SectionHeading eyebrow="CÁC CHUYÊN MỤC" title="Đọc, quan sát và tự tra cứu" description="Mỗi chuyên mục là một cách đi vào kiến thức nghề, không cần bắt đầu từ thuật ngữ khó."/><div className="explore-grid">{SECTION_LINKS.map((item, index) => <Link to={item.to} key={item.to} className={`explore-card explore-card--${index}`}><span className="explore-top"><span>{item.eyebrow}</span><Icon name="upRight" size={20}/></span><span className="explore-icon"><Icon name={item.icon} size={33} strokeWidth={1.35}/></span><h3>{item.title}</h3><p>{item.description}</p></Link>)}</div></div></section>
    <section className="editorial-band"><div className="container editorial-band-inner"><div><span className="eyebrow">NGUYÊN TẮC CỦA CHÚNG TÔI</span><h2>Không đứng về một phía.<br/>Đứng về phía <em>sự thật.</em></h2></div><div><p>Không PR trả tiền, không xếp hạng nhà thầu, không suy diễn từ dữ liệu thiếu nguồn. Mọi quan điểm đều cần được đặt trong hoàn cảnh của cả ba phía.</p><Link to="/quy-tac-noi-dung" className="button button--light">Đọc nguyên tắc biên tập <Icon name="upRight" size={18}/></Link></div></div></section>
  </>;
}
