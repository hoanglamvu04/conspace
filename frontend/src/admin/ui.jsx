import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ADMIN_NAV, displayStatus, formatAdminDate, ROLES } from './constants.js';
import { useSession, useNotices } from './Session.jsx';

const paths = {
  dashboard: <><rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/></>,
  article: <><rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  review: <><path d="M9 4h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9l6-5Z"/><path d="M9 4v5H3m7 5 2 2 4-4"/></>,
  niches: <><path d="M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/></>,
  book: <><path d="M3 4h7a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H3zM21 4h-5a3 3 0 0 0-3 3v14a3 3 0 0 1 3-3h5z"/></>,
  chapter: <><path d="M5 3h14v18l-7-4-7 4V3Zm4 5h6m-6 4h6"/></>,
  field: <><path d="m12 2 10 7-10 7L2 9l10-7Zm-10 12 10 7 10-7M7 6l10 7"/></>,
  dictionary: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 8h8M8 12h4M8 16h8"/></>,
  question: <><path d="M4 3h16v14H9l-5 4V3Z"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 2h.01"/></>,
  media: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m3 17 5-5 4 4 4-5 5 6"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2H3Zm12-15a3 3 0 0 1 0 6m2 4a5 5 0 0 1 4 5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .32 1.76l-1.9 1.9a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-1 1.47V22h-2.7v-2.2a1.6 1.6 0 0 0-1-1.47 1.6 1.6 0 0 0-1.76.32l-1.9-1.9A1.6 1.6 0 0 0 8 15a1.6 1.6 0 0 0-1.47-1H4v-2.7h2.53a1.6 1.6 0 0 0 1.47-1 1.6 1.6 0 0 0-.32-1.76l1.9-1.9a1.6 1.6 0 0 0 1.76.32 1.6 1.6 0 0 0 1-1.47V3h2.7v2.53a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.76-.32l1.9 1.9a1.6 1.6 0 0 0-.32 1.76 1.6 1.6 0 0 0 1.47 1H22V14h-1.12a1.6 1.6 0 0 0-1.48 1Z"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  left: <path d="m15 18-6-6 6-6"/>,
  right: <path d="m9 18 6-6-6-6"/>,
  chevronDown: <path d="m6 9 6 6 6-6"/>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  close: <path d="M5 5 19 19M19 5 5 19"/>,
  refresh: <><path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4"/></>,
  external: <><path d="M11 5h8v8M19 5l-9 9"/><path d="M18 15v4H5V6h4"/></>,
  shield: <><path d="m12 2 8 4v6c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-4Z"/><path d="m9 12 2 2 4-4"/></>,
  alert: <><path d="M12 3 2 21h20L12 3Zm0 6v5m0 3h.01"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6"/></>,
  edit: <><path d="m4 20 5-.8L20 8a2 2 0 0 0-4-4L5 15l-1 5Z"/></>,
  save: <><path d="M4 3h14l3 3v15H3V3h1Zm3 0v7h10V3M7 21v-8h10v8"/></>,
  logout: <><path d="M10 4H4v16h6M14 7l5 5-5 5m5-5H9"/></>,
};

export function CmsIcon({ name, size = 19, className = '' }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.article}</svg>;
}

