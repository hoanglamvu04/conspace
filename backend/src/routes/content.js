import { Router } from 'express';
import {
  RequestError, nichesQuerySchema, articlesQuerySchema, articleParamsSchema,
  termsQuerySchema, validate, decodeCursor, encodeCursor,
} from '../http/validation.js';
import { createContentRepository } from '../repositories/content.js';

export function createContentRouter(repository = createContentRepository()) {
  const router = Router();
  const handle = (callback) => (req, res, next) => {
    Promise.resolve().then(() => callback(req, res)).catch(next);
  };

  router.get('/niches', handle(async (req, res) => {
    const { group } = validate(nichesQuerySchema, req.query);
    const data = await repository.niches(group);
    res.json({ ok: true, data, meta: { total: data.length } });
  }));

  router.get('/articles', handle(async (req, res) => {
    const params = validate(articlesQuerySchema, req.query);
    const cursor = decodeCursor(params.cursor);
    const rows = await repository.articles({ ...params, cursor });
    const hasMore = rows.length > params.limit;
    const data = rows.slice(0, params.limit).map((row) => ({
      id: row.id, slug: row.slug, title: row.title, excerpt: row.excerpt,
      coverImage: row.coverImage ?? null, niches: row.niches ?? [],
      publishedAt: new Date(row.publishedAt).toISOString(),
      author: { displayName: row.authorName, verified: row.authorVerified },
    }));
    const last = data[data.length - 1];
    res.json({
      ok: true, data,
      meta: { nextCursor: hasMore && last ? encodeCursor(last) : null },
    });
  }));

  router.get('/articles/:slug', handle(async (req, res) => {
    const { slug } = validate(articleParamsSchema, req.params);
    const row = await repository.articleBySlug(slug);
    if (!row) throw new RequestError(404, 'NOT_FOUND', 'Article not found');
    res.json({
      ok: true,
      data: {
        id: row.id, slug: row.slug, title: row.title,
        excerpt: row.excerpt, body: row.body, niches: row.niches ?? [],
        publishedAt: new Date(row.publishedAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
        author: { displayName: row.authorName, verified: row.authorVerified },
        sources: row.sources ?? [],
      },
    });
  }));

  router.get('/terms', handle(async (req, res) => {
    const { q, limit } = validate(termsQuerySchema, req.query);
    const { rows, total } = await repository.terms(q, limit);
    res.json({ ok: true, data: rows, meta: { total } });
  }));

  return router;
}
