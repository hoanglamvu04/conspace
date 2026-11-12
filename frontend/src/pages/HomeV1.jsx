import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { READERS, SECTION_LINKS } from '../config.js';
import { useReader } from '../context/ReaderContext.jsx';
import { useFeed, useNiches } from '../hooks/useResources.js';
import { ArticleCard, NicheCard, SectionHeading, StatusPanel } from '../components/UI.jsx';
import { Icon } from '../components/Icons.jsx';
import { ConstructionDrawing } from './Home.jsx';
import { chapterPath } from '../lib/contentModel.js';
import { sortByLens } from '../lib/readerLens.js';

function FeedArticle({ article }) {
  return <ArticleCard article={{
    ...article,
    author: article.author || (article.authorName ? { displayName: article.authorName } : null),
  }} />;
}

export default function HomeV1() {
  const { reader, setReader } = useReader();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const feed = useFeed();
  const niches = useNiches();
  const data = feed.status === 'success' ? feed.data : null;
  const articles = sortByLens(data?.articles || [], reader);
  const fieldNotes = data?.fieldNotes || [];
  const questions = data?.questions || [];
  const books = data?.books || [];
  const design = niches.status === 'success' ? niches.data.filter((item) => item.group === 'design') : [];
  const construction = niches.status === 'success' ? niches.data.filter((item) => item.group === 'construction') : [];

  function search(event) {
    event.preventDefault();
    navigate('/tra-nhanh' + (query.trim() ? '?q=' + encodeURIComponent(query.trim()) : ''));
  }

  const latestChapter = books[0] || null;

  return <>
    <section className="home-hero">
      <div className="container home-hero-grid">
        <div className="hero-copy">
          <div className="hero-kicker"><span className="kicker-line"/> SỰ THẬT NGÀNH XÂY</div>
          <h1>Một công trình.<br/><span>Ba góc nhìn.</span></h1>
          <p className="hero-lead">Chủ nhà thấy một điều. Kiến trúc sư nghĩ một cách. Nhà thầu đối diện một thực tế khác. CONSPACE là nơi những câu chuyện ấy được đặt cạnh nhau.</p>
          <div className="hero-choice-inline">
            <div className="choice-intro">
              <span className="eyebrow">BẮT ĐẦU TỪ BẠN</span>
              <h2>Bạn đang ở phía nào của công trình?</h2>
            </div>
            <div className="choice-grid choice-grid--hero" aria-label="Chọn góc nhìn đọc">
              {READERS.map((role) => (
                <button type="button" className={'choice-card' + (reader === role.id ? ' is-active' : '')} aria-pressed={reader === role.id} onClick={() => setReader(role.id)} key={role.id}>
                  <span className="choice-icon"><Icon name={role.icon} size={24}/></span>
                  <span className="choice-text">
                    <span className="choice-index">GÓC NHÌN {role.number}</span>
                    <strong>{role.heading}</strong>
                    <span>{role.description}</span>
                  </span>
                  <Icon className="choice-arrow" name="upRight" size={19}/>
                </button>
              ))}
            </div>
          </div>
          <p className="hero-footnote"><Icon name="check" size={16}/> Không quảng cáo trả tiền. Không xếp hạng nhà thầu.</p>
        </div>
        <ConstructionDrawing/>
      </div>
    </section>

    <div className="container">
      <form className="quick-search" onSubmit={search} role="search" aria-label="Tra nhanh kiến thức">
        <div className="quick-search-label">
          <span className="search-symbol"><Icon name="search" size={22}/></span>
          <div><strong>Bạn đang muốn tìm hiểu điều gì?</strong><span>Tìm trong bài viết, ngách, chương sách và thuật ngữ đã xuất bản.</span></div>
        </div>
        <div className="quick-search-input">
          <label className="sr-only" htmlFor="home-search">Từ khóa tra nhanh</label>
          <input id="home-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ví dụ: chống thấm, móng, bản vẽ..."/>
          <button className="button button--primary" type="submit">Tra nhanh <Icon name="arrow" size={17}/></button>
        </div>
      </form>
    </div>

    <section className="section section--editorial">
      <div className="container">
        <SectionHeading eyebrow="KỲ MỚI NHẤT" title="Nội dung mới đã xuất bản" description="Chỉ hiển thị chương, ca hiện trường, hỏi đáp và bài viết được API xác nhận công khai."/>
        {feed.status === 'loading' && <StatusPanel status="loading" kind="articles"/>}
        {feed.status === 'error' && <StatusPanel status="error" onRetry={feed.retry} description="Chưa lấy được kỳ nội dung từ máy chủ. Vui lòng thử lại."/>}
        {feed.status === 'success' && <>
          <div className="home-latest-chapter">
            <div>
              <span className="eyebrow">CHƯƠNG SÁCH MỚI NHẤT</span>
              {latestChapter ? <>
                <p className="home-latest-book">{latestChapter.bookTitle} · {latestChapter.contentLabelVi}</p>
                <h3>{latestChapter.chapterTitle || latestChapter.displayLabel}</h3>
                <p>{latestChapter.articleTitle}</p>
                <Link className="text-link" to={chapterPath(latestChapter.bookSlug, latestChapter.chapterNo)}>Đọc chương đã xuất bản <Icon name="arrow" size={17}/></Link>
              </> : <><h3>Chưa có chương sách được xuất bản</h3><p>Chương chỉ xuất hiện sau khi được duyệt và công bố. Nội dung chưa xuất bản không hiển thị ở đây.</p></>}
            </div>
            <span className="home-latest-index">{latestChapter ? String(latestChapter.chapterNo).padStart(2, '0') : '—'}</span>
          </div>

          <div className="home-feed-grid">
            <section>
              <SectionHeading eyebrow="GHI CHÉP ĐÃ ẨN DANH" title="Hiện trường"/>
              {fieldNotes.length ? <div className="home-feed-cards">{fieldNotes.slice(0, 3).map((item) => <Link className="home-feed-card" to={'/hien-truong/' + item.id} key={item.id}>
                <span className="eyebrow">CA ĐÃ XUẤT BẢN</span><h3>{item.title}</h3><p>{item.excerpt || item.phenomenon}</p><span className="text-link">Đọc ca hiện trường <Icon name="arrow" size={16}/></span>
              </Link>)}</div> : <StatusPanel status="empty" compact title="Chưa có ca hiện trường công khai" description="Ca chỉ hiển thị sau khi được duyệt, ẩn danh và xác nhận quyền ảnh."/>}
            </section>
            <section>
              <SectionHeading eyebrow="CÂU TRẢ LỜI ĐÃ DUYỆT" title="Hỏi đáp"/>
              {questions.length ? <Link className="home-feature-question" to={'/hoi-dap/' + questions[0].id}>
                <span className="eyebrow">HỎI ĐÁP / ĐÃ XUẤT BẢN</span><h3>{questions[0].description}</h3><p>{questions[0].answer}</p><span className="text-link">Đọc câu trả lời <Icon name="arrow" size={16}/></span>
              </Link> : <StatusPanel status="empty" compact title="Chưa có câu trả lời công khai" description="Câu hỏi và câu trả lời chỉ xuất hiện sau khi được duyệt."/>}
            </section>
          </div>

          <section className="home-feed-articles">
            <SectionHeading eyebrow="BÀI VIẾT" title="Góc nhìn được ưu tiên" description="Bài của góc nhìn bạn chọn được xếp trước; bài đã xuất bản của hai phía còn lại vẫn được giữ nguyên." action="Xem tất cả bài viết" to="/bai-viet"/>
            {articles.length ? <div className="articles-grid">{articles.slice(0, 3).map((article) => <FeedArticle article={article} key={article.id}/>)}</div> : <StatusPanel status="empty" compact title="Chưa có bài viết công khai" description="Bài viết sẽ xuất hiện sau khi được biên tập và xuất bản."/>}
          </section>
        </>}
      </div>
    </section>

    <section className="section section--blue" id="kho-ngach">
      <div className="container">
        <div className="taxonomy-header">
          <SectionHeading eyebrow="BẢN ĐỒ CHUYÊN MÔN" title="Kho ngách và mảng kiến trúc" description="Danh mục lấy trực tiếp từ API. Những ngách chưa có hồ sơ nguồn sẽ không được tự tạo." action="Mở toàn bộ danh mục" to="/ngach"/>
          {niches.status === 'success' && <div className="taxonomy-totals" aria-label="Số danh mục hiện có">
            <div><strong>{design.length.toLocaleString('vi-VN')}</strong><span>Mảng kiến trúc</span></div>
            <div><strong>{construction.length.toLocaleString('vi-VN')}</strong><span>Ngách thi công</span></div>
          </div>}
        </div>
        <div className="taxonomy-two-col">
          <div className="taxonomy-area">
            <div className="taxonomy-area-head"><span className="taxonomy-round"><Icon name="draft" size={22}/></span><div><h3>Mảng kiến trúc</h3><p>Phân theo loại công trình đã xác nhận</p></div><Link to="/ngach?group=design" aria-label="Xem mảng kiến trúc"><Icon name="upRight" size={19}/></Link></div>
            {niches.status === 'success' && design.length ? <div className="design-tile-grid">{design.map((item, index) => <Link key={item.id} to={'/ngach/' + encodeURIComponent(item.slug)} className="design-tile"><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.name}</strong><Icon name="upRight" size={17}/></Link>)}</div> : <StatusPanel status={niches.status === 'error' ? 'error' : niches.status === 'loading' ? 'loading' : 'empty'} onRetry={niches.retry} compact title="Chưa có mảng kiến trúc từ API"/>}
          </div>
          <div className="taxonomy-area taxonomy-area--construction">
            <div className="taxonomy-area-head"><span className="taxonomy-round"><Icon name="hardhat" size={22}/></span><div><h3>Ngách thi công</h3><p>Chỉ tên ngách có nguồn đã nhập</p></div><Link to="/ngach?group=construction" aria-label="Xem ngách thi công"><Icon name="upRight" size={19}/></Link></div>
            {niches.status === 'success' && construction.length ? <div className="construction-list">{construction.slice(0, 6).map((item, index) => <Link key={item.id} to={'/ngach/' + encodeURIComponent(item.slug)} className="construction-list-item"><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.name}</strong><Icon name="upRight" size={17}/></Link>)}</div> : <StatusPanel status={niches.status === 'error' ? 'error' : niches.status === 'loading' ? 'loading' : 'empty'} onRetry={niches.retry} compact title="Chưa có ngách thi công được xác nhận"/>}
          </div>
        </div>
      </div>
    </section>

    <section className="section section--explore">
      <div className="container">
        <SectionHeading eyebrow="ĐI TIẾP TỪ ĐÂY" title="Đọc, quan sát và tự tra cứu" description="Các chuyên mục cốt lõi của CONSPACE, không mở hồ sơ hoặc dịch vụ chưa vận hành."/>
        <div className="explore-grid">{SECTION_LINKS.map((item, index) => <Link to={item.to} key={item.to} className={'explore-card explore-card--' + index}>
          <span className="explore-top"><span>{item.eyebrow}</span><Icon name="upRight" size={20}/></span>
          <span className="explore-icon"><Icon name={item.icon} size={33} strokeWidth={1.35}/></span>
          <h3>{item.title}</h3><p>{item.description}</p>
        </Link>)}</div>
      </div>
    </section>
    <section className="editorial-band"><div className="container editorial-band-inner"><div><span className="eyebrow">NGUYÊN TẮC CỦA CHÚNG TÔI</span><h2>Không đứng về một phía.<br/>Đứng về phía <em>sự thật.</em></h2></div><div><p>Không PR trả tiền, không xếp hạng nhà thầu, không suy diễn từ dữ liệu thiếu nguồn. Mọi quan điểm đều cần được đặt trong hoàn cảnh của cả ba phía.</p><Link to="/quy-tac-noi-dung" className="button button--light">Đọc nguyên tắc biên tập <Icon name="upRight" size={18}/></Link></div></div></section>
  </>;
}
