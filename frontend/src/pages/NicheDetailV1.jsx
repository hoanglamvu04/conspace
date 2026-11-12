import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { READERS } from '../config.js';
import { useReader } from '../context/ReaderContext.jsx';
import { useResource } from '../hooks/useResources.js';
import { apiUrl } from '../lib/api.js';
import { nicheLayersForRole, chapterPath } from '../lib/contentModel.js';
import { Markdown } from '../components/Markdown.jsx';
import { ArticleCard, Breadcrumbs, PageIntro, ReaderSwitch, SectionHeading, StatusPanel } from '../components/UI.jsx';
import { Icon } from '../components/Icons.jsx';

function LayerAccordion({ role, sections, selected }) {
  const content = nicheLayersForRole(sections, role.id);
  return <details className="public-layer-accordion" open={selected}>
    <summary>
      <span className="public-layer-icon"><Icon name={role.icon} size={22}/></span>
      <span><strong>{role.label}</strong><small>{role.detail}</small></span>
      <span className="public-layer-count">{content.length} khối đã xuất bản</span>
      <Icon name="chevronDown" size={18}/>
    </summary>
    <div className="public-layer-body">
      {content.length ? content.map((section) => <section className="public-layer-section" key={section.sectionNo}>
        <span className="eyebrow">KHỐI {String(section.sectionNo).padStart(2, '0')}</span>
        <h3>{section.title || 'Nội dung chuyên môn'}</h3>
        <Markdown body={section.content}/>
        {section.sourceRef && <p className="public-layer-source"><Icon name="info" size={14}/> Nguồn: {section.sourceRef}</p>}
      </section>) : <div className="public-layer-empty"><Icon name="book" size={25}/><p>Chưa có khối nội dung được xuất bản cho góc nhìn này. Khi có nội dung đủ nguồn và được duyệt, phần này sẽ tự xuất hiện.</p></div>}
    </div>
  </details>;
}

