import { useEffect } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { SessionProvider, LoginPage, RequireAdmin } from './Session.jsx';
import { AdminShell, EmptyState } from './ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { ArticleIndex, ArticleEditor } from './pages/Articles.jsx';
import Reviews from './pages/Reviews.jsx';
import Niches from './pages/Niches.jsx';
import { Books, Chapters } from './pages/Library.jsx';
import { FieldNotes, DictionaryAdmin, Questions } from './pages/Editorial.jsx';
import { Media, Users, Settings } from './pages/System.jsx';
import Audit from './pages/Audit.jsx';
import Connections from './pages/Connections.jsx';
import './admin.css';

function AdminMetadata() {
  const location = useLocation();
  useEffect(() => {
    document.title = `Tòa soạn CONSPACE · Quản trị${location.pathname === '/admin/login' ? ' / Đăng nhập' : ''}`;
    const meta = document.querySelector('meta[name="robots"]') || document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex,nofollow,noarchive';
    if (!meta.isConnected) document.head.appendChild(meta);
    return () => { if (meta.isConnected) meta.remove(); };
  }, [location.pathname]);
  return null;
}

function ProtectedLayout() {
  return <RequireAdmin><AdminShell><Outlet/></AdminShell></RequireAdmin>;
}

function Restricted({ permission, children }) {
  return <RequireAdmin permission={permission}>{children}</RequireAdmin>;
}

export default function AdminApp() {
  return <SessionProvider><div className="cms"><AdminMetadata/><Routes>
    <Route path="/admin/login" element={<LoginPage/>}/>
    <Route path="/admin" element={<ProtectedLayout/>}>
      <Route index element={<Navigate to="dashboard" replace/>}/>
      <Route path="dashboard" element={<Restricted permission="dashboard:read"><Dashboard/></Restricted>}/>
      <Route path="articles" element={<Restricted permission="articles:read"><ArticleIndex/></Restricted>}/>
      <Route path="articles/new" element={<Restricted permission="articles:create"><ArticleEditor/></Restricted>}/>
      <Route path="articles/:id/edit" element={<Restricted permission="articles:read"><ArticleEditor/></Restricted>}/>
      <Route path="reviews" element={<Restricted permission="reviews:read"><Reviews/></Restricted>}/>
      <Route path="niches" element={<Restricted permission="niches:read"><Niches/></Restricted>}/>
      <Route path="books" element={<Restricted permission="books:read"><Books/></Restricted>}/>
      <Route path="chapters" element={<Restricted permission="chapters:read"><Chapters/></Restricted>}/>
      <Route path="field-notes" element={<Restricted permission="field-notes:read"><FieldNotes/></Restricted>}/>
      <Route path="dictionary" element={<Restricted permission="dictionary:read"><DictionaryAdmin/></Restricted>}/>
      <Route path="questions" element={<Restricted permission="questions:read"><Questions/></Restricted>}/>
      <Route path="connections" element={<Restricted permission="connections:read"><Connections/></Restricted>}/>
      <Route path="media" element={<Restricted permission="media:read"><Media/></Restricted>}/>
      <Route path="audit" element={<Restricted permission="audit:read"><Audit/></Restricted>}/>
      <Route path="users" element={<Restricted permission="users:read"><Users/></Restricted>}/>
      <Route path="settings" element={<Restricted permission="settings:read"><Settings/></Restricted>}/>
      <Route path="*" element={<div className="cms-not-found"><EmptyState title="Không tìm thấy trang quản trị" description="Địa chỉ bạn mở không tồn tại trong CMS." icon="alert"><Link className="cms-btn cms-btn--primary" to="/admin/dashboard">Về tổng quan</Link></EmptyState></div>}/>
    </Route>
    <Route path="*" element={<Navigate to="/admin/login" replace/>}/>
  </Routes></div></SessionProvider>;
}
