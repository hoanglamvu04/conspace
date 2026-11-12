import { useEffect, useState } from 'react';

const tracks = [
  { title: 'Kho tri thức', desc: 'Bách khoa xây dựng, 38 ngách và tra cứu chuyên môn.' },
  { title: 'Hiện trường', desc: 'Ghi chép, minh chứng và phân tích các ca công trình thật.' },
  { title: 'Bàn nghề', desc: 'Góc nhìn chủ nhà, kiến trúc sư và nhà thầu.' },
];

function useApiHealth() {
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('API unavailable');
        return response.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setStatus(data.ok && data.service === 'conspace-api' ? 'connected' : 'unavailable');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('unavailable');
      });
    return () => controller.abort();
  }, []);

  return status;
}

export default function App() {
  const apiStatus = useApiHealth();

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="CONSPACE trang chủ">
          <span className="brand-glyph" aria-hidden="true">C</span>
          <span>CONSPACE</span>
        </a>
        <span className="stage-tag">GATE 1 / TECHNICAL FOUNDATION</span>
      </header>

      <main className="main">
        <p className="eyebrow">CONSTRUCTION KNOWLEDGE PLATFORM</p>
        <h1>Sự thật ngành <span>Xây.</span></h1>
        <p className="lead">
          Nền tảng tri thức và cộng đồng ngành xây dựng đang được phát triển.
          Đây là trang kiểm thử bộ khung React JSX, chưa phải giao diện sản phẩm chính thức.
        </p>

        <div className="status" role="status" aria-live="polite">
          <span className={'dot dot--' + apiStatus} aria-hidden="true" />
          <span>
            Backend API: {apiStatus === 'checking'
              ? 'đang kiểm tra'
              : apiStatus === 'connected'
                ? 'đã kết nối'
                : 'chưa kết nối'}
          </span>
          <a href="/api/health" target="_blank" rel="noreferrer">Kiểm tra API</a>
        </div>

        <section className="tracks" aria-label="Các khối dự kiến">
          {tracks.map((track) => (
            <article className="track" key={track.title}>
              <span className="track-state">DỰ KIẾN</span>
              <h2>{track.title}</h2>
              <p>{track.desc}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="footer">CONSPACE · Engineering bootstrap · Nội dung thực tế sẽ được quản lý qua CMS</footer>
    </div>
  );
}
