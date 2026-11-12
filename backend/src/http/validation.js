import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const limit = (fallback) => z.coerce.number().int().min(1).max(50).default(fallback);
const strict = (shape) => z.strictObject(shape);

export const nichesQuerySchema = strict({
  group: z.enum(['design', 'construction']).optional(),
});

export const articlesQuerySchema = strict({
  role: z.enum(['homeowner', 'architect', 'contractor']).optional(),
  niche: slug.optional(),
  limit: limit(12),
  cursor: z.string().max(512).optional(),
});

export const articleParamsSchema = strict({ slug });

export const termsQuerySchema = strict({
  q: z.string().trim().max(120).default(''),
  limit: limit(20),
});

const cursorSchema = strict({
  v: z.literal(2),
  publishedAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
  rank: z.number().int().min(0).max(2),
  role: z.enum(['homeowner', 'architect', 'contractor']).nullable(),
  niche: slug.nullable(),
});

export function encodeCursor(row, { role = null, niche = null } = {}) {
  const value = cursorSchema.parse({
    v: 2,
    publishedAt: new Date(row.publishedAt).toISOString(),
    id: row.id,
    rank: row.audienceRank ?? 0,
    role,
    niche,
  });
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor(value) {
  if (!value) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
    const text = Buffer.from(value, 'base64url').toString('utf8');
    if (Buffer.from(text, 'utf8').toString('base64url') !== value) {
      throw new Error('Noncanonical cursor');
    }
    return cursorSchema.parse(JSON.parse(text));
  } catch {
    throw new RequestError(400, 'VALIDATION_ERROR', 'Invalid pagination cursor');
  }
}

export class RequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
    this.code = code;
  }
}

export function validate(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new RequestError(400, 'VALIDATION_ERROR', 'Invalid request parameters');
  }
  return result.data;
}

export function errorMiddleware(error, _req, res, _next) {
  if (error instanceof RequestError) {
    return res.status(error.status).json({
      ok: false,
      error: { code: error.code, message: error.message },
    });
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' },
    });
  }
  if (error?.type === 'entity.too.large' || error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      ok: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body or upload is too large' },
    });
  }
  if (error?.name === 'MulterError') {
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_UPLOAD', message: 'Upload contains an unexpected file or too many files' },
    });
  }
  if (error?.code === '23505') {
    return res.status(409).json({
      ok: false,
      error: { code: 'CONFLICT', message: 'A record with the same unique value already exists' },
    });
  }
  if (error?.code === '23503' || error?.code === '23514') {
    return res.status(409).json({
      ok: false,
      error: { code: 'CONSTRAINT_VIOLATION', message: 'The requested change conflicts with related records or business rules' },
    });
  }
  if ([400, 401, 403, 404, 409, 415, 429, 503].includes(error?.status)) {
    return res.status(error.status).json({
      ok: false,
      error: { code: error.code || 'REQUEST_FAILED', message: error.message || 'Request could not be completed' },
    });
  }
  console.error('CONSPACE API request failed:', error?.name || 'UnknownError');
  return res.status(500).json({
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}
