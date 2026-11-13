import { Link, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { formatDate, READERS, safeMediaUrl } from '../config.js';
import { useReader } from '../context/ReaderContext.jsx';
import { useArticles, useResource } from '../hooks/useResources.js';
import { apiUrl } from '../lib/api.js';
import { useSeoMetadata } from '../lib/seo.js';
import { Markdown } from '../components/Markdown.jsx';
import { ArticleCard, Breadcrumbs, PageIntro, ReaderSwitch, SectionHeading, StatusPanel } from '../components/UI.jsx';
import { Icon } from '../components/Icons.jsx';

export function ArticleIndex({ isWorkbench = false }) {
  const { reader } = useReader();
  const articles = useArticles(reader, null, 12);
  const role = READERS.find((item) => item.id === reader);
  const title = isWorkbench ? 'Bàn nghề' : 'Bài viết';
  return <><PageIntro eyebrow={isWorkbench ? 'BA GÓC NHÌN / BÀN NGHỀ' : 'DÒNG BÀI / CONSPACE'} title={title} description={isWorkbench ? 'Những điều người làm nghề và người sử dụng công trình cần nghe từ phía còn lại. Đây là không gian đọc và suy ngẫm, chưa phải diễn đàn đăng bài.' : 'Đọc những bài đã qua biên tập và xuất bản từ kho tri thức CONSPACE, ưu tiên cho góc nhìn bạn chọn.'}/><main className="container content-page"><Breadcrumbs items={[{ label: title }]}/><div className="listing-summary"><div><span className="eyebrow">BỘ LỌC GÓC NHÌN</span><h2>Đang đọc như một {role.label.toLowerCase()}</h2><p>Đổi góc nhìn để thay thứ tự ưu tiên bài viết. Các bài công khai vẫn có thể được đọc bởi cả ba phía.</p></div><ReaderSwitch/></div>{articles.status === 'success' && articles.data.length ? <><div className="articles-grid">{articles.data.map((article) => <ArticleCard article={article} key={article.id}/>)}</div>{articles.nextCursor && <div className="pagination-actions"><button type="button" className="button button--outline" onClick={articles.loadMore} disabled={articles.loadingMore}>{articles.loadingMore ? 'Đang tải thêm...' : 'Tải thêm bài viết'} <Icon name="arrow" size={18}/></button></div>}{articles.error && <div role="alert" className="pagination-error">Không tải được trang tiếp theo: {articles.error.message} <button type="button" onClick={articles.loadMore}>Thử lại</button></div>}</> : <StatusPanel status={articles.status === 'success' ? 'empty' : articles.status} onRetry={articles.retry}/>}</main></>;
}

function SourceList({ sources }) {
  if (!Array.isArray(sources) || !sources.length) return null;
  return <section className="article-sources" aria-label="Nguồn tham khảo"><h2>Nguồn tham khảo</h2><ol>{sources.map((source, index) => {
    const label = typeof source === 'string' ? source : source?.title || source?.name || source?.citation || `Nguồn ${index + 1}`;
    const url = typeof source === 'object' && source ? safeMediaUrl(source.url) : null;
    return <li key={index}>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{label}<Icon name="upRight" size={15}/></a> : label}</li>;
  })}</ol></section>;
}

function ArticleStructuredData({ article }) {
  useEffect(() => {
    if (!article) return undefined;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.conspaceSchema = 'article';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Article', headline: article.title,
      description: article.excerpt || undefined,
      datePublished: article.publishedAt || undefined,
      dateModified: article.updatedAt || article.publishedAt || undefined,
      mainEntityOfPage: window.location.href,
      author: article.author?.displayName ? { '@type': 'Person', name: article.author.displayName } : undefined,
      publisher: { '@type': 'Organization', name: 'CONSPACE' },
    }).replace(/</g, '\\u003c');
    document.head.appendChild(script);
    return () => script.remove();
  }, [article]);
  return null;
}

