export const READERS = [
  {
    id: 'homeowner', label: 'Chủ nhà', short: 'Chủ nhà', heading: 'Tôi sắp xây nhà',
    description: 'Hiểu đúng trước khi bắt đầu. Biết điều gì cần hỏi, cần kiểm tra và cần lưu ý.',
    detail: 'Những câu hỏi thiết thực, diễn giải dễ hiểu để bạn chủ động với ngôi nhà của mình.',
    icon: 'home', number: '01',
  },
  {
    id: 'architect', label: 'Kiến trúc sư', short: 'KTS', heading: 'Tôi là kiến trúc sư',
    description: 'Nhìn rõ điểm giao giữa thiết kế, hiện trường và những người cùng thực hiện.',
    detail: 'Góc nhìn của người thiết kế: lựa chọn, phối hợp chuyên môn và điểm dừng kiểm tra.',
    icon: 'draft', number: '02',
  },
  {
    id: 'contractor', label: 'Nhà thầu', short: 'Nhà thầu', heading: 'Tôi là nhà thầu',
    description: 'Có tiếng nói về áp lực nghề, quy trình thi công và cách làm việc có trách nhiệm.',
    detail: 'Góc nhìn của người trực tiếp thi công: tình huống thực tế, phối hợp và chuẩn nghề.',
    icon: 'hardhat', number: '03',
  },
];

export const DESIGN_AREAS = ['HOUSE', 'LUXURY', 'F&B', 'STAY', 'OFFICE', 'PROJECT', 'FACTORY', 'SACRED'];

export const PRIMARY_NAV = [
  { to: '/tu-sach', label: 'Tủ sách' },
  { to: '/ngach', label: 'Kho 38 ngách' },
  { to: '/hien-truong', label: 'Hiện trường' },
  { to: '/tu-dien', label: 'Từ điển nghề' },
  { to: '/ban-nghe', label: 'Bàn nghề' },
  { to: '/tra-cuu', label: 'Tra cứu' },
];

export const BOOKS = [
  {
    key: 'cam-nang', title: 'Cẩm nang Kiến trúc Hòa Lạc',
    subtitle: 'Một hệ thống tra cứu cho người chuẩn bị xây dựng.',
    label: 'Tài liệu tra cứu', audience: 'Chủ nhà', index: '01', icon: 'blueprint',
  },
  {
    key: 'phan-nha-thau', title: 'Phận nhà thầu xây dựng',
    subtitle: 'Câu chuyện người làm nghề qua hành trình của một công trình.',
    label: 'Phi hư cấu', audience: 'Nhà thầu', index: '02', icon: 'hardhat',
  },
  {
    key: 'quan-quanh', title: 'Quẩn quanh KTS',
    subtitle: 'Những băn khoăn và lựa chọn trên đường làm kiến trúc.',
    label: 'Tự sự, có hư cấu', audience: 'Kiến trúc sư', index: '03', icon: 'draft',
  },
];

export const SECTION_LINKS = [
  { to: '/tu-sach', title: 'Tủ sách', eyebrow: 'ĐỌC SÂU', icon: 'book', description: 'Ba đầu sách, ba cách kể về một ngành nghề.' },
  { to: '/hien-truong', title: 'Hiện trường', eyebrow: 'QUAN SÁT', icon: 'hardhat', description: 'Nhìn hiện tượng, lần về nguyên nhân và mốc kiểm tra.' },
  { to: '/tu-dien', title: 'Từ điển nghề', eyebrow: 'HIỂU THUẬT NGỮ', icon: 'layers', description: 'Tra thuật ngữ từ nội dung đã được biên tập.' },
  { to: '/ban-nghe', title: 'Bàn nghề', eyebrow: 'GÓC NHÌN', icon: 'users', description: 'Cùng một nghề, những trải nghiệm khác nhau.' },
  { to: '/tra-cuu', title: 'Tra cứu', eyebrow: 'TÌM ĐÚNG CHỖ', icon: 'search', description: 'Tìm trong danh mục và từ điển nghề.' },
];

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
}

export function foldVietnamese(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

export function safeMediaUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
