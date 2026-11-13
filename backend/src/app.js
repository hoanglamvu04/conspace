import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { isDatabaseReady } from './database/pool.js';
import { createContentRouter } from './routes/content.js';
import { createAdminRouter } from './routes/admin/index.js';
import { createPublicQuestionsRouter } from './routes/public-questions.js';
import { createPublicMediaRouter } from './routes/public-media.js';
import { createPublishingRouter } from './routes/publishing.js';
import { createPublicSearchRouter } from './routes/search.js';
import { createSeoRouter } from './routes/seo.js';
import { errorMiddleware } from './http/validation.js';
import { createEditorialService } from './services/editorial.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());

app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin) || origin === env.publicOrigin) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.use('/api/admin/media', express.json({ limit: '14mb' }));
app.use('/api/v1/questions', express.json({ limit: '35mb' }));
app.use(express.json({ limit: '256kb' }));
if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
}

// Preserve the Gate 1 public health contracts.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'conspace-api', stage: 'gate1' });
});

app.get('/api/ready', async (_req, res) => {
  const ready = await isDatabaseReady();
  res.status(ready ? 200 : 503).json({
    ok: ready,
    service: 'conspace-api',
    checks: { database: ready ? 'up' : 'down' },
  });
});

app.use(createSeoRouter());

app.use('/api/admin', createAdminRouter());
app.use('/api/v1', createContentRouter());
app.use('/api/v1/questions', createPublicQuestionsRouter());
app.use('/api/v1/media', createPublicMediaRouter());
app.use('/api/v1', createPublishingRouter());
app.use('/api/v1/search', createPublicSearchRouter());

app.use('/api', (_req, res) => {
  res.status(404).json({
    ok: false,
    error: { code: 'NOT_FOUND', message: 'API endpoint not found' },
  });
});

app.use(errorMiddleware);