export function ArticleDetail() {
  const { slug } = useParams();
  const { reader } = useReader();
  const validSlug = typeof slug === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(slug);
  const article = useResource(validSlug ? apiUrl(`/articles/${slug}`) : null, { list: false, enabled: validSlug });
  const entry = article.status === 'success' ? article.data : null;
  const related = useArticles(reader, entry?.niches?.[0] || null, 4);
  const image = safeMediaUrl(entry?.coverImage);
  useSeoMetadata({
    title:entry?.title||'Bài viết',
    description:entry?.excerpt||entry?.title||'Bài viết từ CONSPACE.',
    canonicalPath:validSlug?'/bai-viet/'+slug:'/bai-viet',
    index:article.status==='success',
    type:'article',
    image:image||null,
    publishedTime:entry?.publishedAt||null,
    modifiedTime:entry?.updatedAt||entry?.publishedAt||null,
  });
  if (!validSlug) return <main className="container content-page"><StatusPanel status="empty" title="Đường dẫn không hợp lệ" description="Bài viết bạn tìm không tồn tại."/></main>;
  if (article.status === 'loading') return <main className="container content-page"><StatusPanel status="loading" kind="articles"/></main>;
  if (article.status === 'error') return <main className="container content-page"><Breadcrumbs items={[{ label: 'Bài viết', to: '/bai-viet' }, { label: 'Không thể tải' }]}/><StatusPanel status="error" title={article.error?.status === 404 ? 'Bài viết không tồn tại' : 'Không thể mở bài viết'} description={article.error?.status === 404 ? 'Bài có thể chưa được xuất bản hoặc đã được chuyển đi.' : 'Dữ liệu đang gián đoạn, vui lòng thử lại.'} onRetry={article.error?.status === 404 ? undefined : article.retry}/><Link to="/bai-viet" className="text-link">Trở về danh sách bài viết <Icon name="arrow" size={17}/></Link></main>;
  return <><ArticleStructuredData article={entry}/><main className="article-page"><div className="container article-page-head"><Breadcrumbs items={[{ label: 'Bài viết', to: '/bai-viet' }, { label: entry.title }]}/><span className="eyebrow">CONSPACE / BÀI ĐÃ XUẤT BẢN</span><h1>{entry.title}</h1>{entry.excerpt && <p className="article-deck">{entry.excerpt}</p>}<div className="article-byline"><div className="author-avatar" aria-hidden="true"><Icon name="note" size={20}/></div><div><strong>{entry.author?.displayName || 'Ban biên tập CONSPACE'}</strong><span>{formatDate(entry.publishedAt) || 'Bài viết'}</span></div></div></div>{image && <div className="container article-hero-image"><img src={image} alt="" /></div>}<div className="container article-layout"><article className="article-content"><Markdown body={entry.body}/><SourceList sources={entry.sources}/><div className="article-bottom"><span>CONSPACE · Sự thật ngành Xây</span><Link to="/bai-viet" className="text-link">Đọc thêm bài viết <Icon name="arrow" size={17}/></Link></div></article><aside className="article-aside"><div className="side-panel"><span className="eyebrow">TRONG BÀI VIẾT</span><h3>Chủ đề liên quan</h3>{Array.isArray(entry.niches) && entry.niches.length ? <div className="tag-list">{entry.niches.map((tag) => <Link key={tag} to={`/ngach/${encodeURIComponent(tag)}`}>{tag}<Icon name="upRight" size={14}/></Link>)}</div> : <p className="side-caption">Bài viết chưa được gắn với một ngách cụ thể.</p>}</div><div className="side-panel side-panel--soft"><Icon name="book" size={25}/><h3>Cách chúng tôi làm nội dung</h3><p>Không bịa số liệu, không quảng cáo trá hình, không quy kết đơn vị.</p><Link className="text-link" to="/quy-tac-noi-dung">Xem quy tắc <Icon name="arrow" size={16}/></Link></div></aside></div></main>
    {Array.isArray(entry.niches) && entry.niches.length > 0 && related.status === 'success' && related.data.some((a) => a.slug !== entry.slug) && <section className="section section--blue"><div className="container"><SectionHeading eyebrow="ĐỌC TIẾP" title="Bài viết cùng chủ đề"/><div className="articles-grid">{related.data.filter((a) => a.slug !== entry.slug).slice(0, 3).map((a) => <ArticleCard article={a} key={a.id}/>)}</div></div></section>}
  </>;
}
