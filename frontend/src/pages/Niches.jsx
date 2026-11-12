import { useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { foldVietnamese, READERS } from '../config.js';
import { useReader } from '../context/ReaderContext.jsx';
import { useArticles, useNiches } from '../hooks/useResources.js';
import { ArticleCard, Breadcrumbs, NicheCard, PageIntro, ReaderSwitch, SectionHeading, StatusPanel } from '../components/UI.jsx';
import { Icon } from '../components/Icons.jsx';

const GROUPS = [
  { id: 'all', label: 'Tất cả lĩnh vực' },
  { id: 'design', label: 'Mảng kiến trúc' },
  { id: 'construction', label: 'Ngách thi công' },
];

export function NicheDirectory() {
  const [params, setParams] = useSearchParams();
  const group = ['design', 'construction'].includes(params.get('group')) ? params.get('group') : 'all';
  const query = params.get('q') || '';
  const niches = useNiches();
  const filtered = useMemo(() => {
    if (niches.status !== 'success') return [];
    const normalized = foldVietnamese(query.trim());
    return niches.data.filter((item) => (group === 'all' || item.group === group) && (!normalized || foldVietnamese(`${item.name} ${item.summary || ''}`).includes(normalized)));
  }, [niches.status, niches.data, group, query]);
  const update = (next) => {
    const value = new URLSearchParams(params);
    Object.entries(next).forEach(([key, field]) => { if (!field || field === 'all') value.delete(key); else value.set(key, field); });
    setParams(value, { replace: true });
  };

  return <>
    <PageIntro eyebrow="BẢN ĐỒ TRI THỨC / TỐI ĐA 38 LĨNH VỰC" title="Kho 38 ngách" description="Cấu trúc gồm 8 mảng kiến trúc và tối đa 30 ngách thi công. Chỉ hồ sơ đã có nguồn và được kích hoạt mới hiển thị." />
    <main className="container content-page niche-directory"><Breadcrumbs items={[{ label: 'Kho 38 ngách' }]}/>
      <div className="directory-toolbar"><div className="directory-tabs" role="group" aria-label="Lọc nhóm lĩnh vực">{GROUPS.map((item) => <button key={item.id} type="button" className={`directory-tab ${group === item.id ? 'is-active' : ''}`} aria-pressed={group === item.id} onClick={() => update({ group: item.id })}>{item.label}</button>)}</div><div className="filter-input"><Icon name="search" size={19}/><label className="sr-only" htmlFor="niche-search">Tìm theo tên ngách</label><input id="niche-search" type="search" value={query} onChange={(e) => update({ q: e.target.value })} placeholder="Tìm tên lĩnh vực..."/></div></div>
      {niches.status === 'success' && <p className="results-count" role="status">{filtered.length} lĩnh vực phù hợp từ dữ liệu hiện có{query ? ` · “${query}”` : ''}</p>}
      {niches.status === 'success' && filtered.length ? <div className="niche-directory-grid">{filtered.map((item, index) => <NicheCard key={item.id} niche={item} index={index}/>)}</div> : <StatusPanel status={niches.status === 'success' ? 'empty' : niches.status} onRetry={niches.retry} title={niches.status === 'success' ? 'Không tìm thấy lĩnh vực phù hợp' : undefined} description={niches.status === 'success' ? 'Thử một từ khóa khác hoặc mở rộng nhóm danh mục. Những ngách chưa được xác nhận chưa có trong API.' : undefined}/>}<div className="directory-note"><Icon name="info" size={20}/><p>CONSPACE không tự tạo hồ sơ ngách hoặc đếm bài theo kế hoạch. Chỉ các danh mục đã được nhập vào hệ thống mới hiển thị ở đây.</p></div>
    </main>
  </>;
}

export function NicheDetail() {
  const { slug } = useParams();
  const { reader } = useReader();
  const niches = useNiches();
  const niche = niches.status === 'success' ? niches.data.find((item) => item.slug === slug) : null;
  const articles = useArticles(reader, niche?.slug || null, 6);
  const selectedRole = READERS.find((item) => item.id === reader);
  useEffect(() => { if (niche?.name) document.title = `${niche.name} | CONSPACE · Sự thật ngành Xây`; }, [niche?.name]);

  if (niches.status === 'loading') return <main className="container content-page"><StatusPanel status="loading" kind="articles"/></main>;
  if (niches.status === 'error') return <main className="container content-page"><StatusPanel status="error" onRetry={niches.retry}/></main>;
  if (!niche) return <main className="container content-page"><Breadcrumbs items={[{ label: 'Kho 38 ngách', to: '/ngach' }, { label: 'Không tìm thấy' }]}/><StatusPanel status="empty" title="Không tìm thấy ngách này" description="Danh mục có thể chưa được xuất bản hoặc đường dẫn không còn tồn tại."/><Link className="text-link" to="/ngach">Về kho ngách <Icon name="arrow" size={17}/></Link></main>;

  return <><PageIntro eyebrow={niche.group === 'design' ? 'MẢNG THIẾT KẾ KIẾN TRÚC' : 'NGÁCH CHUYÊN MÔN THI CÔNG'} title={niche.name} description={niche.summary || 'Thông tin tổng quan và các bài viết liên quan được cập nhật từ kho dữ liệu CONSPACE.'}><div className="niche-detail-marker"><Icon name={niche.group === 'design' ? 'draft' : 'hardhat'} size={54} strokeWidth={1.1}/></div></PageIntro>
    <main className="container content-page"><Breadcrumbs items={[{ label: 'Kho 38 ngách', to: '/ngach' }, { label: niche.name }]}/><div className="niche-detail-grid"><div className="niche-detail-main"><div className="detail-highlight"><span className="eyebrow">BA PHÍA, MỘT NGÁCH</span><h2>Nhìn lĩnh vực này từ góc của bạn</h2><p>CONSPACE ưu tiên nội dung theo vai trò bạn chọn, đồng thời giữ các góc nhìn khác có thể tiếp cận được. Mọi bài viết đều nằm trên cùng đường dẫn, không tách thành ba phiên bản.</p><ReaderSwitch/></div><div className="reader-context-card"><span className="reader-context-icon"><Icon name={selectedRole.icon} size={29}/></span><div><span className="eyebrow">GÓC NHÌN ĐANG CHỌN</span><h3>{selectedRole.label}</h3><p>{selectedRole.detail}</p></div></div><section className="niche-article-section"><SectionHeading eyebrow="NỘI DUNG LIÊN QUAN" title="Bài viết trong lĩnh vực" description="Những bài được xuất bản cho góc nhìn này, không phải ví dụ minh họa."/>{articles.status === 'success' && articles.data.length ? <><div className="articles-grid articles-grid--two">{articles.data.map((article) => <ArticleCard key={article.id} article={article}/>)}</div>{articles.nextCursor && <button type="button" disabled={articles.loadingMore} onClick={articles.loadMore} className="button button--outline">{articles.loadingMore ? 'Đang tải...' : 'Xem thêm bài viết'}<Icon name="arrow" size={17}/></button>}{articles.error && <p role="alert" className="inline-error">{articles.error.message}</p>}</> : <StatusPanel status={articles.status === 'success' ? 'empty' : articles.status} onRetry={articles.retry} title={articles.status === 'success' ? 'Chưa có bài cho góc nhìn này' : undefined} description={articles.status === 'success' ? 'Khi bài viết được biên tập và xuất bản, chúng sẽ xuất hiện tại đây.' : undefined}/>}</section></div><aside className="niche-sidebar"><div className="side-panel"><span className="eyebrow">THÔNG TIN LĨNH VỰC</span><div className="side-info"><span>Phân nhóm</span><strong>{niche.group === 'design' ? 'Mảng kiến trúc' : 'Ngách thi công'}</strong></div>{typeof niche.articleCount === 'number' && <div className="side-info"><span>Bài đã xuất bản</span><strong>{niche.articleCount}</strong></div>}<div className="side-divider"/><p className="side-caption">Dữ liệu hiển thị lấy từ API công khai của CONSPACE.</p></div><div className="side-panel side-panel--soft"><Icon name="compass" size={27}/><h3>Tìm một lĩnh vực khác?</h3><p>Khám phá bản đồ các mảng kiến trúc và ngách thi công.</p><Link to="/ngach" className="text-link">Kho 38 ngách <Icon name="arrow" size={17}/></Link></div></aside></div></main>
  </>;
}
