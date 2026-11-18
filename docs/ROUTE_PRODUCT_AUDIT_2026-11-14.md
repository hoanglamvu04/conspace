# CONSPACE — Route & Product Completeness Audit

Audit date: 2026-11-14  
Baseline HEAD: `dd1d2171c490599322a88c8e4ab566db7b030e70`  
Basis: current React routes, CMS routes, public/admin API wiring, and `docs/INFORMATION_ARCHITECTURE_EDITORIAL_GOVERNANCE_V1.md`.

## Status legend

- **COMPLETE**: route exists, real API/data path exists where needed, loading/error/empty states are handled, and the route performs its intended v1 job.
- **PARTIAL**: route exists but important product behavior, data management, or IA semantics are still incomplete.
- **MISSING**: target route/workflow does not exist.
- **SOURCE-BLOCKED**: implementation can support it, but approved source data required by governance is not available and must not be invented.
- **LATER**: explicitly assigned to a later IA phase.

## Public web

| Route | IA phase | Status | Evidence / gap | Priority |
|---|---:|---|---|---:|
| `/` | 1 | COMPLETE | Three reader gates, real feed, latest published chapter, field notes, Q&A, articles, search and taxonomy. No fake feed items. | P0 |
| `/tu-sach` | 1 | COMPLETE | Reads active books and published chapter counts from Backend. | P0 |
| `/tu-sach/:slug` | 1 | COMPLETE | Lists only published chapters; empty state protects unpublished content. | P0 |
| `/cam-nang/:part/:item` | 1 | COMPLETE | Published-only chapter detail with sources and previous/next published navigation. | P0 |
| `/phan-nha-thau/:chapter` | 1 | COMPLETE | Same published-only chapter contract. | P0 |
| `/quan-quanh-kts/:chapter` | 1 | COMPLETE | Same published-only chapter contract. | P0 |
| `/ngach` | 1 | COMPLETE / SOURCE-BLOCKED | Directory/search/filter works from active DB taxonomy. Approved names for the full 30 construction niches are intentionally not fabricated. | P0 |
| `/ngach/:slug` | 1 | COMPLETE | Template A, 12 blocks, reader layers on one URL, related published content. | P0 |
| `/mang/:slug` | 2 | COMPLETE for current scope | Template B has exactly 7 slots and exposes only published, sourced sections. Depth depends on real editorial content. | P1 |
| `/hien-truong` | 1 | COMPLETE | Published compliant cases only; pagination and reader-lens ranking. | P0 |
| `/hien-truong/:slug` | 1 | COMPLETE | Public cards, search and sitemap use the linked Article slug. Legacy UUID URLs still resolve and are client-replaced with the canonical slug URL. | P1 resolved |
| `/hoi-dap` | 1 | COMPLETE | Published question + published answer only. | P0 |
| `/hoi-dap/gui-cau-hoi` | 1 | COMPLETE | Anonymous intake, optional encrypted private contact, max 5 images, no reader account. | P0 |
| `/hoi-dap/:id` | 1 | COMPLETE | Published answer detail and rights-confirmed public images only. | P0 |
| `/tra-nhanh` | 1 | PARTIAL | Search/facets/lens/niche filters are real. IA also calls for the source-backed “Tôi thấy… → xem mục nào” symptom map from Cẩm nang part 9; that structure is not yet implemented. | P1 |
| `/tra-cuu` | legacy | COMPLETE alias | Preserved as the unified lookup surface. | P1 |
| `/tu-dien` | legacy | COMPLETE alias | Preserved as lookup entry. | P1 |
| `/tu-dien/:slug` | 1 | COMPLETE | Published, reviewed, source-backed term detail with related niches. | P1 |
| `/bai-viet` | supporting | COMPLETE | Published article index with reader preference ranking and pagination. | P0 |
| `/bai-viet/:slug` | supporting | COMPLETE | Published-only body, author, sources, related content and cover. | P0 |
| `/ban-nghe` | legacy / v1 | COMPLETE | Uses the same Article workflow and URLs, but only published articles explicitly tagged `ban-nghe` are selected. CMS exposes a dedicated Bàn nghề toggle; no duplicate content or taxonomy-39 entry is created. | P1 resolved |
| `/ve-conspace` | 1 | COMPLETE | Public editorial identity and governance explanation are present. | P1 |
| `/quy-tac-noi-dung` | 1 | COMPLETE | Six editorial commitments are presented as a dedicated public page. | P1 |
| `/lien-he` | 1 | PARTIAL / SOURCE-BLOCKED | Legal operator is shown, but verified address/email/phone are unavailable in approved project sources, so the page correctly refuses to invent them. | P1 |
| `/ket-noi` and `/ket-noi/{du-an|kien-truc-su|nha-thau|tham-gia}` | 1 | **COMPLETE** | Private landing + four intake forms, encrypted contact persistence, no public listing/marketplace, and manual internal triage are implemented. Typed form routes are noindex; the landing can be indexed. | **P0 resolved** |
| `/cong-nghe`, `/cong-nghe/:slug` | 2 | LATER | IA explicitly schedules this as a source-backed editorial vertical, not a chatbot. | P2 |
| `/ho-so/:don-vi` | 3 | LATER | IA phase 3; must not be implemented as ranking/review marketplace. | P3 |
| unmatched route | 1 | COMPLETE | Dedicated 404 page exists. | P0 |

