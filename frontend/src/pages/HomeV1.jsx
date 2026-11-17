import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { READERS, DESIGN_AREAS, formatDate, safeMediaUrl } from '../config.js';
import { useReader } from '../context/ReaderContext.jsx';
import { useArticles, useFeed, useNiches } from '../hooks/useResources.js';
import { StatusPanel } from '../components/UI.jsx';
import { Icon } from '../components/Icons.jsx';
import { chapterPath } from '../lib/contentModel.js';

// Presentation-only fallback photography for the local design preview.
// Never represent these images as documented CONSPACE projects or licensed CMS media.
// Published article covers from the API always take precedence.
const PREVIEW_IMAGES = Object.freeze({
  hero: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=82',
  house: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=640&q=80',
  'f-b': 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=640&q=80',
  office: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=640&q=80',
  stay: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=640&q=80',
  factory: 'https://images.unsplash.com/photo-1565043589221-1a6fd9ae45c7?auto=format&fit=crop&w=640&q=80',
  project: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=640&q=80',
  book: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80',
  field: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80',
  question: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=600&q=80',
  manifesto: 'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=1200&q=80',
});

const DESIGN_SUBTITLES = Object.freeze({
  house:'Nhà ở', luxury:'Công trình cao cấp', 'f-b':'Ẩm thực và dịch vụ',
  fb:'Ẩm thực và dịch vụ', office:'Văn phòng', stay:'Lưu trú',
  factory:'Nhà xưởng', project:'Dự án', sacred:'Công trình tín ngưỡng',
});

function previewImageFor(slug) {
  const normalized = String(slug || '').toLowerCase().replace(/&/g, '-').replace(/[^a-z0-9-]/g, '');
  return PREVIEW_IMAGES[normalized] || PREVIEW_IMAGES.house;
}

function EditorialPhoto({ image, fallback, className = '', eager = false }) {
  const confirmed = safeMediaUrl(image);
  const source = confirmed || fallback || null;
  return <div className={'ed-photo ' + className}>
    {source && <img src={source} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = 'none'; }}/>}
    {!confirmed && <span className="ed-preview-caption">Ảnh minh họa</span>}
  </div>;
}

function EditorialSectionHeading({ title, description, to, action }) {
  return <div className="ed-section-heading">
    <div className="ed-section-heading-copy"><h2>{title}</h2>{description && <p>{description}</p>}</div>
    {to && <Link className="ed-text-link" to={to}>{action || 'Xem tất cả'} <Icon name="arrow" size={16}/></Link>}
  </div>;
}

function ArticleHeading({ item }) {
  return <Link to={'/bai-viet/' + encodeURIComponent(item.slug)} className="ed-article-title-link">{item.title}</Link>;
}

