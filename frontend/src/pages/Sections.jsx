import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BOOKS, foldVietnamese, SECTION_LINKS } from '../config.js';
import { useNiches, useTerms } from '../hooks/useResources.js';
import { BookCard, Breadcrumbs, PageIntro, SectionHeading, StatusPanel } from '../components/UI.jsx';
import { Icon } from '../components/Icons.jsx';

export function Library() {
  return <><PageIntro eyebrow="CONSPACE / THƯ VIỆN BIÊN TẬP" title="Tủ sách" description="Ba đầu sách mở ra ba lối vào nghề xây dựng: tài liệu tra cứu, chuyện người thi công và tự sự của kiến trúc sư."/><main className="container content-page"><Breadcrumbs items={[{ label: 'Tủ sách' }]}/><div className="section-inline-note"><Icon name="info" size={19}/><p>Đây là giới thiệu các đầu sách theo hồ sơ biên tập. Chương sách chỉ xuất hiện trên website sau khi được xuất bản; hiện API chưa cung cấp danh sách chương.</p></div><div className="book-list">{BOOKS.map((book) => <BookCard book={book} key={book.key}/>)}</div><div className="library-bottom"><div><span className="eyebrow">ĐỌC TIẾP</span><h2>Từ trang sách đến câu chuyện công trình</h2><p>Những bài xuất bản trên CONSPACE có thể được liên kết chéo với ngách, hiện trường và thuật ngữ chuyên môn.</p></div><Link to="/bai-viet" className="button button--outline">Xem bài đã xuất bản <Icon name="arrow" size={18}/></Link></div></main></>;
}

const FIELD_STEPS = [
  { id: '01', title: 'Hiện tượng', description: 'Ghi nhận đúng điều nhìn thấy, bằng ảnh và mô tả, không suy diễn nguyên nhân.' },
  { id: '02', title: 'Nguyên nhân gốc', description: 'Phân tích có căn cứ để phân biệt biểu hiện và nguyên nhân thực sự.' },
  { id: '03', title: 'Mốc lẽ ra chặn được', description: 'Chỉ ra điểm kiểm tra hoặc nghiệm thu có thể phát hiện vấn đề sớm hơn.' },
  { id: '04', title: 'Chi phí sửa, nếu có nguồn', description: 'Chỉ đưa số liệu khi đã có hồ sơ và căn cứ kiểm chứng.' },
  { id: '05', title: 'Ngách liên quan', description: 'Dẫn người đọc về trang chuyên môn để tìm hiểu kỹ hơn.' },
];

export function FieldNotes() {
  return <><PageIntro eyebrow="GHI CHÉP / HIỆN TRƯỜNG" title="Hiện trường" description="Không chỉ nhìn thấy một lỗi. Điều đáng đọc là vì sao nó xuất hiện, lẽ ra được chặn ở đâu và ba phía đã nhìn nó như thế nào."/><main className="container content-page"><Breadcrumbs items={[{ label: 'Hiện trường' }]}/><div className="field-layout"><div><div className="field-introduction"><span className="eyebrow">CÁCH MỘT CA ĐƯỢC PHÂN TÍCH</span><h2>Từ một dấu hiệu đến nguyên nhân.</h2><p>Đây là cấu trúc biên tập áp dụng cho những ca hiện trường tương lai, không phải các sự cố đã xảy ra. Mỗi ca chỉ được đăng khi có tư liệu được phép sử dụng và đã ẩn danh.</p></div><div className="field-steps">{FIELD_STEPS.map((step) => <div className="field-step" key={step.id}><span>{step.id}</span><div><h3>{step.title}</h3><p>{step.description}</p></div></div>)}</div></div><aside className="field-aside"><div className="field-aside-icon"><Icon name="hardhat" size={38}/></div><span className="eyebrow">SỰ THẬT NGÀNH XÂY</span><h3>Không phán xét từ một bức ảnh.</h3><p>Thông tin kỹ thuật phải có căn cứ. Danh tính chủ nhà, công trình và đơn vị liên quan phải được bảo vệ trước khi công bố.</p><Link to="/quy-tac-noi-dung" className="text-link">Đọc nguyên tắc <Icon name="arrow" size={17}/></Link></aside></div><div className="field-upcoming"><Icon name="folder" size={26}/><div><h3>Kho ca hiện trường đang được chuẩn bị</h3><p>Hợp đồng API Sprint 1 chưa có endpoint ca hiện trường. CONSPACE không hiển thị ca giả, hình giả hoặc thông tin đang chờ kiểm duyệt.</p></div><Link to="/bai-viet" className="button button--outline">Đọc bài đã xuất bản <Icon name="arrow" size={18}/></Link></div></main></>;
}

