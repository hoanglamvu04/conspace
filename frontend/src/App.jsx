import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ReaderProvider } from './context/ReaderContext.jsx';
import { Footer, Header } from './components/UI.jsx';
import HomeV1 from './pages/HomeV1.jsx';
import { NicheDirectory } from './pages/Niches.jsx';
import NicheDetailV1 from './pages/NicheDetailV1.jsx';
import { ArticleDetail, ArticleIndex } from './pages/Articles.jsx';
import { About, NotFound, Principles } from './pages/Sections.jsx';
import { Contact } from './pages/Contact.jsx';
import { BookIndex, BookDetail, ChapterDetail, FieldNotes, FieldNoteDetail, Questions, QuestionDetail, QuestionForm, Lookup } from './pages/PublicPages.jsx';
import { useSeoMetadata } from './lib/seo.js';

// Separate route bundle: readers never download the private CMS application.
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

const META = {
  '/': ['Một công trình. Ba góc nhìn.', 'Nơi chủ nhà, kiến trúc sư và nhà thầu đọc được câu chuyện của nhau.'],
  '/ngach': ['Kho 38 ngách', 'Bản đồ ngách thi công và mảng kiến trúc đã được xác minh.'],
  '/tu-sach': ['Tủ sách', 'Ba đầu sách và những chương đã được biên tập, duyệt và xuất bản.'],
  '/hien-truong': ['Hiện trường', 'Ca hiện trường đã ẩn danh và xác nhận quyền tư liệu.'],
  '/hoi-dap': ['Hỏi đáp', 'Câu hỏi ẩn danh và câu trả lời đã qua kiểm duyệt.'],
  '/tra-nhanh': ['Tra nhanh', 'Tìm trong bài viết, ngách, chương sách, hiện trường và thuật ngữ đã xuất bản.'],
  '/ban-nghe': ['Bàn nghề', 'Đọc chuyện nghề xây dựng từ chủ nhà, kiến trúc sư và nhà thầu.'],
  '/bai-viet': ['Bài viết', 'Những bài đã xuất bản tại CONSPACE.'],
  '/ve-conspace': ['Về CONSPACE', 'Định vị và tư cách biên tập độc lập của CONSPACE.'],
  '/quy-tac-noi-dung': ['Quy tắc nội dung', 'Các nguyên tắc biên tập công khai của CONSPACE.'],
  '/lien-he': ['Liên hệ', 'Thông tin tổ chức và kênh tiếp nhận câu hỏi biên tập của CONSPACE.'],
};
function DocumentMeta() {
  const { pathname } = useLocation();
  const canonicalPath = ['/tra-cuu', '/tu-dien'].includes(pathname) ? '/tra-nhanh' : pathname;
  const exact = META[canonicalPath];
  const dynamic = pathname.startsWith('/ngach/') ? ['Ngách thi công', 'Hồ sơ ngách thi công đã có nguồn.']
    : pathname.startsWith('/mang/') ? ['Mảng kiến trúc', 'Hồ sơ mảng kiến trúc theo cấu trúc riêng.']
      : pathname.startsWith('/bai-viet/') ? ['Đọc bài viết', 'Bài viết đã xuất bản từ CONSPACE.']
        : pathname.startsWith('/hien-truong/') ? ['Ca hiện trường', 'Hồ sơ hiện trường đã được ẩn danh và xuất bản.']
          : pathname.startsWith('/hoi-dap/') ? ['Hỏi đáp', 'Câu hỏi và câu trả lời đã xuất bản.']
            : pathname.startsWith('/tu-sach/') ? ['Đầu sách', 'Danh sách chương đã được duyệt và xuất bản.']
              : pathname.startsWith('/cam-nang/') || pathname.startsWith('/phan-nha-thau/') || pathname.startsWith('/quan-quanh-kts/') ? ['Chương sách', 'Chương sách đã được duyệt và xuất bản.']
                : null;
  const info = exact || dynamic || ['CONSPACE', 'Sự thật ngành Xây.'];
  const detailRoute = Boolean(dynamic) && pathname !== '/hoi-dap/gui-cau-hoi';
  const known = Boolean(exact || pathname === '/' || pathname === '/hoi-dap/gui-cau-hoi');
  const index = known && pathname !== '/hoi-dap/gui-cau-hoi';
  useSeoMetadata({title:info[0],description:info[1],canonicalPath,index,enabled:!detailRoute});
  return null;
}
function AdminNoIndexMeta(){
  useSeoMetadata({title:'Tòa soạn CONSPACE',description:'Khu quản trị nội bộ CONSPACE.',canonicalPath:'/admin',index:false});
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
    return <><AdminNoIndexMeta/><Suspense fallback={<div role="status" aria-live="polite" style={{ padding: 48, fontFamily: 'sans-serif' }}>Đang tải tòa soạn CONSPACE…</div>}><AdminApp/></Suspense></>;
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
    <Route path="/mang/:slug" element={<NicheDetailV1/>}/>
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
    <Route path="/lien-he" element={<Contact/>}/>
    <Route path="*" element={<NotFound/>}/>
  </Routes></div><Footer/></>;
}
export default function App(){return <BrowserRouter><ReaderProvider><Site/></ReaderProvider></BrowserRouter>;}
