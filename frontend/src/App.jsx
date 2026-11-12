import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ReaderProvider } from './context/ReaderContext.jsx';
import { Footer, Header } from './components/UI.jsx';
import Home from './pages/Home.jsx';
import { NicheDetail, NicheDirectory } from './pages/Niches.jsx';
import { ArticleDetail, ArticleIndex } from './pages/Articles.jsx';
import { About, Dictionary, FieldNotes, Library, Lookup, NotFound, Principles } from './pages/Sections.jsx';

// Separate route bundle: readers never download the private CMS application.
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

const META = {
  '/': ['Một công trình. Ba góc nhìn.', 'Nơi chủ nhà, kiến trúc sư và nhà thầu đọc được câu chuyện của nhau.'],
  '/ngach': ['Kho 38 ngách', 'Bản đồ 8 mảng kiến trúc và 30 ngách thi công CONSPACE.'],
  '/tu-sach': ['Tủ sách', 'Ba đầu sách — ba góc nhìn về nghề xây dựng.'],
  '/hien-truong': ['Hiện trường', 'Cách CONSPACE ghi nhận và phân tích những tình huống ngoài công trường.'],
  '/tu-dien': ['Từ điển nghề', 'Tra thuật ngữ chuyên môn từ kho kiến thức được biên tập.'],
  '/ban-nghe': ['Bàn nghề', 'Đọc chuyện nghề xây dựng từ chủ nhà, kiến trúc sư và nhà thầu.'],
  '/bai-viet': ['Bài viết', 'Những bài đã xuất bản tại CONSPACE.'],
  '/tra-cuu': ['Tra cứu', 'Tra cứu thuật ngữ và lĩnh vực xây dựng.'],
  '/ve-conspace': ['Về CONSPACE', 'Định vị và tư cách biên tập độc lập của CONSPACE.'],
  '/quy-tac-noi-dung': ['Quy tắc nội dung', 'Các nguyên tắc biên tập công khai của CONSPACE.'],
};
function DocumentMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const info = META[pathname] || (pathname.startsWith('/ngach/') ? ['Lĩnh vực chuyên môn', 'Tìm hiểu danh mục nghề xây dựng.'] : pathname.startsWith('/bai-viet/') ? ['Đọc bài viết', 'Bài viết từ CONSPACE.'] : ['Không tìm thấy trang', 'CONSPACE — Sự thật ngành Xây.']);
    document.title = `${info[0]} | CONSPACE · Sự thật ngành Xây`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', info[1]);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', document.title);
    const canonical = document.querySelector('link[rel="canonical"]') || document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = `${window.location.origin}${pathname}`;
    if (!canonical.isConnected) document.head.appendChild(canonical);
  }, [pathname]);
  return null;
}
function ScrollManager() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  return null;
}
function Site() {
  const { pathname } = useLocation();
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return <Suspense fallback={<div role="status" aria-live="polite" style={{ padding: 48, fontFamily: 'sans-serif' }}>Đang tải tòa soạn CONSPACE…</div>}><AdminApp/></Suspense>;
  }
  return <><DocumentMeta/><ScrollManager/><a className="skip-link" href="#main-content">Bỏ qua điều hướng, đến nội dung</a><Header/><div id="main-content"><Routes>
    <Route path="/" element={<Home/>}/>
    <Route path="/ngach" element={<NicheDirectory/>}/>
    <Route path="/ngach/:slug" element={<NicheDetail/>}/>
    <Route path="/bai-viet" element={<ArticleIndex/>}/>
    <Route path="/bai-viet/:slug" element={<ArticleDetail/>}/>
    <Route path="/ban-nghe" element={<ArticleIndex isWorkbench/>}/>
    <Route path="/tu-sach" element={<Library/>}/>
    <Route path="/hien-truong" element={<FieldNotes/>}/>
    <Route path="/tu-dien" element={<Dictionary/>}/>
    <Route path="/tra-cuu" element={<Lookup/>}/>
    <Route path="/tra-nhanh" element={<Lookup/>}/>
    <Route path="/ve-conspace" element={<About/>}/>
    <Route path="/quy-tac-noi-dung" element={<Principles/>}/>
    <Route path="*" element={<NotFound/>}/>
  </Routes></div><Footer/></>;
}
export default function App(){return <BrowserRouter><ReaderProvider><Site/></ReaderProvider></BrowserRouter>;}
