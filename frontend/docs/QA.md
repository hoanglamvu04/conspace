# CONSPACE frontend — Sprint 1 QA and integration notes

Frontend ownership: `frontend/**` only; React 18 / Vite 5 / JSX (no TSX).

## Local workflow

```sh
cd frontend
npm ci
npm test
npm run build
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:5088` in development, matching the locked contract. Production uses a relative same-origin `/api/v1` prefix. No environment secrets are needed on the client.

## Public routes

- `/` — 3 reader lenses and editorial home
- `/ngach`, `/ngach/:slug` — dynamic 8+30 taxonomy from the API and role-aware related articles
- `/bai-viet`, `/bai-viet/:slug` — published article index and safe Markdown rendering
- `/tu-sach`, `/hien-truong`, `/tu-dien`, `/ban-nghe`, `/tra-cuu`, `/tra-nhanh` — public knowledge sections
- `/ve-conspace`, `/quy-tac-noi-dung` — editorial transparency

No fake articles, contractor names, technical definitions, statistics, approval badges, login, uploads or marketplace. The 8 documented architecture-area labels and 3 book names are static **editorial reference data**; all live records come from the API.

## Manual verification checklist

- Responsive: check ~375px, 768px, 1440px; no horizontal overflow; mobile navigation opens and closes; search/form fits.
- Keyboard: skip link, focus ring, mobile nav, reader switch `aria-pressed`, search input, retry buttons.
- Frontend/API: unavailable backend shows explanatory retry UI; empty `data: []` is not treated as an error; 404 article shows not-found.
- Test API: `/api/v1/niches`, `/api/v1/articles?role=...`, `/api/v1/articles/:slug`, `/api/v1/terms?q=...` with the real contract; no alternate keys.
- Reader lens: select any perspective, navigate and refresh; verify persisted cookie and API `role` filter.
- Published posts: correct image, author, date, safe Markdown and source list; prevent script/HTML injection.
- SEO: title, description, canonical; Article JSON-LD only for real article data; semantic headings and image `alt`.

### Deferred by the API contract

The sprint 1 contract does **not** offer dedicated field-case, book chapter, Q&A or full-text search endpoints. These sections provide properly labeled editorial scaffolding and truthful empty states rather than fictional records. No authoring/approval functions are presented as real.
