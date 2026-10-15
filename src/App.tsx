import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Building2,
  Camera,
  ChevronRight,
  CircleHelp,
  Clock3,
  Droplets,
  Hammer,
  HardHat,
  Layers3,
  Menu,
  MessageSquareText,
  Newspaper,
  Paintbrush2,
  Plus,
  Ruler,
  Search,
  ShieldCheck,
  UsersRound,
  Wrench,
  X,
  Zap,
} from 'lucide-react';

const knowledgeTracks = [
  {
    number: '01',
    title: 'Chuẩn bị & pháp lý',
    desc: 'Hồ sơ, khảo sát, dự toán, giấy phép, điều kiện khởi công.',
    count: '128 chủ đề',
    icon: Ruler,
  },
  {
    number: '02',
    title: 'Móng & kết cấu',
    desc: 'Đất nền, móng, bê tông, cốt thép, cốp pha và nghiệm thu.',
    count: '246 chủ đề',
    icon: Layers3,
  },
  {
    number: '03',
    title: 'MEP công trình',
    desc: 'Điện, nước, HVAC, PCCC, thiết bị và phối hợp hệ thống.',
    count: '172 chủ đề',
    icon: Zap,
  },
  {
    number: '04',
    title: 'Hoàn thiện',
    desc: 'Xây trát, ốp lát, sơn, chống thấm, cửa và nội thất.',
    count: '214 chủ đề',
    icon: Paintbrush2,
  },
  {
    number: '05',
    title: 'Vận hành & sửa chữa',
    desc: 'Bàn giao, bảo trì, xử lý lỗi và kinh nghiệm sau sử dụng.',
    count: '96 chủ đề',
    icon: Wrench,
  },
];

const dictionaryTerms = [
  ['Bê tông lót', 'Lớp bê tông mác thấp dưới móng, giúp tạo mặt phẳng sạch và ổn định trước khi thi công kết cấu chính.'],
  ['Cốt đai', 'Thép đặt theo phương ngang để giữ cốt dọc, chống cắt và ổn định cấu tạo dầm, cột.'],
  ['Cán nền', 'Tạo lớp vữa phẳng theo cao độ thiết kế trước khi lát, hoàn thiện hoặc chống thấm.'],
  ['Cổ ống', 'Vùng tiếp giáp quanh ống xuyên sàn hoặc tường, thường là điểm cần xử lý chống thấm kỹ.'],
  ['Mạch ngừng', 'Vị trí gián đoạn khi đổ bê tông, cần được bố trí và xử lý đúng để đảm bảo liên kết.'],
  ['Nghiệm thu kín', 'Kiểm tra các phần việc sắp bị che khuất, như cốt thép, đường ống âm hoặc lớp chống thấm.'],
];

const fieldPosts = [
  {
    tag: 'KẾT CẤU',
    title: 'Dầm đang đổ mà gặp mưa lớn: xử lý tại chỗ thế nào để tránh tạo mạch ngừng xấu?',
    author: 'Tuấn Anh · KS hiện trường',
    meta: 'Hà Nội · 42 phút trước',
    replies: 18,
    saves: 41,
    tone: 'rebar',
  },
  {
    tag: 'CHỐNG THẤM',
    title: 'Cổ ống ban công thấm sau 6 tháng — ảnh bóc lớp hoàn thiện và nguyên nhân thực tế.',
    author: 'Huyền Trần · QA/QC',
    meta: 'Đà Nẵng · 2 giờ trước',
    replies: 27,
    saves: 63,
    tone: 'water',
  },
  {
    tag: 'HOÀN THIỆN',
    title: 'Một lỗi rất dễ bị bỏ qua khi nghiệm thu lát gạch khổ lớn ở khu vệ sinh.',
    author: 'Minh Đức · Giám sát',
    meta: 'TP.HCM · 5 giờ trước',
    replies: 12,
    saves: 29,
    tone: 'tile',
  },
];

const contractorNiches = [
  ['Kết cấu & bê tông', '1.284 hồ sơ', Hammer],
  ['Điện nước MEP', '932 hồ sơ', Zap],
  ['Chống thấm', '486 hồ sơ', Droplets],
  ['Nhôm kính & cửa', '521 hồ sơ', Building2],
  ['Sơn & hoàn thiện', '718 hồ sơ', Paintbrush2],
  ['Đội thợ chuyên môn', '2.106 hồ sơ', UsersRound],
];

const questions = [
  ['Bê tông sàn sau bao lâu thì được tháo cây chống?', 'Kết cấu', '34 trả lời'],
  ['Nên test áp đường nước âm tường ở mức bao nhiêu trước khi đóng?', 'MEP', '21 trả lời'],
  ['Tường mới trát bị nứt chân chim: lỗi vật liệu hay quy trình?', 'Hoàn thiện', '46 trả lời'],
  ['Cách đọc nhanh bản vẽ bố trí thép dầm cho người mới ra công trường?', 'Bản vẽ', '38 trả lời'],
];