## CMS routes

| Route | Status | Evidence / gap | Priority |
|---|---|---|---:|
| `/admin/login` | COMPLETE | Server session, HttpOnly cookie, CSRF, errors and redirect handling. | P0 |
| `/admin/dashboard` | COMPLETE | Real counts/queues from admin APIs, not hard-coded KPIs. | P0 |
| `/admin/articles` | COMPLETE | Search/status filters, archive controls and server-backed list. | P0 |
| `/admin/articles/new`, `/:id/edit` | COMPLETE | Full article authoring, sources, niches, media, sensitivity, submit/schedule/publish/withdraw workflow. | P0 |
| `/admin/reviews` | COMPLETE | Technical/Chief queues, decisions and retained feedback. | P0 |
| `/admin/niches` | COMPLETE | Taxonomy + Template A/B authoring/review/publish controls. | P0 |
| `/admin/books` | COMPLETE | Three-book metadata management from DB. | P1 |
| `/admin/chapters` | COMPLETE | Searchable article picker is filtered by the selected book content type; linked article status/preview are visible; detach, schedule clearing and guarded empty-slot deletion are explicit. | P1 resolved |
| `/admin/field-notes` | COMPLETE | Compliance dashboard, authoring, sources/media, submit readiness and feedback. | P0 |
| `/admin/dictionary` | COMPLETE | Create/edit/source/niche link/submit/publish plus review feedback. | P1 |
| `/admin/questions` | COMPLETE | Intake triage, audited private-contact access, reader-guessed niche correction/clearing against active taxonomy, answer workflow and publishing are implemented. Niche-only corrections are audited without creating fake workflow transitions. | P1 resolved |
| `/admin/media` | COMPLETE | Upload, rights metadata, usage awareness and guarded deletion. | P0 |
| `/admin/audit` | COMPLETE | Unified audit/workflow event history from Backend. | P0 |
| `/admin/users` | COMPLETE | Multi-role/person identity/delegated permission/session revocation. | P0 |
| `/admin/settings` | COMPLETE for current Backend scope | Account/session/password security is real; business-policy toggles are intentionally absent because no settings API exists. | P2 |
| `/admin/authors` | COMPLETE | Dedicated profile management now exposes search, article/publication counts, create/edit/deactivate controls, CMS-account linkage, and ADMIN-only verification while preserving editorial RBAC. | P1 resolved |
| `/admin/connections` | **COMPLETE** | ADMIN/EDITOR can inspect the private queue; contact decrypts only on detail with audit. EDITOR performs reasoned triage; reviewer/chief roles do not inherit access. | **P0 resolved** |

## Cross-route findings

1. **Resolved P0: Connection intake.** The phase-1 flow now has private public forms, encrypted persistence, no public listing, audited contact access and internal manual triage.
2. **Resolved P1: Bàn nghề now has real editorial selection.** It uses the `ban-nghe` tag on the existing Article model, preserving one canonical article and one review workflow.
3. **Resolved P1: Field Note public URLs now use stable Article slugs.** Legacy UUID URLs remain compatible without being emitted as canonical links.
4. **Quick lookup is already a strong search surface, but the source-backed symptom map (“Tôi thấy…”) remains a separate content-model gap.**
5. **Static organization pages are acceptable as code-owned content for v1; Contact cannot be completed with phone/email/address until verified source material is supplied.**
6. **CMS is substantially more complete than the public route map.** After resolving Connection triage, the dedicated author-profile UI is now resolved; remaining visible gaps are source-dependent Contact/Tra nhanh mapping and lower-priority workflow polish.

