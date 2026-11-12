import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { formatDate, safeMediaUrl } from '../config.js';
import { useReader } from '../context/ReaderContext.jsx';
import { useFieldNotes, useNiches, useQuestions, useResource } from '../hooks/useResources.js';
import { apiUrl, getJson, postJson } from '../lib/api.js';
import { chapterPath, chapterDisplayLabel } from '../lib/contentModel.js';
import { sortByLens } from '../lib/readerLens.js';
import { Markdown } from '../components/Markdown.jsx';
import { Breadcrumbs, PageIntro, SectionHeading, StatusPanel } from '../components/UI.jsx';
import { Icon } from '../components/Icons.jsx';

function usePageMeta(title, description) {
  useEffect(() => {
    if (!title) return;
    document.title = title + ' | CONSPACE · Sự thật ngành Xây';
    const meta = document.querySelector('meta[name="description"]');
    if (meta && description) meta.setAttribute('content', description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', document.title);
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription && description) ogDescription.setAttribute('content', description);
  }, [title, description]);
}


function PublishedArticleSchema({ data }) {
  useEffect(() => {
    if (!data) return undefined;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.conspaceSchema = 'article';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: data.title,
      description: data.excerpt || undefined,
      datePublished: data.publishedAt || undefined,
      mainEntityOfPage: window.location.href,
      publisher: { '@type': 'Organization', name: 'CONSPACE' },
    }).replace(/</g, '\\u003c');
    document.head.appendChild(script);
    return () => script.remove();
  }, [data]);
  return null;
}

function PublishedQuestionSchema({ data }) {
  useEffect(() => {
    if (!data) return undefined;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.conspaceSchema = 'qapage';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'QAPage',
      mainEntity: {
        '@type': 'Question',
        name: data.description,
        acceptedAnswer: {
          '@type': 'Answer',
          text: data.answer,
          datePublished: data.publishedAt || undefined,
        },
      },
    }).replace(/</g, '\\u003c');
    document.head.appendChild(script);
    return () => script.remove();
  }, [data]);
  return null;
}

function safeSourceUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

function BookLabel({ value }) {
  return <span className="pill-label">{value || 'Nhãn sách chưa được xác định'}</span>;
}

export function BookIndex() {
  const books = useResource(apiUrl('/books'));
  const { reader } = useReader();
  const orderedBooks = sortByLens(books.data, reader);
  return <>
    <PageIntro eyebrow="CONSPACE / THƯ VIỆN BIÊN TẬP" title="Tủ sách" description="Ba đầu sách theo đúng nhãn nội dung đã được xác nhận. Chỉ chương đã xuất bản mới có đường dẫn đọc."/>
    <main className="container content-page">
      <Breadcrumbs items={[{ label: 'Tủ sách' }]}/>
      {books.status === 'loading' && <StatusPanel status="loading" kind="articles"/>}
      {books.status === 'error' && <StatusPanel status="error" onRetry={books.retry}/>}
      {books.status === 'success' && !books.data.length && <StatusPanel status="empty" title="Chưa có đầu sách từ API" description="Tủ sách sẽ hiển thị khi Backend trả về hồ sơ sách đã được xác nhận."/>}
      {books.status === 'success' && books.data.length > 0 && <div className="public-book-grid">{orderedBooks.map((book, index) => <article className="public-book-card" key={book.id}>
        <div className="public-book-cover"><span>CONSPACE / TỦ SÁCH</span><strong>{String(index + 1).padStart(2, '0')}</strong></div>
        <div className="public-book-info"><BookLabel value={book.contentLabelVi}/><h2>{book.title}</h2><p className="public-book-audience">{book.audienceRole === 'homeowner' ? 'Chủ nhà' : book.audienceRole === 'architect' ? 'Kiến trúc sư' : 'Nhà thầu'}</p>
          <p className="public-book-progress">{Number(book.publishedChapterCount || 0).toLocaleString('vi-VN')} / {Number(book.expectedChapterCount || 0).toLocaleString('vi-VN')} chương đã xuất bản</p>
          <Link className="button button--outline" to={'/tu-sach/' + encodeURIComponent(book.slug)}>Xem chương đã xuất bản <Icon name="arrow" size={17}/></Link>
        </div>
      </article>)}</div>}
      <div className="section-inline-note"><Icon name="info" size={19}/><p>Chương chưa xuất bản hoặc chưa đến lịch không được trả body từ API công khai. CONSPACE không tạo nội dung mẫu để lấp chỗ trống.</p></div>
    </main>
  </>;
}