const news = [
  {
    label: 'VẬT LIỆU',
    title: 'Vật liệu ít phát thải đang thay đổi cách đội thiết kế và thi công lựa chọn cấu kiện.',
    time: '6 phút đọc',
  },
  {
    label: 'CÔNG NGHỆ',
    title: 'BIM ngoài phối hợp thiết kế: những tác vụ hiện trường nào đang thực sự tiết kiệm thời gian?',
    time: '8 phút đọc',
  },
  {
    label: 'QUẢN LÝ',
    title: 'Một checklist giao ca tốt có thể giảm bao nhiêu lỗi lặp lại trên công trường?',
    time: '5 phút đọc',
  },
];

const quickSearches = ['mác bê tông', 'chống thấm cổ ống', 'đọc bản vẽ thép', 'đơn giá nhân công'];

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');

  const dictionaryMatches = useMemo(() => {
    if (!query.trim()) return [];
    const key = query.trim().toLowerCase();
    return dictionaryTerms.filter(([term, definition]) =>
      `${term} ${definition}`.toLowerCase().includes(key),
    );
  }, [query]);

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="ConSpace trang chủ">
          <span className="brand-mark">C</span>
          <span className="brand-word">CONSPACE</span>
          <span className="brand-note">BUILD / KNOW / SHARE</span>
        </a>

        <nav className="desktop-nav" aria-label="Điều hướng chính">
          <a href="#encyclopedia">Bách khoa</a>
          <a href="#dictionary">Từ điển nghề</a>
          <a href="#field">Hiện trường</a>
          <a href="#contractors">Ngách thầu</a>
          <a href="#news">Tin ngành</a>
        </nav>

        <div className="header-actions">
          <button className="ghost-button"><Search size={17} /> Tìm kiếm</button>
          <button className="primary-small"><Plus size={17} /> Chia sẻ</button>
          <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Mở menu">
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>

        {menuOpen && (
          <nav className="mobile-nav">
            <a href="#encyclopedia" onClick={() => setMenuOpen(false)}>Bách khoa</a>
            <a href="#dictionary" onClick={() => setMenuOpen(false)}>Từ điển nghề</a>
            <a href="#field" onClick={() => setMenuOpen(false)}>Hiện trường</a>
            <a href="#contractors" onClick={() => setMenuOpen(false)}>Ngách thầu</a>
            <a href="#news" onClick={() => setMenuOpen(false)}>Tin ngành</a>
          </nav>
        )}
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-gridline" aria-hidden="true" />
          <div className="hero-copy">
            <div className="eyebrow"><HardHat size={15} /> TRI THỨC XÂY DỰNG TỪ HIỆN TRƯỜNG</div>
            <h1>
              Không chỉ đọc về xây dựng.
              <span>Vào nghề cùng người thật, việc thật.</span>
            </h1>
            <p className="hero-lead">
              Một không gian chung cho kỹ sư, kiến trúc sư, nhà thầu, đội thợ và người đang học nghề — để tra cứu đúng, xem ca thực tế và chia sẻ kinh nghiệm đã làm qua.
            </p>

            <div className="search-box">
              <Search size={22} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Hỏi một thuật ngữ, lỗi thi công, vật liệu hoặc công việc..."
                aria-label="Tìm trong ConSpace"
              />
              <kbd>⌘ K</kbd>
            </div>

            {dictionaryMatches.length > 0 && (
              <div className="search-results">
                {dictionaryMatches.slice(0, 3).map(([term, definition]) => (
                  <button key={term}>
                    <strong>{term}</strong>
                    <span>{definition}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="quick-searches">
              <span>Tìm nhanh:</span>
              {quickSearches.map((item) => (
                <button key={item} onClick={() => setQuery(item)}>{item}</button>
              ))}
            </div>
          </div>

          <aside className="hero-board" aria-label="Tổng quan ConSpace">
            <div className="board-topline">
              <span>CONSPACE / LIVE INDEX</span>
              <span className="live-dot">ĐANG MỞ</span>
            </div>
            <div className="board-core">
              <div className="blueprint-mark">
                <span className="bp-axis bp-axis-x" />
                <span className="bp-axis bp-axis-y" />
                <span className="bp-box box-a" />
                <span className="bp-box box-b" />
                <span className="bp-circle" />
                <HardHat size={48} strokeWidth={1.35} />
              </div>
              <p>Kho kiến thức sẽ lớn lên theo từng ca thực tế được cộng đồng ghi lại.</p>
            </div>
            <div className="board-stats">
              <div><strong>1.240+</strong><span>mục kiến thức</span></div>
              <div><strong>386</strong><span>ca hiện trường</span></div>
              <div><strong>92</strong><span>ngách nghề</span></div>
            </div>
            <div className="board-footer">
              <ShieldCheck size={17} />
              <span>Nội dung chuyên môn có thể được cộng đồng phản biện và bổ sung.</span>
            </div>
          </aside>
        </section>

        <section className="signal-strip" aria-label="Danh mục nhanh">
          <a href="#dictionary"><BookOpen size={18} /> Từ điển nghề <span>560 thuật ngữ</span></a>
          <a href="#field"><Camera size={18} /> Ảnh hiện trường <span>có chú giải</span></a>
          <a href="#questions"><CircleHelp size={18} /> Hỏi người trong nghề <span>phản biện mở</span></a>
          <a href="#contractors"><HardHat size={18} /> Ngách thầu <span>theo chuyên môn</span></a>
        </section>

        <section className="section encyclopedia-section" id="encyclopedia">
          <div className="section-heading split-heading">
            <div>
              <div className="eyebrow">BÁCH KHOA THEO VÒNG ĐỜI CÔNG TRÌNH</div>
              <h2>Đi từ lúc chưa đào móng đến lúc bàn giao.</h2>
            </div>
            <p>Không gom kiến thức theo kiểu thư mục khó nhớ. ConSpace bám theo đúng trình tự mà một công trình thực tế đi qua.</p>
          </div>

          <div className="knowledge-list">
            {knowledgeTracks.map((item) => {
              const Icon = item.icon;
              return (
                <a href="#dictionary" className="knowledge-row" key={item.number}>
                  <span className="row-number">{item.number}</span>
                  <span className="row-icon"><Icon size={21} /></span>
                  <span className="row-title">{item.title}</span>
                  <span className="row-desc">{item.desc}</span>
                  <span className="row-count">{item.count}</span>
                  <ArrowUpRight size={19} />
                </a>
              );
            })}
          </div>
        </section>

        <section className="section dictionary-section" id="dictionary">
          <div className="dictionary-head">
            <div className="dictionary-title">
              <span className="big-index">A—Z</span>
              <div>
                <div className="eyebrow">TỪ ĐIỂN NGHỀ</div>
                <h2>Nói đúng tiếng của công trường.</h2>
              </div>
            </div>
            <a className="text-link" href="#top">Mở toàn bộ từ điển <ArrowRight size={17} /></a>
          </div>

          <div className="term-grid">
            {dictionaryTerms.map(([term, definition], index) => (
              <article className="term-item" key={term}>
                <span className="term-index">{String(index + 1).padStart(2, '0')}</span>
                <h3>{term}</h3>
                <p>{definition}</p>
                <button aria-label={`Lưu thuật ngữ ${term}`}><Bookmark size={16} /></button>
              </article>
            ))}
          </div>
        </section>

        <section className="section field-section" id="field">
          <div className="section-heading split-heading field-heading">
            <div>
              <div className="eyebrow"><Camera size={14} /> HIỆN TRƯỜNG HÔM NAY</div>
              <h2>Ảnh thật. Lỗi thật. Cách xử lý thật.</h2>
            </div>
            <div className="field-cta">
              <p>Đăng ảnh từ công trình, khoanh vùng chi tiết và ghi lại cách đội bạn đã xử lý.</p>
              <button className="primary-button"><Plus size={18} /> Đăng ca hiện trường</button>
            </div>
          </div>

          <div className="field-grid">
            {fieldPosts.map((post, index) => (
              <article className="field-card" key={post.title}>
                <div className={`field-visual field-${post.tone}`}>
                  <span className="visual-index">FIELD / {String(index + 1).padStart(2, '0')}</span>
                  <div className="drawing-lines" />
                  {post.tone === 'rebar' && <Layers3 size={56} strokeWidth={1.1} />}
                  {post.tone === 'water' && <Droplets size={56} strokeWidth={1.1} />}
                  {post.tone === 'tile' && <Ruler size={56} strokeWidth={1.1} />}
                  <span className="photo-note">ảnh minh họa khu vực lỗi / chờ media thực tế</span>
                </div>
                <div className="field-body">
                  <span className="content-label">{post.tag}</span>
                  <h3>{post.title}</h3>
                  <div className="author-line"><span>{post.author}</span><span>{post.meta}</span></div>
                  <div className="engagement-line">
                    <span><MessageSquareText size={15} /> {post.replies}</span>
                    <span><Bookmark size={15} /> {post.saves}</span>
                    <button>Xem ca này <ChevronRight size={15} /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section contractor-section" id="contractors">
          <div className="contractor-intro">
            <div className="eyebrow">NGÁCH THẦU / MẠNG LƯỚI CHUYÊN MÔN</div>
            <h2>Tìm đúng người làm đúng việc.</h2>
            <p>
              Không phải một danh bạ “ai cũng nhận tất cả”. Hồ sơ được chia theo năng lực thực tế, loại công trình, địa bàn và ca đã chia sẻ trên ConSpace.
            </p>
            <a className="outline-link" href="#questions">Khám phá mạng lưới <ArrowUpRight size={17} /></a>
          </div>

          <div className="contractor-grid">
            {contractorNiches.map(([name, count, Icon]) => (
              <a href="#questions" className="contractor-item" key={name as string}>
                <span className="contractor-icon"><Icon size={22} /></span>
                <span><strong>{name as string}</strong><small>{count as string}</small></span>
                <ArrowUpRight size={18} />
              </a>
            ))}
          </div>
        </section>

        <section className="section question-section" id="questions">
          <div className="question-left">
            <div className="eyebrow"><MessageSquareText size={14} /> BÀN NGHỀ</div>
            <h2>Một câu hỏi tốt có thể cứu cả một ngày công.</h2>
            <p>Đặt câu hỏi ngắn, kèm ảnh hoặc bản vẽ. Người trả lời có thể phản biện nhau thay vì chỉ thả một đáp án rồi biến mất.</p>
            <button className="primary-button"><CircleHelp size={18} /> Đặt câu hỏi</button>
          </div>

          <div className="question-list">
            {questions.map(([title, category, replies], index) => (
              <a href="#top" className="question-row" key={title}>
                <span className="question-num">Q{String(index + 1).padStart(2, '0')}</span>
                <span className="question-main">
                  <small>{category}</small>
                  <strong>{title}</strong>
                </span>
                <span className="question-replies">{replies}</span>
                <ChevronRight size={18} />
              </a>
            ))}
          </div>
        </section>

        <section className="section news-section" id="news">
          <div className="section-heading news-heading">
            <div>
              <div className="eyebrow"><Newspaper size={14} /> TIN NGÀNH — ĐỌC ĐỂ LÀM</div>
              <h2>Cập nhật có chọn lọc, không chạy theo lượng bài.</h2>
            </div>
            <a className="text-link" href="#top">Xem dòng tin <ArrowRight size={17} /></a>
          </div>

          <div className="news-grid">
            <article className="feature-news">
              <span className="content-label">PHÂN TÍCH / HIỆN TRƯỜNG</span>
              <h3>Vì sao lỗi không nằm ở “tay nghề kém”, mà thường bắt đầu từ cách giao việc?</h3>
              <p>Một góc nhìn về checklist, mốc nghiệm thu, ảnh bàn giao và việc biến kinh nghiệm cá nhân thành quy trình dùng chung cho cả đội.</p>
              <div className="news-meta"><Clock3 size={15} /> 9 phút đọc <span>·</span> Quản lý công trường</div>
              <a href="#top">Đọc bài phân tích <ArrowUpRight size={17} /></a>
            </article>

            <div className="news-list">
              {news.map((item, index) => (
                <article className="news-row" key={item.title}>
                  <span className="news-index">0{index + 1}</span>
                  <div>
                    <span>{item.label}</span>
                    <h3>{item.title}</h3>
                    <small>{item.time}</small>
                  </div>
                  <ArrowUpRight size={18} />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="join-section">
          <div>
            <span className="join-kicker">CONSPACE / CỘNG ĐỒNG TRI THỨC XÂY DỰNG</span>
            <h2>Mỗi người trong nghề đều đang giữ một phần của cuốn bách khoa này.</h2>
          </div>
          <div className="join-copy">
            <p>Chụp một lỗi vừa xử lý. Giải thích một thuật ngữ. Đăng một mẹo nhỏ. Ghi lại một bài học mà người mới vào nghề nên biết.</p>
            <button className="light-button">Tham gia đóng góp <ArrowRight size={18} /></button>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-brand">
          <span className="brand-mark">C</span>
          <div><strong>CONSPACE</strong><span>Construction knowledge, built by the field.</span></div>
        </div>
        <div className="footer-links">
          <a href="#encyclopedia">Bách khoa</a>
          <a href="#dictionary">Từ điển</a>
          <a href="#field">Hiện trường</a>
          <a href="#contractors">Nhà thầu</a>
          <a href="#news">Tin ngành</a>
        </div>
        <span className="footer-copy">© 2026 ConSpace — bản thử nghiệm 0.1</span>
      </footer>
    </div>
  );
}

export default App;