## Execution order after audit

### P0 — phase-1 product
- **Resolved:** private Connection intake end-to-end with encrypted contact storage, no public listing, ADMIN/EDITOR oversight/triage, audit trail and regression tests.
- Full route/API/CI gate remains mandatory after every follow-up batch.

### P1 — close visible “half-built” routes
1. **Resolved:** `/ban-nghe` now uses explicit editorial tag selection instead of duplicating `/bai-viet`.
2. **Resolved:** Field Note detail now uses stable slug URLs while keeping UUID compatibility.
3. **Resolved:** chapter article linking now uses a filtered picker with explicit detach, schedule clearing and guarded empty-slot deletion.
4. **Resolved:** dedicated Author Profile management UI now separates editorial profile editing from ADMIN verification.
5. Add source-backed “Tôi thấy…” mapping only when Cẩm nang part 9 data is actually available.
6. Complete Contact only from verified legal/contact source data.

### P2/P3 — intentionally later
- Công nghệ nghề (phase 2).
- Hồ sơ ngành (phase 3).
- Deep SEO/structured-data expansion only after the product routes above are stable.


## CMS UX hardening pass — 2026-11-16

The route-completeness status above is unchanged; this pass hardened day-to-day CMS operation without adding fake content or new business modules.

- **Dashboard:** technical-review metric now explicitly states it counts Article records only instead of implying an all-entity queue total.
- **Articles:** list filters have recovery; next-upload media rights/alt fields are treated as transient upload metadata rather than false unsaved Article state; rights confirmation requires a basis note.
- **Reviews:** Technical/Chief queues can be filtered by Article, Term, Q&A answer, or Niche section, with real per-queue counts.
- **Field Notes:** create-vs-write and media-upload permissions are applied consistently across every editable control; preview/authoring state is explicit.
- **Niches:** group/search filters have recovery and a meaningful no-match state.
- **Chapters:** create-vs-write permissions are consistent for schedule/title/article linking; filtered lists no longer collapse into unexplained blank space.
- **Questions:** status filtering is server-backed; private-contact display honors an explicit secondary EDITOR role as well as the primary role, while access remains audited.
- **Dictionary:** search can be cleared without losing the surrounding workflow.
- **Media:** category/rights/search filters can be reset in one action.
- **Connections:** changing filters clears an already-open private record so stale decrypted contact is not left beside an unrelated filtered queue.
- **Users:** local search now presents an explicit no-match state rather than a blank table.
- **Audit:** filters can be reset in one action.
- **Mobile CMS shell:** opening the sidebar locks background-page scrolling and still supports Escape/backdrop close.

All of these are UX/RBAC hardening on existing APIs. No migration or production deployment is introduced by this pass.

## Public detail route hardening — 2026-11-16

The public Field Note detail page used Article slug URLs but the frontend API allowlist accepted only UUIDs. The Dictionary detail page used `/terms/:slug` but the allowlist accepted only `/terms`. Both were runtime failures before calling the Backend. The client URL builder now matches the slug-based published-only API contracts; oversized/invalid detail paths recover with contextual links. The local Public acceptance runner additionally checks a source-backed published Dictionary term and a draft term that must remain 404. The HTTP 200 SPA entrypoint checks do not constitute rendered browser testing. No migration, demo content injection or production deploy.

## Public Web reader acceptance/hardening — 2026-11-17

- Public Q&A now accepts validated page/limit and returns real pagination metadata. The public query and count apply the same published-and-approved visibility predicate and deterministic ordering, avoiding the previous silent 50-record truncation.
- Reader Search now tracks the active query, reader lens and filters. The initial error retry makes an actual repeat request; a later-page error retries that page rather than skipping it, and duplicate results do not repeat on recovery.
- Field Note and Q&A load-more actions are blocked while prior page metadata is stale and show loading feedback for subsequent pages.
- Published article cards, detail bylines and structured author data now respect Backend's `authorName` field rather than defaulting all non-nested author records to the editorial team.
- Tests cover paging boundary/recovery wiring and published Q&A visibility. Browser-rendering and mobile-device QA remain distinct, pending manual walkthrough. No migration or production deployment.

## Browser-level Public Web acceptance — 2026-11-17

