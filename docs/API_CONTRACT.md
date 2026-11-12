# CONSPACE / API Contract v0.1

Base production URL: `https://conspace.vn/api`. Dev: frontend Vite proxy `/api` -> `http://127.0.0.1:5088`. JSON UTF-8. Public GET endpoints return only PUBLISHED content, not drafts.

**Implemented in the Gate 1 base scaffold**

### GET /api/health

HTTP 200 `{"ok":true,"service":"conspace-api","stage":"gate1"}`

Liveness only. Does not confirm PostgreSQL.

### GET /api/ready

When DB reachable, HTTP 200 `{"ok":true,"service":"conspace-api","checks":{"database":"up"}}`.
When DB missing/unreachable, HTTP 503 `{"ok":false,"service":"conspace-api","checks":{"database":"down"}}`.
Never return connection strings/passwords/errors from the database driver.

**Sprint 1 read APIs to be implemented by Backend, consumed by Frontend**

### GET /api/v1/niches?group=design|construction

HTTP 200:

```json
{
  "ok": true,
  "data": [
    { "id": "uuid", "slug": "string", "name": "string", "group": "design", "summary": "string", "articleCount": 0 }
  ],
  "meta": { "total": 1 }
}
```

- Allowed groups: `design`, `construction`. Omitted = all.
- The planned classification comprises 8 design mảng and 30 contractor niches. Only these 8 design categories are confirmed by available documentation: House, Luxury, F&B, Stay, Office, Project, Factory, Sacred. Do not invent the complete 30-item list.
- `articleCount` is calculated from DB `PUBLISHED` articles; never hardcode fake counts.
- Empty result: `{"ok":true,"data":[],"meta":{"total":0}}`.

### GET /api/v1/articles?role=homeowner|architect|contractor&niche=slug&limit=12&cursor=...

HTTP 200:

```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "slug": "string",
      "title": "string",
      "excerpt": "string",
      "coverImage": null,
      "niches": ["string"],
      "publishedAt": "2026-11-12T00:00:00.000Z",
      "author": { "displayName": "string", "verified": false }
    }
  ],
  "meta": { "nextCursor": null }
}
```

- All items must be PUBLISHED and approved. No fake seed article content. Limit capped by backend to a reasonable amount (e.g., 50).
- `role` changes ranking or selected perspective, not authorization. Roles are reading lenses.
- `niche` filters by valid slug.
- Empty result is valid.

### GET /api/v1/articles/:slug

HTTP 200:

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "slug": "string",
    "title": "string",
    "excerpt": "string",
    "body": "Markdown text",
    "niches": ["string"],
    "publishedAt": "2026-11-12T00:00:00.000Z",
    "updatedAt": "2026-11-12T00:00:00.000Z",
    "author": { "displayName": "string", "verified": false },
    "sources": []
  }
}
```

Not found or unpublished: HTTP 404.

### GET /api/v1/terms?q=...&limit=20

HTTP 200:

```json
{"ok":true,"data":[{"id":"uuid","term":"string","slug":"string","definition":"string","niches":[]}],"meta":{"total":0}}
```

Terms are real and source-reviewed. No invented technical definitions or normative claims.

### Error envelope

```json
{"ok":false,"error":{"code":"NOT_FOUND","message":"Human-readable safe message"}}
```

Use 400/401/403/404/409/429/500 as appropriate. Never expose SQL messages or secrets.

## Sprint 2+ (NOT live or promised by base scaffold)

Field-case uploads, Q&A posts, accounts, expert verification, CMS drafting, editorial approvals, verified answer badges, search indexing and AI features are deliberately deferred. They require explicit security, authorization, moderation and content policy.

## Contract governance

This document is locked for the first sprint. Backend and Frontend work against it without renaming fields independently. A proposed change goes to the integrator for review before both teams implement it. The frontend must show empty/loading/error states instead of made-up article counts if an API is not yet live.
