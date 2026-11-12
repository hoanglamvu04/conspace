import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { BOOKS, formatDate, PRIMARY_NAV, READERS, safeMediaUrl } from '../config.js';
import { useReader } from '../context/ReaderContext.jsx';
import { Icon } from './Icons.jsx';

export function Brand({ inverse = false }) {
  return (
    <Link to="/" className={`brand ${inverse ? 'brand--inverse' : ''}`} aria-label="CONSPACE — về trang chủ">
      <span className="brand-icon" aria-hidden="true"><span /></span>
      <span className="brand-wordmark">CONSPACE<span className="brand-dot">.</span><small>SỰ THẬT NGÀNH XÂY</small></span>
    </Link>
  );
}

export function ReaderSwitch({ variant = 'inline', ariaLabel = 'Chọn góc nhìn' }) {
  const { reader, setReader } = useReader();
  return (
    <div className={`reader-switch reader-switch--${variant}`} role="group" aria-label={ariaLabel}>
      {READERS.map((role) => (
        <button type="button" key={role.id} className={`reader-option ${reader === role.id ? 'is-selected' : ''}`} aria-pressed={reader === role.id} onClick={() => setReader(role.id)}>
          {variant === 'cards' && <span className="reader-option-icon"><Icon name={role.icon} size={24} /></span>}
          <span>{variant === 'compact' ? role.short : role.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const location = useLocation();
  const { reader } = useReader();
  useEffect(() => { setMenuOpen(false); setRoleOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!menuOpen && !roleOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') { setMenuOpen(false); setRoleOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen, roleOpen]);
  const selected = READERS.find((role) => role.id === reader);
  return (
    <>
      <div className="utility-strip"><div className="container utility-inner"><span>TRI THỨC XÂY DỰNG TỪ BA GÓC NHÌN</span><Link to="/quy-tac-noi-dung">Nguyên tắc nội dung <Icon name="upRight" size={13} /></Link></div></div>
      <header className="site-header">
        <div className="container header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Điều hướng chính">
            {PRIMARY_NAV.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => {
              const bookPath = location.pathname.startsWith('/tu-sach/') || location.pathname.startsWith('/cam-nang/') || location.pathname.startsWith('/phan-nha-thau/') || location.pathname.startsWith('/quan-quanh-kts/');
              const searchAlias = ['/tra-cuu', '/tu-dien'].includes(location.pathname);
              const active = isActive || (item.to === '/tu-sach' && bookPath) || (item.to === '/tra-nhanh' && searchAlias);
              return `nav-link ${active ? 'is-active' : ''}`;
            }}>{item.label}</NavLink>)}
          </nav>
          <div className="header-actions">
            <Link className="header-search" to="/tra-nhanh" aria-label="Mở tra nhanh"><Icon name="search" size={20} /></Link>
            <div className="header-reader">
              <button type="button" className="role-trigger" aria-expanded={roleOpen} aria-controls="header-role-menu" onClick={() => setRoleOpen((open) => !open)}>
                <span className="role-dot" /><span>{selected?.short}</span><Icon name="chevronDown" size={15} />
              </button>
              {roleOpen && <div id="header-role-menu" className="role-dropdown"><p>ĐỌC VỚI GÓC NHÌN</p><ReaderSwitch variant="compact" /></div>}
            </div>
            <button type="button" className="mobile-menu-button" aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} aria-controls="mobile-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Icon name={menuOpen ? 'close' : 'menu'} size={23} /></button>
          </div>
        </div>
        {menuOpen && <nav className="mobile-nav" id="mobile-menu" aria-label="Điều hướng trên điện thoại"><div className="container">{PRIMARY_NAV.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => {
            const bookPath = location.pathname.startsWith('/tu-sach/') || location.pathname.startsWith('/cam-nang/') || location.pathname.startsWith('/phan-nha-thau/') || location.pathname.startsWith('/quan-quanh-kts/');
            const searchAlias = ['/tra-cuu', '/tu-dien'].includes(location.pathname);
            const active = isActive || (item.to === '/tu-sach' && bookPath) || (item.to === '/tra-nhanh' && searchAlias);
            return `mobile-nav-link ${active ? 'is-active' : ''}`;
          }}>{item.label}<Icon name="chevron" size={16} /></NavLink>)}<div className="mobile-nav-reader"><p>GÓC NHÌN CỦA BẠN</p><ReaderSwitch variant="compact" /></div></div></nav>}
      </header>
    </>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-upper">
        <div className="footer-about"><Brand inverse /><p>Nơi chủ nhà, kiến trúc sư và nhà thầu đọc được câu chuyện của nhau. Nội dung là để hiểu nghề, không phải để quảng cáo.</p></div>
        <div className="footer-nav-group"><p>KHÁM PHÁ</p><Link to="/tu-sach">Tủ sách</Link><Link to="/ngach">Kho 38 ngách</Link><Link to="/hien-truong">Hiện trường</Link><Link to="/hoi-dap">Hỏi đáp</Link><Link to="/tra-nhanh">Tra nhanh</Link></div>
        <div className="footer-nav-group"><p>CONSPACE</p><Link to="/ve-conspace">Về CONSPACE</Link><Link to="/quy-tac-noi-dung">Quy tắc nội dung</Link><Link to="/lien-he">Liên hệ</Link><Link to="/ban-nghe">Bàn nghề</Link></div>
        <div className="footer-principle"><span className="footer-asterisk">✳</span><strong>Nói cả những điều bất lợi cho mình.</strong><p>Đó là cách chúng tôi hiểu hai chữ “sự thật”.</p></div>
      </div>
      <div className="container footer-lower"><span>© {new Date().getFullYear()} CONSPACE · Sự thật ngành Xây</span><span>Vận hành bởi Công ty Cổ phần XSPACE Việt Nam · Độc lập về biên tập</span></div>
    </footer>
  );
}

export function SectionHeading({ eyebrow, title, description, action, to }) {
  return <div className="section-head"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>{action && to && <Link className="text-link" to={to}>{action}<Icon name="upRight" size={18} /></Link>}</div>;
}

export function PageIntro({ eyebrow, title, description, children }) {
  return <div className="page-intro"><div className="container page-intro-inner"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-intro-description">{description}</p>}</div>{children}</div></div>;
}

export function Breadcrumbs({ items }) {
  return <nav className="breadcrumbs" aria-label="Đường dẫn trang"><Link to="/">Trang chủ</Link>{items.map((item, index) => <span key={`${item.label}-${index}`} className="breadcrumb-item"><Icon name="chevron" size={13} />{item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}</span>)}</nav>;
}

export function StatusPanel({ status, onRetry, kind = 'default', title, description, compact = false }) {
  if (status === 'loading') return <div className={`state-loading state-loading--${kind}`} role="status" aria-label="Đang tải nội dung">{[1, 2, 3].map((i) => <div className="skeleton-card" key={i}><div className="skeleton skeleton--line short"/><div className="skeleton skeleton--line"/><div className="skeleton skeleton--line medium"/></div>)}</div>;
  const isError = status === 'error';
  return <div className={`state-panel ${compact ? 'state-panel--compact' : ''}`} role={isError ? 'alert' : 'status'}><div className="state-icon"><Icon name={isError ? 'alert' : 'folder'} size={25} /></div><h3>{title || (isError ? 'Chưa thể tải nội dung' : 'Chưa có nội dung xuất bản')}</h3><p>{description || (isError ? 'Kho dữ liệu đang tạm gián đoạn. Bạn có thể thử kết nối lại.' : 'Nội dung sẽ xuất hiện tại đây sau khi được biên tập và xuất bản.')}</p>{isError && onRetry && <button className="button button--outline button--small" onClick={onRetry} type="button"><Icon name="refresh" size={16} /> Thử lại</button>}</div>;
}

export function ArticleCard({ article, featured = false }) {
  const image = safeMediaUrl(article.coverImage);
  return <article className={`article-card ${featured ? 'article-card--featured' : ''}`}><Link to={`/bai-viet/${encodeURIComponent(article.slug)}`} aria-label={`Đọc bài ${article.title}`} className="article-card-link">
    <div className="article-cover">{image ? <img src={image} alt="" loading="lazy" decoding="async" /> : <div className="article-cover-placeholder"><span className="cover-grid"/><Icon name="note" size={featured ? 42 : 32} strokeWidth={1.2} /><span>CONSPACE / BÀI VIẾT</span></div>}</div>
    <div className="article-card-body"><p className="article-category">BÀI ĐÃ XUẤT BẢN {Array.isArray(article.niches) && article.niches.length ? <span>· {article.niches[0]}</span> : null}</p><h3>{article.title}</h3>{article.excerpt && <p className="article-excerpt">{article.excerpt}</p>}<div className="article-meta"><span>{article.author?.displayName || 'Ban biên tập CONSPACE'}</span>{formatDate(article.publishedAt) && <><span className="meta-dot" /><time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time></>}<Icon className="article-arrow" name="upRight" size={19}/></div></div>
  </Link></article>;
}

export function NicheCard({ niche, index }) {
  const isDesign = niche.group === 'design';
  const destination = (isDesign ? '/mang/' : '/ngach/') + encodeURIComponent(niche.slug);
  return <Link to={destination} className="niche-card"><span className="niche-card-top"><span className="niche-card-code">{isDesign ? 'MẢNG KIẾN TRÚC' : 'NGÁCH THI CÔNG'} {index !== undefined ? ` / ${String(index + 1).padStart(2, '0')}` : ''}</span><Icon name="upRight" size={18} /></span><span className="niche-card-main"><span className="niche-card-icon"><Icon name={isDesign ? 'blueprint' : 'hardhat'} size={24} /></span><strong>{niche.name}</strong>{niche.summary && <span className="niche-card-summary">{niche.summary}</span>}</span><span className="niche-card-bottom">{typeof niche.articleCount === 'number' ? `${niche.articleCount} bài đã xuất bản` : 'Khám phá lĩnh vực'}<Icon name="arrow" size={15} /></span></Link>;
}

export function BookCard({ book }) {
  return <article className={`book-card book-card--${book.key}`}><div className="book-cover"><span className="book-cover-top">CONSPACE / TỦ SÁCH</span><Icon name={book.icon} size={51} strokeWidth={1.15}/><span className="book-cover-rule" /><span className="book-cover-index">{book.index}</span></div><div className="book-detail"><span className="pill-label">{book.label}</span><h3>{book.title}</h3><p>{book.subtitle}</p><span className="book-audience"><Icon name="users" size={15} /> Dành cho {book.audience.toLowerCase()}</span></div></article>;
}

export { BOOKS };