export function BookDetail() {
  const { slug } = useParams();
  const validSlug = typeof slug === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(slug);
  const book = useResource(validSlug ? apiUrl('/books/' + slug) : null, { list: false, enabled: validSlug });
  usePageMeta(book.status === 'success' ? book.data.title : null, book.status === 'success' ? 'Các chương đã xuất bản trong ' + book.data.title + '.' : null);
  if (!validSlug) return <main className="container content-page"><StatusPanel status="empty" title="Đường dẫn sách không hợp lệ"/></main>;
  if (book.status === 'loading') return <main className="container content-page"><StatusPanel status="loading" kind="articles"/></main>;
  if (book.status === 'error') return <main className="container content-page"><Breadcrumbs items={[{ label: 'Tủ sách', to: '/tu-sach' }]}/><StatusPanel status="error" title={book.error?.status === 404 ? 'Không tìm thấy đầu sách' : 'Chưa thể tải đầu sách'} description={book.error?.message} onRetry={book.error?.status === 404 ? undefined : book.retry}/></main>;
  const data = book.data;
  const chapters = Array.isArray(data.chapters) ? data.chapters : [];
  return <>
    <PageIntro eyebrow="TỦ SÁCH / ĐẦU SÁCH" title={data.title} description="Danh sách chỉ gồm các chương đã được xuất bản và được Backend xác nhận."/>
    <main className="container content-page">
      <Breadcrumbs items={[{ label: 'Tủ sách', to: '/tu-sach' }, { label: data.title }]}/>
      <div className="public-book-detail-head"><BookLabel value={data.contentLabelVi}/><p>Đối tượng đọc chính: {data.audienceRole === 'homeowner' ? 'Chủ nhà' : data.audienceRole === 'architect' ? 'Kiến trúc sư' : 'Nhà thầu'}</p></div>
      {chapters.length ? <div className="public-chapter-list">{chapters.map((item) => <Link className="public-chapter-row" key={item.chapterNo} to={chapterPath(data.slug, item.chapterNo)}>
        <span className="public-chapter-number">{String(item.chapterNo).padStart(2, '0')}</span>
        <span><strong>{chapterDisplayLabel(data.slug, item.chapterNo, item.title || item.displayLabel)}</strong>{item.excerpt && <small>{item.excerpt}</small>}<small>{formatDate(item.publishedAt)}</small></span>
        <Icon name="arrow" size={19}/>
      </Link>)}</div> : <StatusPanel status="empty" title="Chưa có chương được xuất bản" description="Các vị trí chương chưa công bố không được hiển thị nội dung hoặc ngày đăng giả."/>}
      <Link className="text-link" to="/tu-sach"><Icon name="arrow" size={16}/> Trở về tủ sách</Link>
    </main>
  </>;
}

function chapterLinkFromParams(bookSlug, token, partToken) {
  const match = String(token || '').match(/(?:muc|chuong)-([1-9][0-9]{0,2})$/);
  if (!match) return null;
  if (bookSlug === 'cam-nang-kien-truc-hoa-lac') {
    const part = String(partToken || '').match(/^phan-([1-9][0-9]{0,2})$/);
    if (!part || Number(part[1]) !== Number(match[1])) return null;
  }
  return { bookSlug, chapterNo: Number(match[1]) };
}

