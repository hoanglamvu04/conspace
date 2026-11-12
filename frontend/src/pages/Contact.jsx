import { Link } from 'react-router-dom';
import { PageIntro, Breadcrumbs } from '../components/UI.jsx';
import { Icon } from '../components/Icons.jsx';

export function Contact() {
  return <>
    <PageIntro eyebrow="CONSPACE / THÔNG TIN TỔ CHỨC" title="Liên hệ" description="Thông tin về đơn vị vận hành và kênh tiếp nhận câu hỏi biên tập của CONSPACE."/>
    <main className="container content-page">
      <Breadcrumbs items={[{ label: 'Liên hệ' }]}/>
      <section className="public-contact-panel">
        <span className="eyebrow">ĐƠN VỊ VẬN HÀNH</span>
        <h2>Công ty Cổ phần XSPACE Việt Nam</h2>
        <p>CONSPACE là tòa soạn nội dung độc lập về biên tập. Trang này không phải kênh chào bán dịch vụ thiết kế hoặc thi công.</p>
        <div className="public-contact-note"><Icon name="info" size={21}/><p>Địa chỉ, email và số điện thoại liên hệ trực tiếp chưa có trong nguồn thông tin được xác nhận để công bố trên website. CONSPACE không tự điền thông tin chưa kiểm chứng.</p></div>
        <div className="public-contact-action">
          <div><strong>Câu hỏi về nội dung hoặc một tình huống xây dựng?</strong><span>Bạn có thể gửi câu hỏi ẩn danh. Câu hỏi chỉ được công khai sau khi qua kiểm duyệt.</span></div>
          <Link className="button button--primary" to="/hoi-dap/gui-cau-hoi">Gửi câu hỏi <Icon name="arrow" size={17}/></Link>
        </div>
      </section>
    </main>
  </>;
}