export default function HomeV1() {
  const { reader, setReader } = useReader();
  const [query, setQuery] = useState('');
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [articleLens, setArticleLens] = useState('all');
  const navigate = useNavigate();
  const feed = useFeed(reader);
  const niches = useNiches();
  const published = useArticles(articleLens === 'all' ? null : articleLens, null, 9);
  const data = feed.status === 'success' ? feed.data : null;
  const articles = published.status === 'success' ? published.data : [];
  const featuredCount = Math.min(articles.length, 4);
  const heroArticle = featuredCount ? articles[featuredIndex % featuredCount] : null;
  const relatedArticles = articles.filter((item) => item?.id !== heroArticle?.id);
  const mainArticle = relatedArticles[0] || heroArticle || null;
  const sideArticles = relatedArticles.filter((item) => item?.id !== mainArticle?.id).slice(0, 3);
  const fieldNotes = data?.fieldNotes || [];
  const questions = data?.questions || [];
  const books = data?.books || [];
  const latestChapter = books[0] || null;
  const design = niches.status === 'success' ? niches.data
    .filter((item) => item.group === 'design')
    .sort((a,b) => DESIGN_AREAS.indexOf(a.name.toUpperCase()) - DESIGN_AREAS.indexOf(b.name.toUpperCase())) : [];

  function search(event) {
    event.preventDefault();
    navigate('/tra-nhanh' + (query.trim() ? '?q=' + encodeURIComponent(query.trim()) : ''));
  }

  function chooseLens(id) {
    setArticleLens(id);
    if (id !== 'all') setReader(id);
    setFeaturedIndex(0);
  }

  return <main className="editorial-home">
    <div className="ed-container">
      <section className="ed-hero" aria-label="Bài viết nổi bật">
        <div className="ed-hero-content">
          <span className="ed-overline">GÓC NHÌN CÔNG TRÌNH</span>
          <h1>{heroArticle ? heroArticle.title : 'Một công trình. Ba góc nhìn.'}</h1>
          <p>{heroArticle?.excerpt || 'Chủ nhà, kiến trúc sư và nhà thầu cùng nhìn một công trình từ những trải nghiệm khác nhau. CONSPACE đặt các câu chuyện cạnh nhau để người đọc có thêm dữ kiện.'}</p>
          <Link className="ed-hero-link" to={heroArticle ? '/bai-viet/' + encodeURIComponent(heroArticle.slug) : '/bai-viet'}>
            {heroArticle ? 'Đọc bài viết' : 'Khám phá bài viết'} <Icon name="arrow" size={18}/>
          </Link>
          {heroArticle?.publishedAt && <span className="ed-hero-date">{formatDate(heroArticle.publishedAt)}</span>}
          {published.status === 'error' && <div className="ed-hero-error"><StatusPanel status="error" compact onRetry={published.retry}/></div>}
        </div>
        <div className="ed-hero-visual">
          <EditorialPhoto image={heroArticle?.coverImage} fallback={PREVIEW_IMAGES.hero} eager className="ed-hero-picture"/>
          <div className="ed-hero-controls">
            <button type="button" aria-label="Bài trước" disabled={featuredCount < 2} onClick={() => setFeaturedIndex((value) => (value - 1 + featuredCount) % featuredCount)}>
              <Icon name="arrow" size={17}/>
            </button>
            <button type="button" aria-label="Bài tiếp theo" disabled={featuredCount < 2} onClick={() => setFeaturedIndex((value) => (value + 1) % featuredCount)}>
              <Icon name="arrow" size={17}/>
            </button>
            <span>{featuredCount ? String(featuredIndex % featuredCount + 1).padStart(2,'0') : '00'} / {String(featuredCount).padStart(2,'0')}</span>
          </div>
        </div>
      </section>

      <section className="ed-section ed-niche-section" id="kho-ngach">
        <EditorialSectionHeading title="Kho mảng kiến trúc" description="Tri thức được phân loại theo từng loại hình công trình, từ nhà ở đến các không gian chuyên dụng." to="/ngach?group=design" action="Xem tất cả mảng"/>
        {niches.status === 'loading' && <StatusPanel status="loading" kind="articles"/>}
        {niches.status === 'error' && <StatusPanel status="error" compact onRetry={niches.retry}/>}
        {niches.status === 'success' && (design.length ? <div className="ed-niche-strip">
          {design.slice(0,6).map((item) => <Link className="ed-niche-tile" key={item.id} to={'/mang/' + encodeURIComponent(item.slug)}>
            <EditorialPhoto fallback={previewImageFor(item.slug)}/>
            <span className="ed-niche-label"><strong>{item.name}</strong><small>{DESIGN_SUBTITLES[item.slug] || 'Mảng kiến trúc'}</small><Icon name="arrow" size={15}/></span>
          </Link>)}
        </div> : <StatusPanel status="empty" compact title="Chưa có mảng kiến trúc công khai"/>)}
      </section>

      <section className="ed-section ed-articles-section">
        <div className="ed-articles-heading">
          <h2>Bài viết <em>mới</em></h2>
          <div className="ed-lens-tabs" role="group" aria-label="Ưu tiên bài viết theo góc nhìn">
            <button type="button" className={articleLens === 'all' ? 'is-selected' : ''} aria-pressed={articleLens === 'all'} onClick={() => chooseLens('all')}>Tất cả</button>
            {READERS.map((item) => <button type="button" key={item.id} className={articleLens === item.id ? 'is-selected' : ''} aria-pressed={articleLens === item.id} onClick={() => chooseLens(item.id)}>{item.label}</button>)}
          </div>
          <Link className="ed-text-link ed-article-all" to="/bai-viet">Xem tất cả bài viết <Icon name="arrow" size={16}/></Link>
        </div>
        {published.status === 'loading' && <StatusPanel status="loading" kind="articles"/>}
        {published.status === 'error' && <StatusPanel status="error" compact onRetry={published.retry}/>}
        {published.status === 'success' && (mainArticle ? <div className="ed-article-layout">
          <article className="ed-main-story">
            <Link to={'/bai-viet/' + encodeURIComponent(mainArticle.slug)} className="ed-main-photo" aria-label={'Đọc ' + mainArticle.title}>
              <EditorialPhoto image={mainArticle.coverImage} fallback={PREVIEW_IMAGES.house}/>
            </Link>
            <div className="ed-main-summary">
              <span className="ed-overline">BÀI ĐÃ XUẤT BẢN</span>
              <h3><ArticleHeading item={mainArticle}/></h3>
              <p>{mainArticle.excerpt || 'Nội dung đã được công khai qua quy trình biên tập CONSPACE.'}</p>
              <small>{formatDate(mainArticle.publishedAt)}{mainArticle.author?.displayName ? '  ·  ' + mainArticle.author.displayName : ''}</small>
            </div>
          </article>
          <div className="ed-story-list">
            {sideArticles.length ? sideArticles.map((item,index) => <Link className="ed-story-row" to={'/bai-viet/' + encodeURIComponent(item.slug)} key={item.id}>
              <EditorialPhoto image={item.coverImage} fallback={previewImageFor(design[index]?.slug)}/>
              <span><small>BÀI ĐÃ XUẤT BẢN</small><strong>{item.title}</strong></span>
            </Link>) : <p className="ed-muted-empty">Các bài tiếp theo sẽ xuất hiện khi được duyệt và xuất bản.</p>}
          </div>
          <aside className="ed-perspectives">
            <h3>Góc nhìn <em>đa chiều</em></h3>
            <p>Cùng một công trình, ba cách tiếp cận. Chọn góc nhìn để ưu tiên thứ tự bài đọc.</p>
            {READERS.map((role) => <button type="button" key={role.id} onClick={() => chooseLens(role.id)} aria-pressed={reader === role.id} className={reader === role.id ? 'is-selected' : ''}>
              <Icon name={role.icon} size={22}/>
              <span><strong>{role.label}</strong><small>{role.id === 'homeowner' ? 'Nhu cầu, chi phí và trải nghiệm' : role.id === 'architect' ? 'Hồ sơ, giải pháp và thẩm mỹ' : 'Thi công, tiến độ và kiểm soát'}</small></span>
              <Icon name="arrow" size={15}/>
            </button>)}
          </aside>
        </div> : <StatusPanel status="empty" compact title="Chưa có bài viết được xuất bản"/>)}
      </section>

      <section className="ed-panels" aria-label="Các chuyên mục">
        <article className="ed-panel">
          <EditorialPhoto fallback={PREVIEW_IMAGES.book}/>
          <div><h2>Tủ sách</h2><p>{latestChapter ? latestChapter.bookTitle + ': ' + (latestChapter.chapterTitle || latestChapter.displayLabel) : 'Sách chuyên môn, cẩm nang và những chương đã được biên tập, xuất bản.'}</p>
          <Link className="ed-text-link" to={latestChapter ? chapterPath(latestChapter.bookSlug,latestChapter.chapterNo) : '/tu-sach'}>Xem tủ sách <Icon name="arrow" size={16}/></Link></div>
        </article>
        <article className="ed-panel">
          <EditorialPhoto fallback={PREVIEW_IMAGES.field}/>
          <div><h2>Hiện trường</h2><p>{fieldNotes[0]?.excerpt || fieldNotes[0]?.phenomenon || 'Những ghi chép đã ẩn danh về tình huống tại công trình.'}</p>
          <Link className="ed-text-link" to={fieldNotes.length ? '/hien-truong/' + encodeURIComponent(fieldNotes[0].slug) : '/hien-truong'}>Xem hiện trường <Icon name="arrow" size={16}/></Link></div>
        </article>
        <article className="ed-panel">
          <EditorialPhoto fallback={PREVIEW_IMAGES.question}/>
          <div><h2>Hỏi đáp</h2><p>{questions[0]?.description || 'Thắc mắc thực tế và câu trả lời đã được kiểm duyệt.'}</p>
          <Link className="ed-text-link" to={questions.length ? '/hoi-dap/' + questions[0].id : '/hoi-dap/gui-cau-hoi'}>Gửi câu hỏi <Icon name="arrow" size={16}/></Link></div>
        </article>
      </section>

      <form className="ed-quick-search" onSubmit={search} role="search" aria-label="Tra nhanh kiến thức">
        <span><Icon name="search" size={19}/> Tra cứu bài viết, ngách, thuật ngữ đã công khai</span>
        <label className="sr-only" htmlFor="home-search">Từ khóa tra nhanh</label>
        <input id="home-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập điều bạn muốn tìm..." />
        <button type="submit">Tra nhanh <Icon name="arrow" size={16}/></button>
      </form>
      <div className="home-trust-rail ed-trust-rail" aria-label="Nguyên tắc hiển thị nội dung">
        <span><Icon name="check" size={17}/> Chỉ nội dung đã công khai</span>
        <span><Icon name="link" size={17}/> Có dấu vết nguồn</span>
        <span><Icon name="users" size={17}/> Ba góc nhìn cùng tồn tại</span>
        <Link to="/ngach">Khám phá kho ngách <Icon name="arrow" size={14}/></Link>
      </div>
    </div>
    <section className="ed-manifesto">
      <EditorialPhoto fallback={PREVIEW_IMAGES.manifesto}/>
      <div>
        <span className="ed-overline">TRI THỨC NGÀNH XÂY</span>
        <h2>Từ bản vẽ đến công trình,<br/>kết nối tri thức và thực tế.</h2>
        <p>CONSPACE chia sẻ, lưu trữ và hệ thống hóa tri thức ngành xây, dành cho chủ nhà, kiến trúc sư, nhà thầu và những người quan tâm.</p>
        <Link className="ed-text-link" to="/ve-conspace">Về CONSPACE <Icon name="arrow" size={16}/></Link>
      </div>
    </section>
  </main>;
}