export function ChapterDetail({ bookSlug }) {
  const params = useParams();
  const token = params.item || params.chapter;
  const resolved = chapterLinkFromParams(bookSlug, token, params.part);
  const chapter = useResource(resolved ? apiUrl('/books/' + resolved.bookSlug + '/chapters/' + resolved.chapterNo) : null, { list: false, enabled: Boolean(resolved) });
  usePageMeta(chapter.status === 'success' ? chapter.data.title : null, chapter.status === 'success' ? chapter.data.excerpt || chapter.data.bookTitle : null);
  if (!resolved) return <main className="container content-page"><StatusPanel status="empty" title="Đường dẫn chương không hợp lệ"/></main>;
  if (chapter.status === 'loading') return <main className="container content-page"><StatusPanel status="loading" kind="articles"/></main>;
  if (chapter.status === 'error') return <main className="container content-page"><Breadcrumbs items={[{ label: 'Tủ sách', to: '/tu-sach' }]}/><StatusPanel status="error" title={chapter.error?.status === 404 ? 'Chương chưa được xuất bản' : 'Chưa thể tải chương'} description={chapter.error?.status === 404 ? 'Chương chưa công khai hoặc chưa đến lịch. Nội dung chưa xuất bản được bảo vệ.' : chapter.error?.message} onRetry={chapter.error?.status === 404 ? undefined : chapter.retry}/><Link className="text-link" to="/tu-sach">Về tủ sách <Icon name="arrow" size={16}/></Link></main>;
  const data = chapter.data;
  const previous = data.previous;
  const next = data.next;
  return <>
    <PublishedArticleSchema data={data}/>
    <main className="article-page">
      <div className="container article-page-head">
        <Breadcrumbs items={[{ label: 'Tủ sách', to: '/tu-sach' }, { label: data.bookTitle, to: '/tu-sach/' + data.bookSlug }, { label: data.displayLabel || 'Chương ' + data.chapterNo }]}/>
        <span className="eyebrow">{data.contentLabelVi} · {data.displayLabel}</span>
        <h1>{data.title}</h1>
        {data.excerpt && <p className="article-deck">{data.excerpt}</p>}
        <div className="article-byline"><div className="author-avatar" aria-hidden="true"><Icon name="book" size={20}/></div><div><strong>{data.bookTitle}</strong><span>{formatDate(data.publishedAt)}</span></div></div>
      </div>
      <div className="container article-layout">
        <article className="article-content"><Markdown body={data.body}/>{Array.isArray(data.sources) && data.sources.length > 0 && <section className="article-sources"><h2>Nguồn tham khảo</h2><ol>{data.sources.map((source, index) => <li key={index}>{safeSourceUrl(source.url) ? <a href={safeSourceUrl(source.url)} target="_blank" rel="noopener noreferrer">{source.title} <Icon name="upRight" size={14}/></a> : source.title}{source.citation ? ' — ' + source.citation : ''}</li>)}</ol></section>}</article>
        <aside className="article-aside"><div className="side-panel"><span className="eyebrow">TỦ SÁCH</span><h3>{data.bookTitle}</h3><BookLabel value={data.contentLabelVi}/><p className="side-caption">Chỉ chương đã được duyệt và xuất bản mới hiển thị tại đây.</p><Link className="text-link" to={'/tu-sach/' + data.bookSlug}>Danh sách chương <Icon name="arrow" size={16}/></Link></div></aside>
      </div>
      <div className="container public-chapter-navigation">
        {previous ? <Link to={chapterPath(data.bookSlug, previous.chapterNo)}><small>CHƯƠNG TRƯỚC</small><strong>{previous.displayLabel}</strong></Link> : <span/>}
        {next ? <Link to={chapterPath(data.bookSlug, next.chapterNo)}><small>CHƯƠNG TIẾP</small><strong>{next.displayLabel}</strong></Link> : <span/>}
      </div>
    </main>
  </>;
}

export function FieldNotes() {
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState([]);
  const records = useFieldNotes(null, 12, offset);
  useEffect(() => {
    if (records.status !== 'success' || records.meta?.offset !== offset) return;
    setItems((current) => offset === 0
      ? records.data
      : [...current, ...records.data.filter((item) => !current.some((old) => old.id === item.id))]);
  }, [records.status, records.data, records.meta, offset]);
  const hasMore = records.status === 'success' && Number(records.meta?.total || 0) > offset + records.data.length;

  return <>
    <PageIntro eyebrow="GHI CHÉP / HIỆN TRƯỜNG" title="Hiện trường" description="Từ hiện tượng đến nguyên nhân gốc và mốc nghiệm thu có thể ngăn vấn đề. Ca công khai phải được ẩn danh và có quyền sử dụng tư liệu."/>
    <main className="container content-page">
      <Breadcrumbs items={[{ label: 'Hiện trường' }]}/>
      {records.status === 'loading' && offset === 0 && <StatusPanel status="loading" kind="articles"/>}
      {records.status === 'error' && offset === 0 && <StatusPanel status="error" onRetry={records.retry}/>}
      {items.length > 0 && <>
        <p className="results-count" role="status">{items.length} / {records.meta?.total ?? items.length} ca đã xuất bản</p>
        <div className="public-content-grid">{items.map((item) => <Link className="public-field-card" to={'/hien-truong/' + item.id} key={item.id}>
          <span className="eyebrow">CA ĐÃ ẨN DANH · {formatDate(item.publishedAt)}</span>
          <h2>{item.title}</h2>
          <p>{item.excerpt || item.phenomenon}</p>
          {item.interventionPoint && <small>Điểm chặn: {item.interventionPoint}</small>}
          <span className="text-link">Đọc phân tích <Icon name="arrow" size={16}/></span>
        </Link>)}</div>
      </>}
      {records.status === 'success' && offset === 0 && !records.data.length && <StatusPanel status="empty" title="Chưa có ca hiện trường công khai" description="Kho hiện trường chỉ hiển thị ca đã được duyệt, ẩn danh đơn vị/địa chỉ và xác nhận quyền sử dụng ảnh."/>}
      {records.status === 'error' && offset > 0 && <p className="inline-error" role="alert">{records.error?.message || 'Chưa thể tải thêm ca hiện trường.'} <button type="button" onClick={records.retry}>Thử lại</button></p>}
      {hasMore && <div className="pagination-actions"><button type="button" className="button button--outline" disabled={records.status === 'loading'} onClick={() => setOffset((value) => value + records.data.length)}>{records.status === 'loading' ? 'Đang tải...' : 'Xem thêm ca hiện trường'} <Icon name="arrow" size={17}/></button></div>}
    </main>
  </>;
}