export default function NicheDetailV1() {
  const { slug } = useParams();
  const { reader } = useReader();
  const validSlug = typeof slug === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(slug);
  const resource = useResource(validSlug ? apiUrl('/niches/' + slug) : null, { list: false, enabled: validSlug });
  const niche = resource.status === 'success' ? resource.data : null;
  const selectedRole = READERS.find((item) => item.id === reader) || READERS[0];

  useEffect(() => {
    if (!niche) return;
    document.title = niche.name + ' | CONSPACE · Sự thật ngành Xây';
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute('content', niche.summary || 'Thông tin lĩnh vực từ kho tri thức CONSPACE.');
  }, [niche]);

  if (!validSlug) return <main className="container content-page"><StatusPanel status="empty" title="Đường dẫn lĩnh vực không hợp lệ"/></main>;
  if (resource.status === 'loading') return <main className="container content-page"><StatusPanel status="loading" kind="articles"/></main>;
  if (resource.status === 'error') return <main className="container content-page"><StatusPanel status="error" onRetry={resource.retry} title={resource.error?.status === 404 ? 'Không tìm thấy lĩnh vực' : 'Chưa thể tải lĩnh vực'} description={resource.error?.status === 404 ? 'Lĩnh vực chưa được kích hoạt hoặc không tồn tại.' : resource.error?.message}/></main>;
  if (!niche) return <main className="container content-page"><StatusPanel status="empty" title="Không tìm thấy lĩnh vực"/></main>;

  const isConstruction = niche.group === 'construction';
  const articles = Array.isArray(niche.articles) ? niche.articles : [];
  const fieldNotes = Array.isArray(niche.fieldNotes) ? niche.fieldNotes : [];
  const chapters = Array.isArray(niche.chapters) ? niche.chapters : [];
  const related = Array.isArray(niche.relatedNiches) ? niche.relatedNiches : [];

  return <>
    <PageIntro eyebrow={isConstruction ? 'NGÁCH CHUYÊN MÔN THI CÔNG' : 'MẢNG KIẾN TRÚC'} title={niche.name} description={niche.summary || 'Thông tin và nội dung đã được xuất bản từ kho dữ liệu CONSPACE.'}>
      <div className="niche-detail-marker"><Icon name={isConstruction ? 'hardhat' : 'draft'} size={54} strokeWidth={1.1}/></div>
    </PageIntro>
    <main className="container content-page">
      <Breadcrumbs items={[{ label: 'Kho 38 ngách', to: '/ngach' }, { label: niche.name }]}/>
      <div className="detail-highlight">
        <span className="eyebrow">BA GÓC NHÌN · MỘT ĐƯỜNG DẪN</span>
        <h2>Đọc lĩnh vực này từ góc nhìn của bạn</h2>
        <p>Góc nhìn chỉ thay đổi lớp nội dung được mở sẵn và thứ tự ưu tiên. Không có lớp nào là quyền truy cập; bạn có thể mở cả ba lớp ngay tại trang này.</p>
        <ReaderSwitch/>
      </div>
      <div className="reader-context-card">
        <span className="reader-context-icon"><Icon name={selectedRole.icon} size={29}/></span>
        <div><span className="eyebrow">GÓC NHÌN ĐANG CHỌN</span><h3>{selectedRole.label}</h3><p>{selectedRole.detail}</p></div>
      </div>

      {isConstruction ? <section className="public-layers-section">
        <SectionHeading eyebrow="TEMPLATE A / 12 KHỐI" title="Ba lớp nội dung cùng một trang" description="Chỉ các khối đã có nội dung, nguồn và trạng thái xuất bản mới được hiển thị. Mở thêm góc nhìn khác mà không đổi URL."/>
        <div className="public-layer-stack">{READERS.map((role) => <LayerAccordion key={role.id} role={role} sections={niche.sections || []} selected={reader === role.id}/>)}</div>
      </section> : <section className="public-design-note">
        <span className="eyebrow">TEMPLATE B / MẢNG KIẾN TRÚC</span>
        <h2>Hồ sơ mảng kiến trúc có cấu trúc riêng</h2>
        <p>Không áp dụng 12 khối của ngách thi công cho mảng kiến trúc. Nội dung chuyên sâu chỉ được mở khi có hồ sơ theo cấu trúc riêng và đã xuất bản. Các bài viết, chương sách và ca hiện trường liên quan đang có sẽ hiển thị bên dưới.</p>
      </section>}

      <section className="public-related-content">
        <SectionHeading eyebrow="BÀI VIẾT ĐÃ XUẤT BẢN" title="Đọc sâu trong lĩnh vực"/>
        {articles.length ? <div className="articles-grid">{articles.map((article) => <ArticleCard key={article.id} article={article}/>)}</div> : <StatusPanel status="empty" compact title="Chưa có bài viết công khai trong lĩnh vực này"/>}
      </section>

      <div className="public-content-grid">
        <section>
          <SectionHeading eyebrow="CA ĐÃ ẨN DANH" title="Hiện trường liên quan"/>
          {fieldNotes.length ? <div className="public-link-list">{fieldNotes.map((item) => <Link to={'/hien-truong/' + item.id} key={item.id}><span><strong>{item.title}</strong><small>{item.phenomenon}</small></span><Icon name="arrow" size={17}/></Link>)}</div> : <StatusPanel status="empty" compact title="Chưa có ca hiện trường công khai"/>}
        </section>
        <section>
          <SectionHeading eyebrow="CHƯƠNG ĐÃ XUẤT BẢN" title="Từ tủ sách"/>
          {chapters.length ? <div className="public-link-list">{chapters.map((item) => <Link to={chapterPath(item.bookSlug, item.chapterNo)} key={item.bookSlug + '-' + item.chapterNo}><span><strong>{item.chapterTitle || item.displayLabel}</strong><small>{item.bookTitle || item.bookSlug}</small></span><Icon name="arrow" size={17}/></Link>)}</div> : <StatusPanel status="empty" compact title="Chưa có chương sách liên quan"/>}
        </section>
      </div>

      {related.length > 0 && <section className="public-related-niches"><SectionHeading eyebrow="LIÊN KẾT CHÉO" title="Lĩnh vực có liên quan"/><div className="niche-directory-grid">{related.map((item, index) => <Link className="niche-card" to={'/ngach/' + encodeURIComponent(item.slug)} key={item.id}><span className="niche-card-top"><span className="niche-card-code">{item.group === 'design' ? 'MẢNG KIẾN TRÚC' : 'NGÁCH THI CÔNG'} / {String(index + 1).padStart(2, '0')}</span><Icon name="upRight" size={18}/></span><span className="niche-card-main"><span className="niche-card-icon"><Icon name={item.group === 'design' ? 'draft' : 'hardhat'} size={24}/></span><strong>{item.name}</strong></span><span className="niche-card-bottom">Mở lĩnh vực <Icon name="arrow" size={15}/></span></Link>)}</div></section>}
    </main>
  </>;
}
