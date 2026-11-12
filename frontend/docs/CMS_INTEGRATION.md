# CONSPACE Frontend / CMS Integration — IA & Editorial Governance v1.0

This document records the frontend integration against the public and admin API contracts. Frontend changes remain inside frontend/**; the API and database are not modified by this work.

## Public information architecture

Primary navigation order:
1. Tủ sách
2. Kho 38 ngách
3. Hiện trường
4. Hỏi đáp
5. Tra nhanh

Secondary organization links: Về CONSPACE, Quy tắc nội dung, Liên hệ. Bàn nghề remains available as a legacy/secondary editorial route. No public Kết nối intake is exposed because no staffed intake workflow is confirmed. No Công nghệ nghề route is exposed without published source-backed content.

Canonical public routes:
- / — homepage and three reader entry points.
- /tu-sach and /tu-sach/:slug — books and published chapter lists.
- /cam-nang/phan-{n}/muc-{n} — handbook chapter route using the currently available chapter slot model.
- /phan-nha-thau/chuong-{n} — contractor book chapter.
- /quan-quanh-kts/chuong-{n} — architect memoir chapter.
- /ngach — niche directory; /ngach/:slug is the construction-niche route.
- /mang/:slug — architecture-area route. A legacy /ngach/:slug request for an architecture area redirects to /mang/:slug.
- /hien-truong and /hien-truong/:id.
- /hoi-dap, /hoi-dap/gui-cau-hoi, /hoi-dap/:id.
- /tra-nhanh — canonical search route.
- /tra-cuu and /tu-dien remain functional aliases to Tra nhanh.
- /ban-nghe remains functional as a secondary editorial route.
- /ve-conspace, /quy-tac-noi-dung, /lien-he.

## Reader lenses

The reader lens is a preference, not an account or authorization role.
- Cookie: conspace_reader, one-year lifetime, Path=/, SameSite=Lax.
- Values: homeowner, architect, contractor.
- Switching the lens does not change the route or remove published content.
- Homepage feed and search sort matching audienceRole first.
- Article listing requests both the selected-role feed and the unfiltered feed, merges by ID, and preserves the unfiltered cursor. This compensates for the current API's role filter, which returns only the selected audience plus shared content.
- Niche detail calls GET /api/v1/niches/:slug without role, so all three published layers are returned together. The selected layer opens by default; manually opened layers remain open when the reader changes lens.

Construction niche layer mapping follows the v1.0 template:
- Homeowner: 1, 3, 4, 5, 7, 11.
- Contractor: 1, 6, 8, 9, 10.
- Architect: 2, 9, 10.

Unpublished blocks display an explicit editorial-in-progress state; they never receive fabricated text. Architecture areas use their separate template and do not render the construction 12-block template.

## Public API resources

| UI surface | API |
|---|---|
| Homepage lanes | GET /api/v1/feed?limit=6 |
| Book index | GET /api/v1/books |
| Book and published chapters | GET /api/v1/books/:slug |
| Chapter body | GET /api/v1/books/:slug/chapters/:chapterNo |
| Niche profile | GET /api/v1/niches/:slug |
| Field-note index/detail | GET /api/v1/field-notes, GET /api/v1/field-notes/:id |
| Public Q&A index/detail | GET /api/v1/questions, GET /api/v1/questions/:id |
| Anonymous question intake | POST /api/v1/questions |
| Quick search | GET /api/v1/search?q=...&type=all&limit=20&page=1 |

Public pages display only API-returned published records. Book chapter slots and unpublished bodies are not fabricated. Field-note costs appear only when both amount and source are present. Public field-note and Q&A images are rendered only from the rights-filtered URLs returned by the public API. Anonymous question phone contact is included only when the reader explicitly opts into private reply; the frontend does not persist it.

## CMS role behavior

The CMS uses the authenticated Backend session cookie and CSRF token. If the session response includes an explicit permissions or grants array, that server-provided list takes precedence. The current Backend session response only includes the role, so the frontend applies a conservative role fallback.

- ADMIN — system administration: dashboard, read-only article access, CMS users and settings. No editorial queue, create/edit, submit, review, schedule, publish or withdraw controls.
- EDITOR — draft authoring, article/field-note/term/Q&A authoring, submission and scheduling where the API permits.
- TECHNICAL_REVIEWER — technical review queue and technical decisions.
- EDITOR_IN_CHIEF — chief review, sensitive-content decisions and publication controls.

The article detail route is read-only for ADMIN. The system-admin dashboard shows only system-level counts and hides editorial queue/schedule panels.

## SEO, sitemap and accessibility

- /tra-nhanh is canonical for /tra-cuu and /tu-dien.
- /mang/:slug is canonical for architecture areas; /ngach/:slug is used for construction niches.
- robots.txt excludes /admin/.
- sitemap.xml contains stable canonical public information pages only; it does not enumerate dynamic chapter/article/case/Q&A records because no public sitemap API is currently available.
- Published chapter and field-note details emit Article JSON-LD; published Q&A details emit QAPage JSON-LD.
- Reader choices use buttons with aria-pressed; niche layers use native details/summary; public forms have explicit labels, error and success states.

## Known API / Backend dependencies not changed in this frontend-only task

1. The current public article list does not return audienceRole, and role filters results. The frontend preserves all published articles with a dual-request merge, but exact selected-role versus shared-content ordering cannot be distinguished from the list response. Feed and search responses do return audienceRole and sort exactly.
2. The current session endpoint does not return explicit permission grants. The frontend honors permissions/grants if added later and otherwise uses the conservative role fallback. Backend still allows ADMIN in several editorial route guards; hiding those controls in the frontend is not a substitute for Backend authorization changes.
3. The current handbook API models a single numbered chapter slot, not a separate part/item hierarchy. The frontend maps the available slot number to both phan-n and muc-n to produce the v1.0 URL without inventing additional chapter data.
4. The public niche API currently exposes the construction Template A sections but not the separate architecture Template B fields. The frontend shows a clear Template B boundary and only renders published articles, cases and chapters until that API is available.
5. The public API does not expose a dynamic sitemap endpoint. The checked-in sitemap therefore lists only stable canonical information pages, not database-backed detail URLs.
6. The contact page intentionally omits phone, email and address because those details were not present in the verified source material.