export function AdminShell({ children }) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, can, logout } = useSession();
  const { notice } = useNotices();
  const [logoutBusy, setLogoutBusy] = useState(false);
  useEffect(() => { setMobileMenu(false); }, [location.pathname]);
  useEffect(() => {
    if (!mobileMenu) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setMobileMenu(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileMenu]);
  const selected = ADMIN_NAV.find((item) => location.pathname === item.href || location.pathname.startsWith(item.href + '/'));
  const crumbs = location.pathname.startsWith('/admin/articles/') && location.pathname !== '/admin/articles'
    ? [{ label: 'Bài viết', href: '/admin/articles' }, { label: location.pathname.endsWith('/new') ? 'Tạo bài mới' : 'Chỉnh sửa bài' }]
    : [{ label: selected?.label || 'Quản trị' }];
  async function signOut() {
    setLogoutBusy(true);
    try { await logout(); navigate('/admin/login', { replace: true }); }
    catch (error) { notice(error.message, 'error'); }
    finally { setLogoutBusy(false); }
  }
  return <div className="cms-shell">
    <a className="cms-skip" href="#cms-main">Bỏ qua điều hướng</a>
    {mobileMenu && <button type="button" className="cms-sidebar-backdrop" aria-label="Đóng menu" onClick={() => setMobileMenu(false)}/>}
    <aside className={`cms-sidebar ${mobileMenu ? 'is-open' : ''}`} aria-label="Điều hướng quản trị">
      <div className="cms-sidebar-top"><Link to="/admin/dashboard" className="cms-wordmark">CONSPACE<span>.</span><small>EDITORIAL STUDIO</small></Link><button type="button" className="cms-mobile-close" onClick={() => setMobileMenu(false)} aria-label="Đóng menu"><CmsIcon name="close"/></button></div>
      <div className="cms-workspace"><span className="cms-workspace-mark">✳</span><div><strong>Tòa soạn CONSPACE</strong><small>Không gian quản trị nội bộ</small></div><span className="cms-workspace-dot"/></div>
      <nav className="cms-sidebar-links">{ADMIN_NAV.map((item) => can(item.permission) ? <div key={item.href}>{item.section && <div className="cms-sidebar-section">{item.section}</div>}<NavLink to={item.href} end={item.href === '/admin/articles' || item.href === '/admin/niches'} className={({ isActive }) => `cms-nav-item ${isActive ? 'is-active' : ''}`}><CmsIcon name={item.icon}/><span>{item.label}</span>{isActiveNav(item.href, location.pathname) && <span className="cms-nav-line"/>}</NavLink></div> : null)}</nav>
      <div className="cms-sidebar-footer"><div className="cms-sidebar-principle"><span>✳</span><p>Nội dung có nguồn.<br/>Biên tập có trách nhiệm.</p></div><a href="/" target="_blank" rel="noreferrer" className="cms-visit"><CmsIcon name="external" size={16}/> Xem trang public</a></div>
    </aside>
    <div className="cms-body"><header className="cms-topbar"><div className="cms-topbar-left"><button type="button" className="cms-menu-toggle" aria-label="Mở điều hướng quản trị" aria-expanded={mobileMenu} onClick={() => setMobileMenu(!mobileMenu)}><CmsIcon name="menu" size={23}/></button><span className="cms-topbar-kicker">CONSPACE / CMS</span><span className="cms-topbar-separator"/><span className="cms-topbar-current">{selected?.label || 'Quản trị'}</span></div><div className="cms-topbar-right"><span className="cms-environment">● &nbsp; NỘI BỘ</span><div className="cms-account"><span className="cms-account-avatar">{String(user?.displayName || user?.email || 'C').charAt(0).toUpperCase()}</span><div><strong>{user?.displayName || user?.email || 'Tài khoản quản trị'}</strong><small>{ROLES[user?.role] || user?.role || 'Theo quyền Backend'}</small></div></div><button type="button" className="cms-icon-button" onClick={signOut} disabled={logoutBusy} aria-label="Đăng xuất" title="Đăng xuất"><CmsIcon name="logout" size={19}/></button></div></header>
      <main id="cms-main" className="cms-main"><nav className="cms-breadcrumb" aria-label="Breadcrumb"><Link to="/admin/dashboard">Quản trị</Link>{crumbs.map((item, index) => <span key={`${item.label}-${index}`} className="cms-breadcrumb-part"><CmsIcon name="right" size={13}/>{item.href ? <Link to={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}</span>)}</nav>{children}</main>
      <footer className="cms-footer">CONSPACE · Hệ thống biên tập nội bộ <span>Không lưu dữ liệu làm việc chưa gửi lên máy chủ.</span></footer>
    </div>
  </div>;
}

function isActiveNav(href, path) { return path === href || path.startsWith(`${href}/`); }

export function PageHeading({ kicker, title, description, actions, icon }) {
  return <div className="cms-page-heading"><div className="cms-page-heading-title"><div className="cms-overline">{icon && <CmsIcon name={icon} size={15}/>} {kicker || 'CONSPACE / BIÊN TẬP'}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="cms-page-actions">{actions}</div>}</div>;
}

export function Surface({ children, title, description, actions, className = '' }) {
  return <section className={`cms-surface ${className}`}><div className="cms-surface-head">{(title || description) && <div><h2>{title}</h2>{description && <p>{description}</p>}</div>}{actions && <div className="cms-surface-actions">{actions}</div>}</div>{children}</section>;
}

export function EmptyState({ title = 'Chưa có dữ liệu', description = 'Chưa có bản ghi từ máy chủ.', icon = 'article', children }) {
  return <div className="cms-state"><span className="cms-state-icon"><CmsIcon name={icon} size={25}/></span><h3>{title}</h3><p>{description}</p>{children}</div>;
}

export function LoadState({ lines = 4 }) {
  return <div role="status" aria-label="Đang tải dữ liệu" className="cms-loading-table">{Array.from({ length: lines }, (_, i) => <div key={i} className="cms-loading-line"><span className="cms-skeleton cms-skeleton--square"/><span className="cms-skeleton"/><span className="cms-skeleton cms-skeleton--short"/></div>)}</div>;
}

