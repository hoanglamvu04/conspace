// Every CMS request stays on the current origin. Login/session are server-held
// HttpOnly cookies; only the short-lived anti-CSRF value lives in JS memory.
export const ADMIN_API = '/api/admin';
let csrf = null;
export function setAdminCsrf(value) { csrf = typeof value === 'string' && value ? value : null; }
export function clearAdminCsrf() { csrf = null; }

export class AdminApiError extends Error {
  constructor(message, status = 0, code = 'UNAVAILABLE') {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
  }
}

export function adminPath(resource, query = {}) {
  if (typeof resource !== 'string' || !/^\/[a-z0-9][a-z0-9/_-]*$/.test(resource) || resource.includes('..') || resource.includes('//')) {
    throw new Error('Đường dẫn quản trị không hợp lệ');
  }
  const search = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && /^[a-z][a-zA-Z0-9]*$/.test(key)) search.set(key, String(value));
  });
  return `${ADMIN_API}${resource}${search.size ? `?${search}` : ''}`;
}

function failMessage(status, payload) {
  if (status === 401) return 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';
  if (status === 403) return 'Tài khoản không có quyền hoặc CSRF không hợp lệ. Hãy đăng nhập lại nếu cần.';
  if (status === 404) return 'Dữ liệu hoặc API yêu cầu không tồn tại.';
  if (status === 429) return 'Có quá nhiều yêu cầu. Vui lòng thử lại sau.';
  return typeof payload?.error?.message === 'string' && payload.error.message.trim() ? payload.error.message : 'Không thể kết nối máy chủ quản trị.';
}

export async function adminRequest(resource, { method = 'GET', data, signal, headers = {} } = {}) {
  const url = resource.startsWith(ADMIN_API + '/') ? resource : adminPath(resource);
  const upper = method.toUpperCase();
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(upper);
  const login = url === `${ADMIN_API}/auth/login`;
  if (unsafe && !login && !csrf) throw new AdminApiError('Phiên CSRF chưa được xác minh. Hãy đăng nhập lại.', 401, 'CSRF_MISSING');
  const init = {
    method: upper, signal, credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', ...headers },
  };
  if (unsafe && !login) init.headers['X-CSRF-Token'] = csrf;
  if (data !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(data);
  }
  let response;
  try { response = await fetch(url, init); }
  catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new AdminApiError('Không kết nối được API quản trị. Vui lòng kiểm tra kết nối.', 0, 'NETWORK_ERROR');
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new AdminApiError('Máy chủ không trả JSON hợp lệ.', response.status, 'INVALID_RESPONSE'); }
  if (!response.ok || payload?.ok !== true) {
    if (response.status === 401) clearAdminCsrf();
    throw new AdminApiError(failMessage(response.status, payload), response.status, payload?.error?.code || 'API_ERROR');
  }
  if (!Object.hasOwn(payload, 'data')) throw new AdminApiError('Phản hồi thiếu dữ liệu.', response.status, 'INVALID_RESPONSE');
  return payload;
}

export async function adminList(resource, params = {}, options = {}) {
  const payload = await adminRequest(adminPath(resource, params), options);
  if (!Array.isArray(payload.data)) throw new AdminApiError('Phản hồi danh sách không hợp lệ.', 0, 'INVALID_RESPONSE');
  return payload;
}
export async function adminObject(resource, options = {}) {
  const payload = await adminRequest(resource, options);
  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) throw new AdminApiError('Phản hồi đối tượng không hợp lệ.', 0, 'INVALID_RESPONSE');
  return payload.data;
}

