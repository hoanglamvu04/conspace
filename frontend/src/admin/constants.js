export const ADMIN_BASE = '/admin';

export const ADMIN_NAV = [
  { label: 'Tổng quan', href: '/admin/dashboard', icon: 'dashboard', section: 'TỔNG QUAN', permission: 'dashboard:read' },
  { label: 'Bài viết', href: '/admin/articles', icon: 'article', section: 'BIÊN TẬP', permission: 'articles:read' },
  { label: 'Hàng đợi duyệt', href: '/admin/reviews', icon: 'review', permission: 'reviews:read' },
  { label: 'Kho 38 ngách', href: '/admin/niches', icon: 'niches', section: 'THƯ VIỆN NỘI DUNG', permission: 'niches:read' },
  { label: 'Tủ sách', href: '/admin/books', icon: 'book', permission: 'books:read' },
  { label: 'Chương sách', href: '/admin/chapters', icon: 'chapter', permission: 'chapters:read' },
  { label: 'Hiện trường', href: '/admin/field-notes', icon: 'field', permission: 'field-notes:read' },
  { label: 'Từ điển nghề', href: '/admin/dictionary', icon: 'dictionary', permission: 'dictionary:read' },
  { label: 'Hỏi đáp', href: '/admin/questions', icon: 'question', permission: 'questions:read' },
  { label: 'Thư viện ảnh', href: '/admin/media', icon: 'media', section: 'HỆ THỐNG', permission: 'media:read' },
  { label: 'Người dùng', href: '/admin/users', icon: 'users', permission: 'users:read' },
  { label: 'Cài đặt', href: '/admin/settings', icon: 'settings', permission: 'settings:read' },
];

export const ARTICLE_STATUSES = {
  DRAFT: 'Bản nháp',
  IN_REVIEW: 'Đang duyệt',
  SUBMITTED: 'Đã gửi duyệt',
  NEEDS_CHANGES: 'Cần chỉnh sửa',
  WITHDRAWN: 'Đã thu hồi',
  TECHNICAL_REVIEW: 'Chờ duyệt kỹ thuật',
  TECHNICAL_REVIEW_PENDING: 'Chờ duyệt kỹ thuật',
  EDITOR_IN_CHIEF_REVIEW: 'Chờ chủ bút',
  IN_CHIEF_REVIEW: 'Chờ chủ bút',
  CHANGES_REQUESTED: 'Cần chỉnh sửa',
  APPROVED: 'Đã duyệt',
  SCHEDULED: 'Đã lên lịch',
  PUBLISHED: 'Đã xuất bản',
  REJECTED: 'Đã từ chối',
  ARCHIVED: 'Lưu trữ',
};

export const ROLES = {
  EDITOR: 'Biên tập viên',
  TECHNICAL_REVIEWER: 'Duyệt kỹ thuật',
  EDITOR_IN_CHIEF: 'Chủ bút',
  ADMIN: 'Quản trị viên',
};

export const READER_OPTIONS = [
  { value: 'homeowner', label: 'Chủ nhà' },
  { value: 'architect', label: 'Kiến trúc sư' },
  { value: 'contractor', label: 'Nhà thầu' },
];

export const DESIGN_AREAS = ['HOUSE', 'LUXURY', 'F&B', 'STAY', 'OFFICE', 'PROJECT', 'FACTORY', 'SACRED'];

export const NICHE_BLOCKS = [
  { id: 'scope', name: 'Ngách làm gì / không làm · ai thực hiện', source: 'Cẩm nang 5.xx' },
  { id: 'sequence', name: 'Vị trí trong trình tự công trường', source: 'Cẩm nang 5.xx' },
  { id: 'market', name: 'Nhu cầu thị trường', source: 'Viết mới' },
  { id: 'pricing', name: 'Cấu trúc giá · những câu cần hỏi', source: 'Cẩm nang 5.xx' },
  { id: 'cheapQuote', name: 'Báo giá thấp hơn mặt bằng 20% cắt ở đâu', source: 'Viết mới' },
  { id: 'industryRisks', name: 'Mặt trái ngành · thủ thuật và cơ chế', source: 'Viết mới', sensitive: true },
  { id: 'homeownerPain', name: 'Nỗi đau chủ nhà', source: 'Cẩm nang 5.xx' },
  { id: 'contractorPain', name: 'Nỗi đau nhà thầu ngách', source: 'Cẩm nang 5.xx' },
  { id: 'conflicts', name: 'Điểm giao và xung đột', source: 'Cẩm nang 5.xx' },
  { id: 'solutions', name: 'Giải pháp · mốc chặn và cách làm', source: 'Viết mới' },
  { id: 'checklist', name: 'Dấu hiệu người biết việc · checklist · bảo hành', source: 'Cẩm nang 5.xx' },
  { id: 'siteNotes', name: 'Ghi chép công trường', source: 'Cần bổ sung hồ sơ thực tế' },
];

export const DESIGN_BLOCKS = [
  'Loại công trình này là gì · ranh giới với mảng khác',
  'Đặc thù chỉ loại hình này mới có',
  'Chuỗi ngách tham gia',
  'Quy chuẩn và pháp lý riêng',
  'Rủi ro điển hình',
  'Kiến trúc sư chuyên mảng khác gì KTS chung',
  'Vì sao không giao cho người học nghề trên công trình',
];

export const PERSPECTIVES = [
  { id: 'homeowner', title: 'Chủ nhà', indexes: [0, 2, 3, 4, 6, 10] },
  { id: 'architect', title: 'Kiến trúc sư', indexes: [1, 8, 9] },
  { id: 'contractor', title: 'Nhà thầu', indexes: [0, 5, 7, 8, 9] },
];

export const BOOK_REFERENCES = [
  { title: 'Cẩm nang Kiến trúc Hòa Lạc', label: 'Tài liệu tra cứu' },
  { title: 'Phận nhà thầu xây dựng', label: 'Phi hư cấu' },
  { title: 'Quẩn quanh KTS', label: 'Tự sự, có hư cấu' },
];

export const DATE_FORMAT = new Intl.DateTimeFormat('vi-VN', { year: 'numeric', month: 'short', day: '2-digit' });
export const DATE_TIME_FORMAT = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });

export function formatAdminDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return (withTime ? DATE_TIME_FORMAT : DATE_FORMAT).format(date);
}

export function slugify(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd').toLowerCase().replace(/&/g, '-and-')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}

export function displayStatus(status) {
  return ARTICLE_STATUSES[status] || (status ? String(status).replaceAll('_', ' ') : '—');
}
