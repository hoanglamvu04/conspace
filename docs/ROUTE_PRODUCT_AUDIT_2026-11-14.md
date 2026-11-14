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
| `/hien-truong/:id` | 1 | PARTIAL | Functional detail page, but IA target says human-readable `/hien-truong/{slug}`; current public URL exposes UUID. | P1 |
| `/hoi-dap` | 1 | COMPLETE | Published question + published answer only. | P0 |
| `/hoi-dap/gui-cau-hoi` | 1 | COMPLETE | Anonymous intake, optional encrypted private contact, max 5 images, no reader account. | P0 |
| `/hoi-dap/:id` | 1 | COMPLETE | Published answer detail and rights-confirmed public images only. | P0 |
| `/tra-nhanh` | 1 | PARTIAL | Search/facets/lens/niche filters are real. IA also calls for the source-backed “Tôi thấy… → xem mục nào” symptom map from Cẩm nang part 9; that structure is not yet implemented. | P1 |
| `/tra-cuu` | legacy | COMPLETE alias | Preserved as the unified lookup surface. | P1 |
| `/tu-dien` | legacy | COMPLETE alias | Preserved as lookup entry. | P1 |
| `/tu-dien/:slug` | 1 | COMPLETE | Published, reviewed, source-backed term detail with related niches. | P1 |
| `/bai-viet` | supporting | COMPLETE | Published article index with reader preference ranking and pagination. | P0 |
| `/bai-viet/:slug` | supporting | COMPLETE | Published-only body, author, sources, related content and cover. | P0 |
| `/ban-nghe` | legacy / v1 | PARTIAL | Route is preserved, but currently calls the same article list as `/bai-viet`; no distinct “góc nhìn/đời nghề” content selection exists. | P1 |
| `/ve-conspace` | 1 | COMPLETE | Public editorial identity and governance explanation are present. | P1 |
| `/quy-tac-noi-dung` | 1 | COMPLETE | Six editorial commitments are presented as a dedicated public page. | P1 |
| `/lien-he` | 1 | PARTIAL / SOURCE-BLOCKED | Legal operator is shown, but verified address/email/phone are unavailable in approved project sources, so the page correctly refuses to invent them. | P1 |
| `/ket-noi` and `/ket-noi/{du-an|kien-truc-su|nha-thau|tham-gia}` | 1 | **MISSING** | IA requires private manual intake; no public route, database, API or CMS triage exists at audit baseline. | **P0** |
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
| `/admin/chapters` | PARTIAL | Can create/edit/link chapter slots, but linking requires pasting an article UUID and UI does not expose the existing delete/detach workflow cleanly. | P1 |
| `/admin/field-notes` | COMPLETE | Compliance dashboard, authoring, sources/media, submit readiness and feedback. | P0 |
| `/admin/dictionary` | COMPLETE | Create/edit/source/niche link/submit/publish plus review feedback. | P1 |
| `/admin/questions` | COMPLETE with one known limitation | Intake triage, private contact access audit, answer workflow and publishing exist. Guessed niche cannot currently be corrected because Backend has no such PATCH field. | P1 |
| `/admin/media` | COMPLETE | Upload, rights metadata, usage awareness and guarded deletion. | P0 |
| `/admin/audit` | COMPLETE | Unified audit/workflow event history from Backend. | P0 |
| `/admin/users` | COMPLETE | Multi-role/person identity/delegated permission/session revocation. | P0 |
| `/admin/settings` | COMPLETE for current Backend scope | Account/session/password security is real; business-policy toggles are intentionally absent because no settings API exists. | P2 |
| dedicated author-management page | PARTIAL / MISSING UI | Backend author CRUD exists and Article Editor consumes authors, but there is no dedicated CMS route to manage author profiles. | P1 |
| `/admin/connections` | **MISSING** | Required to manually triage phase-1 private Connection intake. | **P0** |

## Cross-route findings

1. **Primary missing v1 product flow: Connection intake.** The IA marks it phase 1, but baseline has no public form, private persistence or internal triage.
2. **Bàn nghề is visually distinct only by heading/copy, not data semantics.** It currently renders the same published article stream as `/bai-viet`.
3. **Field Note public URLs are functional but not aligned with the IA slug target.**
4. **Quick lookup is already a strong search surface, but the source-backed symptom map (“Tôi thấy…”) remains a separate content-model gap.**
5. **Static organization pages are acceptable as code-owned content for v1; Contact cannot be completed with phone/email/address until verified source material is supplied.**
6. **CMS is substantially more complete than the public route map.** The highest CMS gaps are Connection triage, author-profile UI and chapter-linking ergonomics.

## Execution order after audit

### P0 — finish phase-1 product
1. Build private Connection intake end-to-end:
   - public `/ket-noi` landing + four forms;
   - encrypted contact storage;
   - no public listing;
   - ADMIN/EDITOR triage in `/admin/connections`;
   - audit trail and tests.
2. Re-run full route/API/CI gate.

### P1 — close visible “half-built” routes
1. Give `/ban-nghe` a real editorial selection instead of duplicating `/bai-viet`.
2. Move Field Note detail to a stable slug URL while keeping UUID compatibility.
3. Improve chapter article linking UI and expose safe detach/delete behavior.
4. Add dedicated Author Profile management UI.
5. Add source-backed “Tôi thấy…” mapping only when Cẩm nang part 9 data is actually available.
6. Complete Contact only from verified legal/contact source data.

### P2/P3 — intentionally later
- Công nghệ nghề (phase 2).
- Hồ sơ ngành (phase 3).
- Deep SEO/structured-data expansion only after the product routes above are stable.
