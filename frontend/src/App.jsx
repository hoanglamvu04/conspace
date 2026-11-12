import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ReaderProvider } from './context/ReaderContext.jsx';
import { Footer, Header } from './components/UI.jsx';
import HomeV1 from './pages/HomeV1.jsx';
import { NicheDirectory } from './pages/Niches.jsx';
import NicheDetailV1 from './pages/NicheDetailV1.jsx';
import { ArticleDetail, ArticleIndex } from './pages/Articles.jsx';
import { About, NotFound, Principles } from './pages/Sections.jsx';
import { BookIndex, BookDetail, ChapterDetail, FieldNotes, FieldNoteDetail, Questions, QuestionDetail, QuestionForm, Lookup } from './pages/PublicPages.jsx';

// Separate route bundle: readers never download the private CMS application.
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

const META = {
  '/': ['Một công trình. Ba góc nhìn.', 'Nơi chủ nhà, kiến trúc sư và nhà thầu đọc được câu chuyện của nhau.'],
  '/ngach': ['Kho 38 ngách', 'Bản đồ lĩnh vực kiến trúc và thi công đã được xác minh.'],
  '/tu-sach': ['Tủ sách', 'Ba đầu sách và những chương đã được biên tập, duyệt và xuất bản.'],
  '/hien-truong': ['Hiện trường', 'Ca hiện trường đã ẩn danh và xác nhận quyền tư liệu.'],
  '/hoi-dap': ['Hỏi đáp', 'Câu hỏi ẩn danh và câu trả lời đã qua kiểm duyệt.'],
  '/tra-nhanh': ['Tra nhanh', 'Tìm trong bài viết, ngách, chương sách, hiện trường và thuật ngữ đã xuất bản.'],
  '/ban-nghe': ['Bàn nghề', 'Đọc chuyện nghề xây dựng từ chủ nhà, kiến trúc sư và nhà thầu.'],
  '/bai-viet': ['Bài viết', 'Những bài đã xuất bản tại CONSPACE.'],
  '/ve-conspace': ['Về CONSPACE', 'Định vị và tư cách biên tập độc lập của CONSPACE.'],
  '/quy-tac-noi-dung': ['Quy tắc nội dung', 'Các nguyên tắc biên tập công khai của CONSPACE.'],
};
function DocumentMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const canonicalPath = ['/tra-cuu', '/tu-dien'].includes(pathname) ? '/tra-nhanh' : pathname;
    const info = META[canonicalPath] || (pathname.startsWith('/ngach/') ? ['Lĩnh vực chuyên môn', 'Tìm hiểu lĩnh vực nghề xây dựng.'] : pathname.startsWith('/bai-viet/') ? ['Đọc bài viết', 'Bài viết đã xuất bản từ CONSPACE.'] : pathname.startsWith('/hien-truong/') ? ['Ca hiện trường', 'Hồ sơ hiện trường đã được ẩn danh và xuất bản.'] : pathname.startsWith('/hoi-dap/') ? ['Hỏi đáp', 'Câu hỏi và câu trả lời đã xuất bản.'] : pathname.startsWith('/tu-sach/') ? ['Chương sách', 'Chương sách đã được duyệt và xuất bản.'] : ['CONSPACE', 'Sự thật ngành Xây.']);
    document.title = `${info[0]} | CONSPACE · Sự thật ngành Xây`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', info[1]);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', document.title);
    const canonical = document.querySelector('link[rel="canonical"]') || document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = `${window.location.origin}${canonicalPath}`;
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
    <Route path="/" element={<HomeV1/>}/>
    <Route path="/tu-sach" element={<BookIndex/>}/>
    <Route path="/tu-sach/:slug" element={<BookDetail/>}/>
    <Route path="/cam-nang/:part/:item" element={<ChapterDetail bookSlug="cam-nang-kien-truc-hoa-lac"/>}/>
    <Route path="/phan-nha-thau/:chapter" element={<ChapterDetail bookSlug="phan-nha-thau-xay-dung"/>}/>
    <Route path="/quan-quanh-kts/:chapter" element={<ChapterDetail bookSlug="quan-quanh-kts"/>}/>
    <Route path="/ngach" element={<NicheDirectory/>}/>
    <Route path="/ngach/:slug" element={<NicheDetailV1/>}/>
    <Route path="/hien-truong" element={<FieldNotes/>}/>
    <Route path="/hien-truong/:id" element={<FieldNoteDetail/>}/>
    <Route path="/hoi-dap" element={<Questions/>}/>
    <Route path="/hoi-dap/gui-cau-hoi" element={<QuestionForm/>}/>
    <Route path="/hoi-dap/:id" element={<QuestionDetail/>}/>
    <Route path="/tra-nhanh" element={<Lookup/>}/>
    <Route path="/tra-cuu" element={<Lookup/>}/>
    <Route path="/tu-dien" element={<Lookup/>}/>
    <Route path="/bai-viet" element={<ArticleIndex/>}/>
    <Route path="/bai-viet/:slug" element={<ArticleDetail/>}/>
    <Route path="/ban-nghe" element={<ArticleIndex isWorkbench/>}/>
    <Route path="/ve-conspace" element={<About/>}/>
    <Route path="/quy-tac-noi-dung" element={<Principles/>}/>
    <Route path="*" element={<NotFound/>}/>
  </Routes></div><Footer/></>;
}
export default function App(){return <BrowserRouter><ReaderProvider><Site/></ReaderProvider></BrowserRouter>;}
