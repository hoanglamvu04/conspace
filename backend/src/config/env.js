import 'dotenv/config';

const parsedPort = Number.parseInt(process.env.PORT ?? '5088', 10);
if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const nodeEnv = process.env.NODE_ENV || 'development';
const host = process.env.HOST || '127.0.0.1';

if (nodeEnv === 'production' && host !== '127.0.0.1') {
  throw new Error('Production backend must bind to 127.0.0.1 behind Nginx');
}

export const env = Object.freeze({
  nodeEnv,
  host,
  port: parsedPort,
  databaseUrl: process.env.DATABASE_URL || '',
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
});