export function FieldNoteDetail() {
  const { id } = useParams();
  const validId = /^[0-9a-f-]{36}$/i.test(id || '');
  const record = useResource(validId ? apiUrl('/field-notes/' + id) : null, { list: false, enabled: validId });
  usePageMeta(record.status === 'success' ? record.data.title : null, record.status === 'success' ? record.data.excerpt || record.data.phenomenon : null);
  if (!validId) return <main className="container content-page"><StatusPanel status="empty" title="Mã ca hiện trường không hợp lệ"/></main>;
  if (record.status === 'loading') return <main className="container content-page"><StatusPanel status="loading" kind="articles"/></main>;
  if (record.status === 'error') return <main className="container content-page"><Breadcrumbs items={[{ label: 'Hiện trường', to: '/hien-truong' }]}/><StatusPanel status="error" title={record.error?.status === 404 ? 'Ca hiện trường không tồn tại' : 'Chưa thể tải ca hiện trường'} description={record.error?.message} onRetry={record.error?.status === 404 ? undefined : record.retry}/></main>;
  const data = record.data;
  const images = Array.isArray(data.images) ? data.images : [];
  return <>
    <PublishedArticleSchema data={data}/>
    <main className="article-page">
      <div className="container article-page-head">
        <Breadcrumbs items={[{ label: 'Hiện trường', to: '/hien-truong' }, { label: data.title }]}/>
        <span className="eyebrow">HIỆN TRƯỜNG / CA ĐÃ XUẤT BẢN</span>
        <h1>{data.title}</h1>
        {data.excerpt && <p className="article-deck">{data.excerpt}</p>}
        <div className="article-byline"><div className="author-avatar"><Icon name="hardhat" size={20}/></div><div><strong>Hồ sơ hiện trường đã ẩn danh</strong><span>{formatDate(data.publishedAt)}</span></div></div>
      </div>
      {images.length > 0 && <div className="container public-field-images">{images.map((image, index) => { const src = safeMediaUrl(image.url); return src ? <figure key={image.id || src}><img src={src} alt={image.caption || 'Ảnh hiện trường đã xác nhận quyền sử dụng ' + (index + 1)} loading="lazy"/>{image.caption && <figcaption>{image.caption}</figcaption>}</figure> : null; })}</div>}
      <div className="container article-layout">
        <article className="article-content">
          <section><h2>Hiện tượng</h2><p>{data.phenomenon}</p></section>
          <section><h2>Nguyên nhân gốc</h2><p>{data.rootCause}</p></section>
          <section><h2>Điểm dừng / nghiệm thu</h2><p>{data.interventionPoint}</p></section>
          {data.body && <Markdown body={data.body}/>}
        </article>
        <aside className="article-aside"><div className="side-panel"><span className="eyebrow">CHI PHÍ SỬA CHỮA</span>
          {data.repairCostAmount !== null && data.repairCostAmount !== undefined && data.repairCostSource ? <><h3>{Number(data.repairCostAmount).toLocaleString('vi-VN')} {data.repairCostCurrency || ''}</h3><p className="side-caption">Nguồn: {data.repairCostSource}</p></> : <p className="side-caption">Hồ sơ công khai không có số chi phí sửa chữa đủ nguồn để công bố.</p>}
        </div></aside>
      </div>
    </main>
  </>;
}

