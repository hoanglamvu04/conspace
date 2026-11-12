# CONSPACE — Admin CMS frontend integration

## Exact stack and ownership

React 18.3.1, Vite 5.4.19, React Router 7, JavaScript JSX only. Changes are limited to `frontend/**`. Existing editorial public pages remain intact. The CMS is lazy-loaded under `/admin` and uses its own sidebar, topbar and CSS. Direct pushes to `main` do not automatically deploy the site; Ops controls production rollout.

Admin routes: `/admin/login`, `/admin/dashboard`, `/admin/articles`, `/admin/articles/new`, `/admin/articles/:id/edit`, `/admin/reviews`, `/admin/niches`, `/admin/books`, `/admin/chapters`, `/admin/field-notes`, `/admin/dictionary`, `/admin/questions`, `/admin/media`, `/admin/users`, `/admin/settings`.

## Authentication and RBAC

- All CMS requests use same-origin `/api/admin` and `credentials: 'same-origin'`, matching `docs/API_CONTRACT.md` v0.2 and actual Backend routes. No bearer tokens, JWT, passwords or credentials are stored in localStorage, sessionStorage or readable cookies.
- `POST /auth/login` returns a server-verified user, expiry and CSRF token; server sets a scoped HttpOnly SameSite=Strict cookie. `GET /auth/session` restores the server session after refresh. CSRF token exists only in JS memory, is sent on all unsafe requests (except login) via `X-CSRF-Token`, and is cleared after 401/logout. Browser provides same-origin `Origin` on unsafe requests; Backend checks it independently.
- UI capabilities are derived *only* from the server-provided `user.role` (`ADMIN`, `EDITOR`, `TECHNICAL_REVIEWER`, `EDITOR_IN_CHIEF`); Backend enforces all roles, workflow transitions, contributor self-review prevention, and CSRF on every action. A denied/expired session never opens private content. Role-based visible affordances are not relied upon for security.
- Default account bootstrap is **not** performed by frontend. A first ADMIN must already be provisioned by Backend CLI. Never create public reader accounts.

## API map (implemented Backend, not guessed)

| Screen | Read | Write / decision |
| --- | --- | --- |
| Login/session/settings | `GET /auth/session` | `POST /auth/login`, `/auth/logout`, `/auth/password` |
| Dashboard | `GET /articles?status=...` (real `meta.total`), `GET /reviews/queue?stage=...` | Refresh only |
| Articles | `GET /articles`, `/articles/:id`, `/articles/:id/revisions`, `GET /authors`, `/niches` | `POST /articles`, `PATCH /articles/:id`, `DELETE /articles/:id`, `POST /articles/:id/submit`, `/schedule`, `/publish`, `/withdraw` |
| Reviews | `GET /reviews/queue?stage=TECHNICAL\|EDITOR_IN_CHIEF`, article/term/question detail | `POST /reviews/articles/:id/start`, `/reviews/articles/:id/decision`, `/reviews/terms/:id/start`, `/reviews/terms/:id/decision`, `/reviews/question-answers/:id/decision` |
| Niches | `GET /niches`, `/niches/groups`, `/niches/:id/sections` | `POST/PATCH /niches`, `POST/PATCH /niches/groups`, `PUT /niches/:id/sections/:sectionNo`, `POST /niches/:id/sections/:sectionNo/publish` |
| Books/chapters | `GET /books`, `/books/:id`, `/chapters?bookId=...` | `PATCH /books/:id`, `POST /chapters`, `PATCH /chapters/:id` |
| Field notes | `GET /field-notes`, `/field-notes/:id` | `POST /field-notes`, `PATCH /field-notes/:id` and article's `/submit` |
| Dictionary | `GET /terms`, `/terms/:id` | `POST /terms`, `PATCH /terms/:id`, `POST /terms/:id/submit`, `/publish` |
| Questions | `GET /questions`, `/questions/:id` | `PATCH /questions/:id`, `POST /questions/:id/answer`, `/answer/submit`, `/answer/publish` |
| Media | `GET /media`, `/media/:id/download` | `POST /media` JSON-base64, `PATCH /media/:id`, `DELETE /media/:id` |
| Users | `GET /users` | `POST /users`, `PATCH /users/:id` (ADMIN only) |