function useDebounced(value, delay = 320) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function Dictionary() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const debounced = useDebounced(query.trim());
  const terms = useTerms(debounced, debounced.length > 0);
  return <><PageIntro eyebrow="NGÔN NGỮ CỦA NGHỀ" title="Từ điển nghề" description="Thuật ngữ được giải thích từ dữ liệu biên tập, có kết nối đến các mảng và ngách liên quan. Không tự sinh định nghĩa kỹ thuật."/><main className="container content-page"><Breadcrumbs items={[{ label: 'Từ điển nghề' }]}/><div className="dictionary-search"><Icon name="search" size={23}/><label className="sr-only" htmlFor="term-search">Tìm thuật ngữ ngành xây dựng</label><input id="term-search" type="search" autoComplete="off" value={query} onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })} placeholder="Nhập thuật ngữ cần hiểu..."/><span className="dictionary-hint">TRA CỨU NGUỒN THẬT</span></div>{query.trim() && debounced !== query.trim() ? <StatusPanel status="loading" kind="articles"/> : !debounced ? <div className="search-invitation"><Icon name="book" size={38}/><h2>Tra một từ, hiểu thêm một công việc.</h2><p>Nhập thuật ngữ cần tìm. Kết quả hiển thị trực tiếp từ kho từ điển đã được biên tập.</p></div> : terms.status === 'success' && terms.data.length ? <><p className="results-count" role="status">{terms.data.length} thuật ngữ tìm thấy</p><div className="terms-grid">{terms.data.map((term) => <article key={term.id} className="term-card"><div className="term-card-head"><Icon name="layers" size={21}/><span>THUẬT NGỮ</span></div><h2>{term.term}</h2><p>{term.definition}</p>{Array.isArray(term.niches) && term.niches.length > 0 && <div className="term-tag-row">{term.niches.map((slug) => <Link key={slug} to={`/ngach/${encodeURIComponent(slug)}`}>{slug}<Icon name="upRight" size={14}/></Link>)}</div>}</article>)}</div></> : <StatusPanel status={terms.status === 'success' ? 'empty' : terms.status} onRetry={terms.retry} title={terms.status === 'success' ? 'Chưa tìm thấy thuật ngữ' : undefined} description={terms.status === 'success' ? 'Hãy thử một cách viết khác. CONSPACE chỉ hiển thị những định nghĩa đã được đưa vào kho nội dung.' : undefined}/>}</main></>;
}