export function Questions() {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const questions = useQuestions(page, 30);
  useEffect(() => {
    if (questions.status !== 'success' || questions.meta?.page !== page) return;
    setItems((current) => page === 1
      ? questions.data
      : [...current, ...questions.data.filter((item) => !current.some((old) => old.id === item.id))]);
  }, [questions.status, questions.data, questions.meta, page]);
  const hasMore = questions.status === 'success' && Number(questions.meta?.total || 0) > page * Number(questions.meta?.limit || 30);

  return <>
    <PageIntro eyebrow="CONSPACE / HỎI ĐÁP" title="Hỏi đáp" description="Câu hỏi được gửi ẩn danh. Chỉ câu hỏi có câu trả lời đã duyệt và xuất bản mới xuất hiện công khai."/>
    <main className="container content-page">
      <Breadcrumbs items={[{ label: 'Hỏi đáp' }]}/>
      <div className="public-qa-actions"><div><span className="eyebrow">BẠN ĐANG GẶP VƯỚNG MẮC?</span><h2>Gửi câu hỏi cho tòa soạn</h2><p>Không cần tạo tài khoản. Bạn có thể chọn ngách phỏng đoán và gửi tối đa năm ảnh.</p></div><Link to="/hoi-dap/gui-cau-hoi" className="button button--primary">Gửi câu hỏi <Icon name="arrow" size={17}/></Link></div>
      {questions.status === 'loading' && page === 1 && <StatusPanel status="loading" kind="articles"/>}
      {questions.status === 'error' && page === 1 && <StatusPanel status="error" onRetry={questions.retry}/>}
      {items.length > 0 && <>
        <p className="results-count" role="status">{items.length} / {questions.meta?.total ?? items.length} câu hỏi đã có câu trả lời công khai</p>
        <div className="public-content-grid">{items.map((item) => <Link className="public-question-card" to={'/hoi-dap/' + item.id} key={item.id}>
          <span className="eyebrow">ĐÃ CÓ CÂU TRẢ LỜI · {formatDate(item.publishedAt)}</span><h2>{item.description}</h2><p>{item.answer}</p>{item.niche && <small>Ngách: {item.niche}</small>}<span className="text-link">Đọc trả lời <Icon name="arrow" size={16}/></span>
        </Link>)}</div>
      </>}
      {questions.status === 'success' && page === 1 && !questions.data.length && <StatusPanel status="empty" title="Chưa có câu trả lời công khai" description="Câu hỏi chưa được trả lời hoặc chưa qua kiểm duyệt sẽ không xuất hiện trên trang này."/>}
      {questions.status === 'error' && page > 1 && <p className="inline-error" role="alert">{questions.error?.message || 'Chưa thể tải thêm câu hỏi.'} <button type="button" onClick={questions.retry}>Thử lại</button></p>}
      {hasMore && <div className="pagination-actions"><button type="button" className="button button--outline" disabled={questions.status === 'loading'} onClick={() => setPage((value) => value + 1)}>{questions.status === 'loading' ? 'Đang tải...' : 'Xem thêm câu hỏi'} <Icon name="arrow" size={17}/></button></div>}
    </main>
  </>;
}

