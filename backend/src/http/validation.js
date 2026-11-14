import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const limit = (fallback) => z.coerce.number().int().min(1).max(50).default(fallback);
const strict = (shape) => z.strictObject(shape);

export const nichesQuerySchema = strict({
  group: z.enum(['design', 'construction']).optional(),
});

export const articlesQuerySchema = strict({
  role: z.enum(['homeowner', 'architect', 'contractor']).default('homeowner'),
  niche: slug.optional(),
  tag: slug.optional(),
  limit: limit(12),
  cursor: z.string().max(512).optional(),
});

export const articleParamsSchema = strict({ slug });

export const termsQuerySchema = strict({
  q: z.string().trim().max(120).default(''),
  limit: limit(20),
});

const cursorSchemaV1 = strict({
  v: z.literal(1),
  publishedAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});
const cursorSchemaV2 = strict({
  v: z.literal(2),
  role: z.enum(['homeowner','architect','contractor']),
  preferenceRank: z.union([z.literal(0),z.literal(1)]),
  publishedAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});
export function encodeCursor(row, role = null) {
  const base={publishedAt:new Date(row.publishedAt).toISOString(),id:row.id};
  const value=role?{v:2,role,preferenceRank:row.preferenceRank,...base}:{v:1,...base};
  return Buffer.from(JSON.stringify(value),'utf8').toString('base64url');
}
export function decodeCursor(value) {
  if(!value)return null;
  try{
    if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid encoding');
    const text=Buffer.from(value,'base64url').toString('utf8');
    if(Buffer.from(text,'utf8').toString('base64url')!==value)throw new Error('Noncanonical cursor');
    const parsed=JSON.parse(text);
    if(parsed?.v===1)return cursorSchemaV1.parse(parsed);
    if(parsed?.v===2)return cursorSchemaV2.parse(parsed);
    throw new Error('Unsupported cursor version');
  }catch{
    throw new RequestError(400,'VALIDATION_ERROR','Invalid pagination cursor');
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