export function DataState({ data, title, empty, icon, children }) {
  if (data.status === 'loading') return <LoadState/>;
  if (data.status === 'error') return <EmptyState title="Không thể tải dữ liệu" description={data.error?.message || 'Backend chưa sẵn sàng.'} icon="alert"><button type="button" className="cms-btn cms-btn--secondary" onClick={data.retry}><CmsIcon name="refresh" size={16}/> Thử lại</button></EmptyState>;
  if (data.status === 'success' && !data.data.length) return <EmptyState title={title || 'Chưa có bản ghi'} description={empty} icon={icon}/>;
  return children;
}

export function Pill({ value }) {
  const lower = String(value || '').toLowerCase();
  const variant = lower.includes('published') || lower.includes('approved') || lower === 'active' ? 'green'
    : lower.includes('reject') || lower.includes('sensitive') || lower.includes('archiv') ? 'red'
      : lower.includes('review') || lower.includes('pending') || lower.includes('schedule') ? 'orange' : 'slate';
  return <span className={`cms-pill cms-pill--${variant}`}><i aria-hidden="true"/>{displayStatus(value)}</span>;
}

export function Pager({ page, setPage, limit, total, hasMore }) {
  const maxPage = Number.isFinite(Number(total)) && total !== null && total !== undefined ? Math.max(1, Math.ceil(Number(total) / limit)) : null;
  const nextPossible = maxPage ? page < maxPage : Boolean(hasMore);
  return <div className="cms-pagination"><span>{maxPage ? `Trang ${page} / ${maxPage} · ${total} bản ghi` : `Trang ${page}`}</span><div><button type="button" className="cms-icon-button" disabled={page <= 1} aria-label="Trang trước" onClick={() => setPage(page - 1)}><CmsIcon name="left" size={17}/></button><button type="button" className="cms-icon-button" disabled={!nextPossible} aria-label="Trang sau" onClick={() => setPage(page + 1)}><CmsIcon name="right" size={17}/></button></div></div>;
}

export function SearchFilters({ query, onQuery, status, onStatus, statuses = [], placeholder = 'Tìm theo tiêu đề hoặc mã…', children }) {
  return <div className="cms-table-tools"><label className="cms-search"><CmsIcon name="search" size={18}/><span className="cms-sr-only">Tìm kiếm</span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder={placeholder}/></label>{onStatus && <select value={status} onChange={(event) => onStatus(event.target.value)} aria-label="Lọc trạng thái"><option value="">Tất cả trạng thái</option>{statuses.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select>}{children}</div>;
}

export function FormField({ label, name, required, help, children, className = '' }) {
  const id = useId();
  const target = name || (isValidElement(children) && children.props.id) || id;
  const control = typeof children === 'function' ? children(target) : isValidElement(children) && ['input', 'select', 'textarea'].includes(children.type) ? cloneElement(children, { id: children.props.id || target }) : children;
  return <div className={`cms-field ${className}`}><label htmlFor={target}>{label}{required && <span className="cms-required"> *</span>}</label>{control}{help && <span className="cms-field-help">{help}</span>}</div>;
}

export function ConfirmDialog({ open, title = 'Xác nhận thao tác', description, confirmText = 'Xác nhận', danger = false, busy = false, onConfirm, onClose }) {
  const cancelRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);
  if (!open) return null;
  return <div className="cms-dialog-layer" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><div className="cms-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cms-dialog-title" aria-describedby="cms-dialog-description"><span className="cms-dialog-icon"><CmsIcon name="alert" size={24}/></span><h2 id="cms-dialog-title">{title}</h2><p id="cms-dialog-description">{description}</p><div className="cms-dialog-actions"><button ref={cancelRef} type="button" className="cms-btn cms-btn--secondary" disabled={busy} onClick={onClose}>Hủy</button><button type="button" className={`cms-btn ${danger ? 'cms-btn--danger' : 'cms-btn--primary'}`} disabled={busy} onClick={onConfirm}>{busy ? 'Đang xử lý…' : confirmText}</button></div></div></div>;
}

export function RowLink({ href, title, description }) {
  return <Link className="cms-row-link" to={href}><strong>{title || 'Chưa có tiêu đề'}</strong>{description && <small>{description}</small>}</Link>;
}

export function Timestamp({ value, withTime = false }) {
  return value ? <time dateTime={value}>{formatAdminDate(value, withTime)}</time> : <span className="cms-muted">—</span>;
}

export function SectionNote({ children, kind = 'info' }) {
  return <div className={`cms-section-note cms-section-note--${kind}`}><CmsIcon name={kind === 'warning' ? 'alert' : 'shield'} size={18}/><p>{children}</p></div>;
}

export function TableWrap({ children }) {
  return <div className="cms-table-scroll"><table className="cms-table">{children}</table></div>;
}

export function PermissionButton({ permission, children, ...rest }) {
  const { can } = useSession();
  if (!can(permission)) return null;
  return <button {...rest}>{children}</button>;
}