export function Lookup() {
  const [params, setParams] = useSearchParams();
  const activeQuery = (params.get('q') || '').trim();
  const [input, setInput] = useState(activeQuery);
  const navigate = useNavigate();
  const niches = useNiches();
  const terms = useTerms(activeQuery, Boolean(activeQuery));
  useEffect(() => { setInput(activeQuery); }, [activeQuery]);
  const matchingNiches = useMemo(() => {
    if (!activeQuery || niches.status !== 'success') return [];
    const term = foldVietnamese(activeQuery);
    return niches.data.filter((n) => foldVietnamese(`${n.name} ${n.summary || ''}`).includes(term));
  }, [activeQuery, niches.status, niches.data]);
  const submit = (event) => { event.preventDefault(); navigate(input.trim() ? `/tra-cuu?q=${encodeURIComponent(input.trim())}` : '/tra-cuu'); };
  return <><PageIntro eyebrow="TÌM ĐÚNG NƠI / TRA CỨU" title="Tra cứu tri thức" description="Gõ tên thuật ngữ hoặc lĩnh vực. Tìm kiếm từ điển trên máy chủ, đối chiếu danh mục ngách đã được xuất bản. Không tự đưa ra kết luận pháp lý hay kỹ thuật."/><main className="container content-page"><Breadcrumbs items={[{ label: 'Tra cứu' }]}/><form className="lookup-search" role="search" onSubmit={submit}><Icon name="search" size={23}/><label className="sr-only" htmlFor="lookup-search">Từ khóa tra cứu</label><input id="lookup-search" type="search" autoComplete="off" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Bạn muốn biết điều gì?"/><button type="submit" className="button button--primary">Tìm kiếm <Icon name="arrow" size={18}/></button></form>{!activeQuery ? <div className="lookup-intro"><div><Icon name="compass" size={37}/><h2>Bắt đầu từ một câu hỏi.</h2><p>Hiện tra cứu hỗ trợ hai nguồn đã được định nghĩa trong hợp đồng API: thuật ngữ và danh mục lĩnh vực. Tra cứu toàn văn và tư vấn tự động chưa được mở.</p></div><div className="lookup-shortcuts"><Link to="/ngach"><Icon name="grid" size={22}/> Duyệt kho 38 ngách <Icon name="arrow" size={17}/></Link><Link to="/tu-dien"><Icon name="book" size={22}/> Mở từ điển nghề <Icon name="arrow" size={17}/></Link></div></div> : <div className="lookup-results"><p className="results-count">Kết quả phù hợp với “{activeQuery}”</p><div className="lookup-result-group"><SectionHeading eyebrow="DANH MỤC" title="Lĩnh vực liên quan"/>{niches.status === 'success' && matchingNiches.length ? <div className="lookup-niche-list">{matchingNiches.map((niche) => <Link key={niche.id} to={`/ngach/${encodeURIComponent(niche.slug)}`}><span className="lookup-result-icon"><Icon name={niche.group === 'design' ? 'draft' : 'hardhat'} size={20}/></span><span><strong>{niche.name}</strong><small>{niche.group === 'design' ? 'Mảng kiến trúc' : 'Ngách thi công'}</small></span><Icon name="upRight" size={17}/></Link>)}</div> : <StatusPanel compact status={niches.status === 'success' ? 'empty' : niches.status} onRetry={niches.retry} title={niches.status === 'success' ? 'Không có lĩnh vực phù hợp' : undefined}/>}</div><div className="lookup-result-group"><SectionHeading eyebrow="TỪ ĐIỂN NGHỀ" title="Thuật ngữ liên quan"/>{terms.status === 'success' && terms.data.length ? <div className="lookup-term-list">{terms.data.map((term) => <div key={term.id}><strong>{term.term}</strong><p>{term.definition}</p></div>)}</div> : <StatusPanel compact status={terms.status === 'success' ? 'empty' : terms.status} onRetry={terms.retry} title={terms.status === 'success' ? 'Không tìm thấy định nghĩa phù hợp' : undefined}/>}</div></div>}</main></>;
}

export function About() {
  return <><PageIntro eyebrow="VỀ CONSPACE / ĐỘC LẬP BIÊN TẬP" title="Đọc được câu chuyện của nhau." description="CONSPACE là nền tảng nội dung và tri thức xây dựng, nơi chủ nhà, kiến trúc sư và nhà thầu có thể nhìn cùng một sự việc từ ba phía."/><main className="container content-page"><Breadcrumbs items={[{ label: 'Về CONSPACE' }]}/><section className="about-manifesto"><span className="eyebrow">TUYÊN NGÔN BIÊN TẬP</span><h2>Chúng tôi chọn làm một tòa soạn. Không làm kênh quảng cáo.</h2><p>CONSPACE do Công ty Cổ phần XSPACE Việt Nam vận hành. XSPACE cung cấp nguồn lực vận hành, nhưng mục tiêu kinh doanh không được quyết định kết luận biên tập. Nội dung không phải lời chào bán dịch vụ thiết kế hoặc thi công. Mọi khẳng định cần có nguồn và bối cảnh kiểm chứng.</p></section><div className="about-columns"><div><span>01</span><h3>Người chuẩn bị xây nhà</h3><p>Được giải thích bằng ngôn ngữ dễ hiểu, biết câu nào cần hỏi và mốc nào cần kiểm tra.</p></div><div><span>02</span><h3>Người làm kiến trúc</h3><p>Có chỗ để nói thật về lựa chọn thiết kế, giới hạn nghề và trách nhiệm phối hợp.</p></div><div><span>03</span><h3>Người thi công</h3><p>Được lắng nghe về áp lực, rủi ro và tiêu chuẩn của người làm nghề tử tế.</p></div></div><section className="about-manifesto"><span className="eyebrow">CƠ CHẾ TÒA SOẠN</span><h2>Người viết không tự duyệt bài của mình.</h2><p><strong>Biên tập viên</strong> tiếp nhận tư liệu, xác minh nguồn, viết và gửi bài. <strong>Người duyệt kỹ thuật</strong> — kỹ sư hoặc giám sát có kinh nghiệm — kiểm tra tính đúng chuyên môn và điểm nghiệm thu. <strong>Chủ bút</strong> quyết định nội dung nhạy cảm và việc xuất bản. <strong>Quản trị hệ thống</strong> quản lý tài khoản, bảo mật và hạ tầng; không mặc nhiên có quyền kết luận chuyên môn hay duyệt bài.</p><p>Ảnh và ghi chép hiện trường chỉ được sử dụng khi có căn cứ quyền sử dụng và đã ẩn danh các bên liên quan. Người cung cấp tư liệu không có quyền quyết định kết luận của bài viết.</p></section><div className="about-next"><div><h2>Minh bạch là điều kiện đầu tiên.</h2><p>Đọc chính sách nội dung và giới hạn mà chúng tôi đặt ra cho mọi bài viết.</p></div><Link to="/quy-tac-noi-dung" className="button button--primary">Nguyên tắc biên tập <Icon name="arrow" size={17}/></Link></div></main></>;
}