The previous HTTP route probe only verified SPA entry-point responses. An independent **Chromium DevTools browser gate** now renders the actual React application in desktop (1280 px) and mobile (390 px) viewports. It covers published-versus-unpublished Article detail, Template B architecture layout, source-reviewed Dictionary detail, Quick Search facets, Q&A private-contact opt-in, mobile menu Escape/focus recovery and reader-lens persistence, as well as mobile horizontal overflow and uncaught JavaScript exceptions.

The browser gate runs after Backend/Frontend unit tests and build on GitHub Actions, with a local PostgreSQL service and [DEMO] seed fixtures only. A failure records a screenshot plus frontend/backend logs. No new package dependency, migration, real CMS login, production deployment or public form submission is introduced.

## Full local-only demo content dataset — 2026-11-17

Introduced backend db:seed-demo-full, separate from the smaller workflow acceptance db:seed-demo. The new command covers eight documented design areas, optional synthetic construction niche capacity, local [DEMO] source-marked Template A/B sections, all three reader lenses, three configured books and their chapter slots, public articles, Field Notes, glossary entries, and moderated Q&A. It uses the existing editorial approval columns for synthetic fixture data only and avoids overwriting existing authored sections/chapter links. All content explicitly disclaims technical/legal/market evidence; unverified thirty construction niche names are labeled DEMO placeholders. No real media rights, private connection contacts, production deployment or migrations. CI tests idempotency in the isolated PostgreSQL service.

## Editorial homepage redesign — 2026-11-17

Implemented the approved modern blue-grey editorial reference on the real Public Web frontend. Shared header has light utility/navigation bars; homepage now uses a two-column feature, taxonomy photo strip, article list with three real reader-lens sorting tabs, a published content-based feature, Tủ sách / Hiện trường / Q&A shortcuts, search and restrained source/visibility cues. The main data comes from existing public APIs (published content only). No route, CMS RBAC, or database changes.

Fallback images from Unsplash are explicitly marked **illustrations only**, never as verified editorial/project photos and never written into CMS Media Library or represented as user-provided documents. Before production release, replace them with cleared owned/licensed design assets through the existing media rights workflow. Responsive layout and keyboard links are covered by tests; Chromium checks were updated to detect the new real React editorial layout.

## Public Web editorial subpages — 2026-11-18

Expanded the approved blue-grey and white magazine design consistently across **public** route families: Articles (index and long-form detail), Tủ sách and chapter reading, the 38-field directory and Template A/B details, Field Notes, Questions and anonymous submission, Dictionary/Tra nhanh, private Connection intake, About, Principles and Contact. The styles are housed in a dedicated `public-pages.css` and scoped below `#main-content`, preserving Admin/CMS and the existing shared Header and Homepage. Vietnamese headings use Noto Serif with neutral spacing; article reading surfaces use structured type/whitespace instead of dashboard-like cards. Responsive styles cover desktop, tablet and mobile; Chromium acceptance now inspects key public listings at 390px for title typography and overflow. No API contracts, RBAC, publishing rules, stored data, or migrations changed.

## Field Notes and Q&A independent local seed — 2026-11-18

Added db:seed-demo-field-qa with 16 fully fictional Field Notes and 24 Q&A examples across eight existing documented design categories. Each Field Note is a source-labeled FIELD_CASE Article plus compliance-flagged field_notes record; each Q&A item has a public-only synthetic published answer with zero private contact or third-party image. Uses a local-only guard, dedicated conspace_app DB role, advisory lock, single transaction, deterministic reserved keys and insert-only idempotency. The acceptance seed was corrected to remove only its one owned [DEMO] Q&A question instead of deleting all [DEMO] reader questions. CI now verifies repeated execution, actual public query predicates and persistence after a separate acceptance seed. None of the fixtures is real field evidence or professional guidance; no production seeding.


## Public Field Notes / Q&A discovery and published cross-links — 2026-11-18

Added URL-based keyword and niche filters to `/hien-truong` and `/hoi-dap`. Backend filters and total counts share the same public visibility constraints; search is a literal case-insensitive substring (not an ILIKE wildcard), with bounded input. Both pages reset pagination on filter/reader changes and provide clear/reset controls, empty states, and accessible labels. Q&A lists now display 12 items per page so the seeded 24-question set exercises load-more. Q&A detail links to a related published FIELD_CASE only when its article approval, publication time, anonymization and media-rights checks all pass; raw related article IDs are not exposed to readers. No migrations or new private-data APIs. CMS and accepted editorial workflow remain unchanged.