export function QuestionDetail() {
  const { id } = useParams();
  const validId = /^[0-9a-f-]{36}$/i.test(id || '');
  const question = useResource(validId ? apiUrl('/questions/' + id) : null, { list: false, enabled: validId });
  usePageMeta(question.status === 'success' ? 'Hỏi đáp: ' + question.data.description : null, question.status === 'success' ? question.data.description : null);
  if (!validId) return <main className="container content-page"><StatusPanel status="empty" title="Mã câu hỏi không hợp lệ"/></main>;
  if (question.status === 'loading') return <main className="container content-page"><StatusPanel status="loading" kind="articles"/></main>;
  if (question.status === 'error') return <main className="container content-page"><Breadcrumbs items={[{ label: 'Hỏi đáp', to: '/hoi-dap' }]}/><StatusPanel status="error" title={question.error?.status === 404 ? 'Câu hỏi chưa được xuất bản' : 'Chưa thể tải câu hỏi'} description={question.error?.status === 404 ? 'Câu hỏi hoặc câu trả lời chưa đủ điều kiện công khai.' : question.error?.message} onRetry={question.error?.status === 404 ? undefined : question.retry}/></main>;
  const data = question.data;
  const images = Array.isArray(data.images) ? data.images : [];
  return <main className="container content-page">
    <PublishedQuestionSchema data={data}/>
    <Breadcrumbs items={[{ label: 'Hỏi đáp', to: '/hoi-dap' }, { label: 'Câu hỏi đã xuất bản' }]}/>
    <article className="public-question-detail">
      <span className="eyebrow">CÂU HỎI ĐỘC GIẢ · ĐÃ ẨN DANH</span>
      <h1>{data.description}</h1>
      {data.niche && <p className="public-question-niche">Ngách liên quan: <Link to={'/ngach/' + encodeURIComponent(data.niche)}>{data.niche}</Link></p>}
      {images.length > 0 && <div className="public-field-images">{images.map((src, index) => { const url = safeMediaUrl(src); return url ? <figure key={src}><img src={url} alt={'Ảnh câu hỏi đã xác nhận quyền sử dụng ' + (index + 1)} loading="lazy"/></figure> : null; })}</div>}
      <section className="public-answer"><span className="eyebrow">CÂU TRẢ LỜI ĐÃ DUYỆT</span><Markdown body={data.answer}/><p className="public-answer-date">Xuất bản {formatDate(data.publishedAt)}</p></section>
    </article>
  </main>;
}

async function encodeImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Chỉ nhận ảnh JPEG, PNG hoặc WebP.');
  if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error('Mỗi ảnh tối đa 5 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 16384) binary += String.fromCharCode(...bytes.subarray(index, index + 16384));
  return { filename: file.name, mimeType: file.type, data: btoa(binary) };
}