const EDITORIAL_RULES = [
  ['Không bài PR trả tiền', 'Không nhận tiền để đăng nội dung quảng cáo dưới danh nghĩa biên tập.'],
  ['Không xếp hạng nhà thầu', 'Không tạo danh sách “top uy tín” hay chấm sao từ thông tin thiếu kiểm chứng.'],
  ['Mổ hành vi, không nêu tên', 'Khi phân tích mặt trái, bảo vệ danh tính các bên, không quy kết doanh nghiệp.'],
  ['Mọi khẳng định phải có nguồn', 'Không đoán đơn giá, định mức hoặc quy chuẩn. Sai số liệu là sai lòng tin.'],
  ['Không hù dọa để tạo nhu cầu', 'Giải thích đúng mức rủi ro, nói cả hoàn cảnh người làm nghề và cách phòng tránh.'],
  ['Không chèn bán hàng giữa bài', 'Trải nghiệm đọc và sự độc lập của nội dung phải được ưu tiên.'],
];

export function Principles() {
  return <><PageIntro eyebrow="CONSPACE / QUY TẮC NỘI DUNG" title="Sự thật cần có nguyên tắc." description="Chúng tôi không dùng chữ “sự thật” để giật gân. Mọi bài viết phải có căn cứ, tôn trọng con người và nhìn sự việc từ nhiều phía."/><main className="container content-page"><Breadcrumbs items={[{ label: 'Quy tắc nội dung' }]}/><div className="rules-heading"><span className="eyebrow">SÁU CAM KẾT CÔNG KHAI</span><h2>Điều gì sẽ không xuất hiện trên CONSPACE?</h2></div><div className="rules-list">{EDITORIAL_RULES.map(([name, detail], index) => <div key={name} className="rule-item"><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{name}</h3><p>{detail}</p></div><Icon name="check" size={23}/></div>)}</div><div className="rules-end"><Icon name="info" size={26}/><p>CONSPACE hoạt động như một tòa soạn độc lập về biên tập. Người đọc có thể tìm hiểu cách nội dung được chọn, kiểm chứng và trình bày thông qua các nguyên tắc công khai ở trên.</p></div></main></>;
}

export function NotFound() {
  return <main className="container content-page not-found"><div className="not-found-art">404<span>.</span></div><span className="eyebrow">LẠC ĐƯỜNG RỒI?</span><h1>Trang này không có trong bản đồ.</h1><p>Đường dẫn bạn mở có thể chưa được xuất bản hoặc đã thay đổi.</p><Link to="/" className="button button--primary">Về trang chủ <Icon name="arrow" size={18}/></Link><div className="not-found-links">{SECTION_LINKS.slice(0, 3).map((link) => <Link key={link.to} to={link.to}>{link.title}</Link>)}</div></main>;
}
