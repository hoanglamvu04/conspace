import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { isDatabaseReady } from './database/pool.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());

app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
}));

app.use(express.json({ limit: '256kb' }));
if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
}

// Liveness: Express process works (no DB side effects).
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'conspace-api', stage: 'gate1' });
});

// Readiness: local PostgreSQL query works. Does not expose secrets.
app.get('/api/ready', async (_req, res) => {
  const ready = await isDatabaseReady();
  res.status(ready ? 200 : 503).json({
    ok: ready,
    service: 'conspace-api',
    checks: { database: ready ? 'up' : 'down' },
  });
});

app.use('/api', (_req, res) => {
  res.status(404).json({
    ok: false,
    error: { code: 'NOT_FOUND', message: 'API endpoint not found' },
  });
});