// UI visibility follows *server-verified* session role; the API authorizes
// every operation again and is the security boundary. No editable roles in JS.
const EVERYONE = ['dashboard:read', 'articles:read', 'settings:read', 'audit:read'];
const EDITOR = ['articles:create','articles:write','articles:submit','articles:schedule','connections:read','connections:write', 'niches:read','niches:write','books:read','books:write','chapters:read','chapters:create','chapters:write','field-notes:read','field-notes:create','field-notes:write','field-notes:submit','dictionary:read','dictionary:create','dictionary:write','dictionary:submit','questions:read','questions:write','questions:submit','media:read','media:upload','media:write','authors:read'];
const REVIEWER = ['reviews:read','reviews:technical:decide','niches:read','dictionary:read','questions:read'];
const CHIEF = ['reviews:read','reviews:chief:decide','niches:read','questions:read','questions:publish','niches:publish','articles:publish','articles:schedule','articles:withdraw'];
export const ROLE_PERMISSIONS = Object.freeze({
  // ADMIN is a system-administration role, not an editorial override.
  // The current Backend session exposes one role and no explicit extra grants.
  ADMIN: [...EVERYONE, 'users:read', 'users:write', 'connections:read', 'settings:write'],
  EDITOR: [...EVERYONE,...EDITOR],
  TECHNICAL_REVIEWER: [...EVERYONE,...REVIEWER],
  EDITOR_IN_CHIEF: [...EVERYONE,...CHIEF, 'dictionary:publish'],
});
export function hasPermission(user, permission) {
  if (!user) return false;

  // ROLE_PERMISSIONS are the baseline UI capabilities for the primary,
  // server-verified CMS role. Backend "permissions" contains only additive
  // delegated grants (currently CONTENT_PUBLISH / CONTENT_WITHDRAW), not the
  // complete effective permission set. An empty array must not erase the
  // baseline role permissions, otherwise a normal ADMIN cannot even open
  // the dashboard or user-management screen.
  const assignedRoles = Array.isArray(user.roles) && user.roles.length
    ? [...new Set([user.role, ...user.roles].filter(Boolean))]
    : [user.role].filter(Boolean);
  const baseline = [...new Set(assignedRoles.flatMap((role) => ROLE_PERMISSIONS[role] || []))];
  const delegated = Array.isArray(user.permissions)
    ? user.permissions
    : Array.isArray(user.grants) ? user.grants : [];

  const delegatedUi = new Set();
  for (const grant of delegated) {
    if (grant === 'CONTENT_PUBLISH') {
      delegatedUi.add('articles:publish');
      delegatedUi.add('niches:publish');
      delegatedUi.add('questions:publish');
      delegatedUi.add('dictionary:publish');
      delegatedUi.add('niches:read');
      delegatedUi.add('questions:read');
      delegatedUi.add('dictionary:read');
    } else if (grant === 'CONTENT_WITHDRAW') {
      delegatedUi.add('articles:read');
      delegatedUi.add('articles:withdraw');
    } else if (typeof grant === 'string') {
      delegatedUi.add(grant);
    }
  }

  return baseline.includes(permission) || delegatedUi.has(permission);
}

export function isSafeMedia(url) {
  if (!url || typeof url !== 'string' || url.startsWith('//')) return false;
  try { const value = new URL(url, 'https://conspace.vn'); return ['https:', 'http:'].includes(value.protocol); }
  catch { return false; }
}
export function formDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16) : '';
}

const ALLOWED = ['image/jpeg','image/png','image/webp','application/pdf'];
export async function uploadAdminImage(file, { altText = '', rightsConfirmed = false, rightsNote = '' } = {}) {
  if (!file || !ALLOWED.includes(file.type) || file.size > 10 * 1024 * 1024) throw new AdminApiError('Chỉ nhận JPEG, PNG, WebP hoặc PDF tối đa 10 MB.', 0, 'INVALID_FILE');
  if (rightsConfirmed && !rightsNote.trim()) throw new AdminApiError('Cần ghi căn cứ quyền sử dụng khi xác nhận quyền.', 0, 'RIGHTS_NOTE_REQUIRED');
  // Backend expects base64 JSON, NOT multipart on the CMS endpoint.
  let bytes;
  try { bytes = new Uint8Array(await file.arrayBuffer()); } catch { throw new AdminApiError('Không đọc được tệp đã chọn.'); }
  if (bytes.length !== file.size) throw new AdminApiError('Kích thước tệp không hợp lệ.');
  let binary = '';
  for (let i=0;i<bytes.length;i+=16384) binary += String.fromCharCode(...bytes.subarray(i,i+16384));
  const encoded = btoa(binary);
  const result = await adminObject('/media', {method:'POST',data:{file:{filename:file.name,mimeType:file.type,data:encoded},altText,rightsConfirmed,rightsNote: rightsConfirmed ? rightsNote : null}});
  if (!result.id) throw new AdminApiError('API chưa xác nhận mã tệp tải lên.',0,'INVALID_RESPONSE');
  return result;
}
