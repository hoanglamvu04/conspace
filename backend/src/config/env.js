import 'dotenv/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const parsedPort = Number(process.env.PORT ?? '5088');
if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const nodeEnv = process.env.NODE_ENV || 'development';
const host = process.env.HOST || '127.0.0.1';
if (nodeEnv === 'production' && host !== '127.0.0.1') {
  throw new Error('Production backend must bind to 127.0.0.1 behind Nginx');
}

const key = process.env.CONTACT_ENCRYPTION_KEY || '';
if (key && !/^[a-fA-F0-9]{64}$/.test(key)) {
  throw new Error('CONTACT_ENCRYPTION_KEY must be a 32-byte hex value');
}

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../');
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',').map((item) => item.trim()).filter(Boolean);
const publicOrigin = process.env.PUBLIC_ORIGIN ||
  (nodeEnv === 'production' ? 'https://conspace.vn' : 'http://127.0.0.1:5176');
const sessionTtlHours = Number(process.env.SESSION_TTL_HOURS || '8');
if (!Number.isInteger(sessionTtlHours) || sessionTtlHours < 1 || sessionTtlHours > 24) {
  throw new Error('SESSION_TTL_HOURS must be an integer between 1 and 24');
}

export const env = Object.freeze({
  nodeEnv,
  host,
  port: parsedPort,
  databaseUrl: process.env.DATABASE_URL || '',
  corsOrigins,
  publicOrigin,
  sessionTtlHours,
  sessionCookieName: 'conspace_admin_session',
  mediaStorageDir: resolve(process.env.MEDIA_STORAGE_DIR || resolve(backendRoot, 'uploads')),
  contactEncryptionKey: key,
});