export function QuestionForm() {
  const navigate = useNavigate();
  const niches = useNiches();
  const [description, setDescription] = useState('');
  const [nicheId, setNicheId] = useState('');
  const [files, setFiles] = useState([]);
  const [privateReply, setPrivateReply] = useState(false);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  function chooseFiles(event) {
    const selected = Array.from(event.target.files || []);
    if (selected.length > 5) { setError('Bạn chỉ có thể gửi tối đa năm ảnh.'); setFiles([]); if (fileInputRef.current) fileInputRef.current.value = ''; return; }
    const invalid = selected.find((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024);
    if (invalid) { setError('Mỗi ảnh phải là JPEG, PNG hoặc WebP và không quá 5 MB.'); setFiles([]); if (fileInputRef.current) fileInputRef.current.value = ''; return; }
    setError('');
    setFiles(selected);
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (description.trim().length < 10) { setError('Mô tả cần ít nhất 10 ký tự.'); return; }
    if (privateReply && phone.trim().length < 6) { setError('Vui lòng nhập số điện thoại nếu muốn được trả lời riêng.'); return; }
    setBusy(true);
    try {
      const images = await Promise.all(files.map(encodeImage));
      const payload = {
        description: description.trim(),
        guessedNicheId: nicheId || null,
        requestPrivateReply: privateReply ? 'true' : 'false',
        images,
      };
      if (privateReply) payload.phone = phone.trim();
      const result = await postJson('/questions', payload);
      setSuccess(result.data?.message || 'Câu hỏi đã được tiếp nhận.');
      setDescription('');
      setNicheId('');
      setFiles([]);
      setPrivateReply(false);
      setPhone('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (requestError) {
      setError(requestError.message || 'Chưa thể gửi câu hỏi.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <PageIntro eyebrow="HỎI ĐÁP / GỬI CÂU HỎI" title="Gửi câu hỏi cho CONSPACE" description="Câu hỏi được tiếp nhận ẩn danh. Số điện thoại chỉ được gửi khi bạn chủ động yêu cầu trả lời riêng."/>
    <main className="container content-page">
      <Breadcrumbs items={[{ label: 'Hỏi đáp', to: '/hoi-dap' }, { label: 'Gửi câu hỏi' }]}/>
      {success ? <div className="public-submit-success" role="status"><Icon name="check" size={32}/><h2>Đã tiếp nhận câu hỏi</h2><p>{success}</p><div><Link className="button button--primary" to="/hoi-dap">Về trang Hỏi đáp</Link><button className="button button--outline" type="button" onClick={() => setSuccess('')}>Gửi câu hỏi khác</button></div></div> : <form className="public-question-form" onSubmit={submit}>
        <label htmlFor="question-description">Bạn đang gặp vấn đề gì? <span aria-hidden="true">*</span></label>
        <textarea id="question-description" required minLength={10} maxLength={10000} rows={7} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Mô tả tình huống, điều bạn đã quan sát và câu hỏi cần được làm rõ..."/>
        <div className="public-form-meta"><span>Tối thiểu 10 · tối đa 10.000 ký tự</span><span>{description.length.toLocaleString('vi-VN')} / 10.000</span></div>
        <label htmlFor="question-niche">Ngách bạn phỏng đoán (không bắt buộc)</label>
        <select id="question-niche" value={nicheId} onChange={(event) => setNicheId(event.target.value)}>
          <option value="">Chưa xác định</option>
          {niches.status === 'success' && niches.data.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
        {niches.status === 'error' && <p className="public-form-hint" role="status">Danh mục tạm thời chưa tải được; bạn vẫn có thể gửi câu hỏi mà không chọn ngách.</p>}
        <label htmlFor="question-images">Ảnh minh họa (tối đa 5 ảnh, mỗi ảnh 5 MB)</label>
        <input id="question-images" ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={chooseFiles}/>
        {files.length > 0 && <ul className="public-file-list">{files.map((file) => <li key={file.name + file.size}>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</li>)}</ul>}
        <label className="public-consent-check"><input type="checkbox" checked={privateReply} onChange={(event) => { setPrivateReply(event.target.checked); if (!event.target.checked) setPhone(''); }}/><span>Tôi muốn CONSPACE liên hệ riêng để trả lời câu hỏi này.</span></label>
        {privateReply && <div className="public-private-contact"><label htmlFor="question-phone">Số điện thoại nhận phản hồi <span aria-hidden="true">*</span></label><input id="question-phone" type="tel" autoComplete="tel" minLength={6} maxLength={40} required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Số điện thoại của bạn"/><p>Thông tin được mã hóa khi lưu và chỉ nhân sự được cấp quyền mới có thể xem. Nếu không chọn mục này, số điện thoại không được gửi.</p></div>}
        <p className="public-privacy-note">Không cần đăng ký tài khoản. Câu hỏi và ảnh chỉ được công khai sau khi biên tập xác nhận nội dung và quyền sử dụng. CONSPACE không công bố thông tin liên hệ riêng tư.</p>
        {error && <p className="public-form-error" role="alert">{error}</p>}
        <button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Đang gửi...' : 'Gửi câu hỏi ẩn danh'} <Icon name="arrow" size={17}/></button>
      </form>}
    </main>
  </>;
}

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay || 300);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function useSearchResults(query, page, role) {
  const [state, setState] = useState({ status: 'idle', data: [], meta: null, error: null, loadingMore: false });
  useEffect(() => {
    if (query.length < 2) {
      setState({ status: 'idle', data: [], meta: null, error: null, loadingMore: false });
      return undefined;
    }
    const controller = new AbortController();
    setState((current) => page === 1
      ? { status: 'loading', data: [], meta: null, error: null, loadingMore: false }
      : { ...current, loadingMore: true, error: null });
    getJson(apiUrl('/search', { q: query, type: 'all', limit: 20, page }), { signal: controller.signal })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          status: 'success',
          data: page === 1 ? payload.data : [...current.data, ...payload.data.filter((item) => !current.data.some((old) => old.id === item.id && old.type === item.type))],
          meta: payload.meta || null,
          error: null,
          loadingMore: false,
        }));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState((current) => ({ ...current, status: page === 1 ? 'error' : current.status, error, loadingMore: false }));
      });
    return () => controller.abort();
  }, [query, page]);
  return { ...state, data: sortByLens(state.data, role) };
}

const RESULT_LABELS = { article: 'Bài viết', niche: 'Lĩnh vực', term: 'Thuật ngữ', chapter: 'Chương sách', field_note: 'Hiện trường' };

function resultPath(item) {
  if (item.type === 'article') return '/bai-viet/' + encodeURIComponent(item.slug);
  if (item.type === 'niche') return '/ngach/' + encodeURIComponent(item.slug);
  if (item.type === 'term') return '/tu-dien?q=' + encodeURIComponent(item.title);
  if (item.type === 'chapter') return chapterPath(item.bookSlug, item.chapterNo);
  if (item.type === 'field_note') return '/hien-truong/' + item.id;
  return '/tra-nhanh';
}

export function Lookup() {
  const [params, setParams] = useSearchParams();
  const activeQuery = (params.get('q') || '').trim();
  const [input, setInput] = useState(activeQuery);
  const [page, setPage] = useState(1);
  const { reader } = useReader();
  const debounced = useDebounced(activeQuery, 300);
  const results = useSearchResults(debounced, page, reader);
  useEffect(() => { setInput(activeQuery); setPage(1); }, [activeQuery]);
  function submit(event) {
    event.preventDefault();
    setPage(1);
    if (input.trim()) setParams({ q: input.trim() });
    else setParams({});
  }

  return <>
    <PageIntro eyebrow="TRA NHANH / TÌM ĐÚNG CHỖ" title="Bạn thấy gì, cần xem mục nào?" description="Tìm trong bài viết, ngách, chương sách, ca hiện trường và thuật ngữ đã được xuất bản. Không có tư vấn tự động hoặc kết luận không nguồn."/>
    <main className="container content-page">
      <Breadcrumbs items={[{ label: 'Tra nhanh' }]}/>
      <form className="lookup-search" role="search" onSubmit={submit}>
        <Icon name="search" size={23}/>
        <label className="sr-only" htmlFor="quick-lookup">Từ khóa tra nhanh</label>
        <input id="quick-lookup" type="search" autoComplete="off" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ví dụ: nứt tường, chống thấm, nghiệm thu..."/>
        <button type="submit" className="button button--primary">Tìm kiếm <Icon name="arrow" size={18}/></button>
      </form>
      {!activeQuery && <div className="lookup-intro"><div><Icon name="compass" size={37}/><h2>Bắt đầu từ điều bạn đang thấy.</h2><p>Tra nhanh tìm trong kho nội dung công khai. Kết quả không bao gồm bản nháp, câu hỏi chưa trả lời hoặc hồ sơ chưa duyệt.</p></div><div className="lookup-shortcuts"><Link to="/ngach"><Icon name="grid" size={22}/> Duyệt kho ngách <Icon name="arrow" size={17}/></Link><Link to="/tu-sach"><Icon name="book" size={22}/> Mở tủ sách <Icon name="arrow" size={17}/></Link><Link to="/hoi-dap/gui-cau-hoi"><Icon name="users" size={22}/> Gửi câu hỏi ẩn danh <Icon name="arrow" size={17}/></Link></div></div>}
      {activeQuery.length === 1 && <StatusPanel status="empty" title="Nhập thêm ít nhất một ký tự" description="Tìm kiếm yêu cầu tối thiểu hai ký tự."/>}
      {activeQuery.length >= 2 && results.status === 'loading' && <StatusPanel status="loading" kind="articles"/>}
      {activeQuery.length >= 2 && results.status === 'error' && <StatusPanel status="error" title="Chưa thể tra cứu" description={results.error?.message} onRetry={() => setPage(1)}/>}
      {activeQuery.length >= 2 && results.status === 'success' && <>
        <p className="results-count" role="status">{results.meta?.total ?? results.data.length} kết quả cho “{activeQuery}” · ưu tiên {reader === 'homeowner' ? 'chủ nhà' : reader === 'architect' ? 'kiến trúc sư' : 'nhà thầu'}, không ẩn kết quả của hai phía còn lại</p>
        {results.data.length ? <div className="public-search-results">{results.data.map((item, index) => <Link className="public-search-result" to={resultPath(item)} key={item.type + '-' + item.id}>
          <span className="public-search-type">{RESULT_LABELS[item.type] || 'Nội dung'}</span>
          <span><strong>{item.title}</strong>{item.snippet && <small>{item.snippet}</small>}</span>
          <Icon name="arrow" size={17}/>
        </Link>)}</div> : <StatusPanel status="empty" title="Không tìm thấy kết quả" description="Thử một từ khóa khác hoặc mở kho ngách để duyệt danh mục đã có."/>}
        {results.meta?.hasMore && <div className="pagination-actions"><button type="button" className="button button--outline" disabled={results.loadingMore} onClick={() => setPage((value) => value + 1)}>{results.loadingMore ? 'Đang tải...' : 'Tải thêm kết quả'} <Icon name="arrow" size={17}/></button></div>}
      </>}
    </main>
  </>;
}
