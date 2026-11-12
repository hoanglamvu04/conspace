export class ApiError extends Error {
  constructor(message, status = 0, code = 'UNAVAILABLE') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function apiUrl(resource, params = {}) {
  if (!/^\/(?:niches(?:\/[a-z0-9][a-z0-9-]*)?|articles(?:\/[a-z0-9][a-z0-9-]*)?|terms|feed|books(?:\/[a-z0-9][a-z0-9-]*(?:\/chapters\/[1-9][0-9]*)?)?|field-notes(?:\/[0-9a-f-]{36})?|questions(?:\/[0-9a-f-]{36})?|search)$/.test(resource)) {
    throw new Error('Unsupported API resource');
  }
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  });
  return `/api/v1${resource}${query.size ? `?${query.toString()}` : ''}`;
}

export async function getJson(url, { signal } = {}) {
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('Máy chủ chưa trả về dữ liệu hợp lệ.', response.status, 'INVALID_RESPONSE');
  }

  if (!response.ok || payload?.ok !== true) {
    const message = typeof payload?.error?.message === 'string' && payload.error.message.trim()
      ? payload.error.message
      : 'Không thể kết nối kho tri thức lúc này.';
    throw new ApiError(message, response.status, payload?.error?.code || 'UNAVAILABLE');
  }
  if (!Object.prototype.hasOwnProperty.call(payload, 'data')) {
    throw new ApiError('Phản hồi thiếu trường dữ liệu.', response.status, 'INVALID_RESPONSE');
  }
  return payload;
}

export function requireList(payload) {
  if (!Array.isArray(payload?.data)) {
    throw new ApiError('Định dạng danh sách không hợp lệ.', 0, 'INVALID_RESPONSE');
  }
  return payload.data;
}

export async function postJson(resource, data, { signal } = {}) {
  if (resource !== '/questions') throw new Error('Unsupported public POST resource');
  const response = await fetch(apiUrl(resource), {
    method: 'POST',
    signal,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  let payload;
  try { payload = await response.json(); }
  catch { throw new ApiError('Máy chủ chưa trả về dữ liệu hợp lệ.', response.status, 'INVALID_RESPONSE'); }
  if (!response.ok || payload?.ok !== true) {
    const message = typeof payload?.error?.message === 'string' && payload.error.message.trim()
      ? payload.error.message
      : 'Không thể gửi câu hỏi lúc này.';
    throw new ApiError(message, response.status, payload?.error?.code || 'UNAVAILABLE');
  }
  if (!Object.prototype.hasOwnProperty.call(payload, 'data')) {
    throw new ApiError('Phản hồi thiếu trường dữ liệu.', response.status, 'INVALID_RESPONSE');
  }
  return payload;
}
