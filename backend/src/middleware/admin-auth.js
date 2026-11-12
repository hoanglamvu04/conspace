import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { RequestError } from '../http/validation.js';

export function readCookie(req, name = env.sessionCookieName) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

export function setSessionCookie(res, token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const attributes = [
    env.sessionCookieName + '=' + encodeURIComponent(token),
    'Path=/api/admin',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=' + maxAge,
  ];
  if (env.nodeEnv === 'production') attributes.push('Secure');
  res.setHeader('Set-Cookie', attributes.join('; '));
}

export function clearSessionCookie(res) {
  const attributes = [
    env.sessionCookieName + '=',
    'Path=/api/admin',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];
  if (env.nodeEnv === 'production') attributes.push('Secure');
  res.setHeader('Set-Cookie', attributes.join('; '));
}

export function requireAuth(authService) {
  return async (req, _res, next) => {
    try {
      const token = readCookie(req);
      const session = await authService.authenticate(token);
      if (!session) throw new RequestError(401, 'UNAUTHENTICATED', 'Authentication required');
      req.auth = session.user;
      req.session = session;
      req.sessionToken = token;
      next();
    } catch (error) { next(error); }
  };
}

export function requireCsrf(req, _res, next) {
  try {
    const method = req.method.toUpperCase();
    if (['GET','HEAD','OPTIONS'].includes(method)) return next();
    const origin = req.get('origin');
    const allowed = new Set([env.publicOrigin, ...env.corsOrigins].filter(Boolean));
    if ((origin && !allowed.has(origin)) || (!origin && env.nodeEnv === 'production')) {
      throw new RequestError(403, 'ORIGIN_FORBIDDEN', 'Request origin is not allowed');
    }
    const supplied = req.get('x-csrf-token') || '';
    const expected = req.session?.csrfToken || '';
    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (!a.length || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new RequestError(403, 'CSRF_INVALID', 'CSRF token is missing or invalid');
    }
    next();
  } catch (error) { next(error); }
}

export function requireRoles(...roles) {
  return (req, _res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return next(new RequestError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
    }
    next();
  };
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve().then(() => handler(req, res, next)).catch(next);
}