All paths above have the `/api/admin` prefix; no fake API clients. The Backend requires strict validation, IDs and permissions. All mutations show success toast only after `ok:true` response. HTTP 400, 401, 403, 404, 409, 413 and 500 errors stay visible and never get silently swallowed.

## Editorial source rules

- Three reader lenses are `homeowner`, `architect`, `contractor`, **not admin roles**. A niche has a single public URL; CMS edits individual section numbers 1–12 and the role layer using a three-perspective accordion, initially following the existing reader preference. Some template blocks may have no audience layer (common block), which uses the template's common section key.
- The source only confirms 8 design category names: HOUSE, LUXURY, F&B, STAY, OFFICE, PROJECT, FACTORY, SACRED. The 30 construction niches and their five groups must be entered from approved reference sources; none are invented in frontend.
- Three book records are server-seeded: Cẩm nang Kiến trúc Hòa Lạc (REFERENCE, **Tài liệu tra cứu**); Phận nhà thầu xây dựng (NON_FICTION, **Phi hư cấu**); Quẩn quanh KTS (FICTIONALIZED, **Tự sự, có hư cấu**). A chapter slot links to an article; the article's real review/publish status and scheduled release gate all public chapter content.
- Field notes require phenomenon, root cause, hold point, real source for a cost, company/address anonymization and confirmed image rights. Sensitive editorial claims must be flagged and reviewed by the editor-in-chief, after technical review. The Backend prevents self-approval.
- No paid-PR, rankings, fake staff, fabricated metrics, sample articles, preview content returned as public data, advertisements, or selling CTAs.

## Known Backend limitations reflected honestly in UI

- There is **no dedicated** `GET /api/admin/dashboard`, aggregated audit-activity feed, global `GET /settings`, or editorial review-comments/history listing endpoint. Dashboard counters use `GET /articles` `meta.total` for each status. “Recent updates” lists real articles with update timestamps, clearly distinguished from audit events. Article revisions use the real `/articles/:id/revisions` endpoint. No fictional review notes are shown.
- CMS niche cross-link field does not have a separate write API. The UI identifies the limitation instead of inventing a successful action.
- The reader's live questions are anonymous; CMS publishes answers only after technical approval and necessary chief review. Private contact is only available when Backend grants it and audits access.
- CMS media upload is `POST /api/admin/media` **JSON with file base64**, not multipart. Size is capped at 10 MB, file signatures are checked at server, and rights notes are required when confirming rights. The browser does not promise uploaded images public until rights and publication checks pass.
- Some lookups require the editor's knowledge of an article UUID when linking chapters, as the API has no dedicated article picker endpoint. All visible controls use supported API paths.

## QA checklist

1. `cd frontend && npm ci && npm test && npm run build` on Node 22+.
2. Visit all 15 `/admin` routes; refresh deep routes, exercise navigation from 1440/1024/768/390/320 px widths, keyboard tab/focus, Escape-to-close modal and mobile sidebar, and overflow of data tables.
3. Login with a provisioned CMS account. Check session restore by refreshing `/admin/articles`, logout cookie invalidation, expired session redirect, wrong password response, missing CSRF denied and forbidden role decisions rejected by Backend.
4. As Editor, draft article with Markdown and sources, upload a real image with rights metadata, save, inspect revisions, explicitly assess sensitivity flags, submit. As Reviewer, start and decide with a reason. As Chief, review sensitive material and publish/schedule only approved content. Confirm self-approval is refused server-side.
5. Create/update a niche from a documented source, edit sections for all three reader lenses, approve/publish a sourced `IN_REVIEW` section as a different user, inspect the single public niche URL. Test a book chapter linked to an approved article and verify draft/future content is not publicly exposed.
6. Test field-case anonymization and rights enforcement, term review workflow, Q&A, media format rejection, last-admin demotion restriction, password change and safe API errors. Do not change databases or server configuration from frontend.

Backend and front-end should be deployed together only after migrations, authenticated smoke checks and visual QA on an Ops-approved environment. A `git push main` is not a deployment confirmation.
