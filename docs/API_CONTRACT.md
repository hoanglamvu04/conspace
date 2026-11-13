# CONSPACE API Contract v0.5 — IA Governance v1.0 + Explicit Editorial Permissions

Base production URL: `https://conspace.vn/api`. JSON is UTF-8. Backend runtime is Node.js 22.23.2, Express, JavaScript ESM, Zod and PostgreSQL 16. The CMS uses only the dedicated `conspace` database and `conspace_app` role.

## Editorial invariants

CONSPACE is an independent newsroom, not an XSPACE marketing channel. The API and CMS must preserve these rules:

- Do not create paid PR articles, rankings of contractors, paid takedown workflows, promotional CTA fields, or advertising placements in editorial content.
- Editorial claims require traceable sources. Do not fabricate rates, quantities, warranty periods, technical definitions, authors, field cases or chapter content.
- Describe conduct and mechanisms; do not identify a contractor, client or project when discussing adverse practice.
- A field case cannot enter review until the company/unit and address have been anonymized and image usage rights have been confirmed.
- A claim about industry dark sides, prices/rates, warranty periods, identifiable entities or legal matters requires editor-in-chief review.
- The three reading audiences are lenses: `homeowner`, `architect`, `contractor`. They are not account roles.

## Public API

Public endpoints never return draft, submitted, rejected, withdrawn or otherwise unpublished content.

### GET /api/health

Liveness only. Exact Gate 1 response:

```json
{"ok":true,"service":"conspace-api","stage":"gate1"}
```

### GET /api/ready

When PostgreSQL is reachable:

```json
{"ok":true,"service":"conspace-api","checks":{"database":"up"}}
```

When unavailable: HTTP 503 and `{"ok":false,"service":"conspace-api","checks":{"database":"down"}}`. Never expose driver messages, connection strings or credentials.

### GET /api/v1/niches?group=design|construction

Returns active, source-backed niches only. Niche detail is available at `GET /api/v1/niches/:slug?role=homeowner|architect|contractor`; the optional reader lens changes preference/order only and never filters away another audience layer.

```json
{"ok":true,"data":[{"id":"uuid","slug":"house","name":"HOUSE","group":"design","summary":"","articleCount":0}],"meta":{"total":1}}
```

The confirmed design categories are HOUSE, LUXURY, F&B, STAY, OFFICE, PROJECT, FACTORY and SACRED. The model supports up to 30 construction niches and five construction groups, but their names must be entered from approved source material. Do not seed guessed names. `articleCount` counts published, approved articles from the database.

### GET /api/v1/articles?role=homeowner|architect|contractor&niche=slug&limit=12&cursor=...

Published and approved articles only. Limit defaults to 12 and is capped at 50. Cursor is opaque, versioned keyset pagination.

```json
{
  "ok":true,
  "data":[{
    "id":"uuid","slug":"string","title":"string","excerpt":"string",
    "coverImage":null,"niches":["house"],"publishedAt":"2026-11-12T00:00:00.000Z",
    "author":{"displayName":"string","verified":false}
  }],
  "meta":{"nextCursor":null}
}
```

### GET /api/v1/articles/:slug

Returns full Markdown body, niches, publication/update timestamps, author and source citations. Missing or unpublished article: HTTP 404.

### GET /api/v1/terms?q=...&limit=20

Returns only published, source-backed and technically reviewed terms:

```json
{"ok":true,"data":[{"id":"uuid","term":"string","slug":"string","definition":"string","niches":[]}],"meta":{"total":0}}
```

### POST /api/v1/questions

Anonymous reader intake. No public reader account is created. Use `application/json`:

- `description`: required, 10–10,000 characters.
- `guessedNicheId`: optional UUID.
- `images`: optional array of `{filename,mimeType,data}` base64 image objects; maximum five JPEG/PNG/WebP images, each at most 5 MB decoded.
- `requestPrivateReply`: string `"true"` or `"false"`.
- `phone`: optional. It is discarded unless `requestPrivateReply="true"`; if true, phone is required and encrypted at rest using AES-256-GCM. If the encryption key is not configured, private-reply intake fails closed.

Response confirms receipt only. It never echoes a phone number.

### GET /api/v1/questions and GET /api/v1/questions/:id

Published questions and their published answers only. Images are returned as public media paths only after editorial rights confirmation. Unpublished questions and answers return 404.

### GET /api/v1/media/:id

Serves an image only when it has confirmed usage rights and is linked to published editorial content. Documents remain private to authenticated CMS users.

## Internal CMS authentication

There are no public-reader accounts in this release. All `/api/admin/*` endpoints require an active internal CMS user.

### Roles

| Role | Permissions |
|---|---|
| `ADMIN` | Manage internal staff accounts, explicit role memberships, delegated permissions and system-level configuration. ADMIN alone has no content create/edit/submit/review/approve/publish/withdraw authority. |
| `EDITOR` | Create/edit drafts, manage books/niches/terms/field notes/questions/media and submit content for review. |
| `TECHNICAL_REVIEWER` | Review technical accuracy and return/reject/approve assigned editorial material; cannot publish by virtue of this role. |
| `EDITOR_IN_CHIEF` | Review sensitive content, approve, schedule, publish and withdraw editorial material. |

A staff account may hold multiple explicit roles. `role` is the primary compatibility field; `roles` is the complete membership list returned by login/session and staff APIs. Separate reasoned grants are available:
- `CONTENT_PUBLISH`: publish only content that has already passed the required review and is due; it does not grant review rights.
- `CONTENT_WITHDRAW`: withdraw content only; it does not grant review or publish rights.
- ADMIN does not inherit either grant. Current pre-v1.0 ADMIN accounts retain temporary, explicit and audited compatibility memberships until replacement editorial staff are provisioned; new ADMIN-only accounts receive no editorial membership.

Role checks are enforced by the API, not by hiding frontend controls.

### Session and CSRF

- `POST /api/admin/auth/login` accepts `{"email":"...","password":"..."}`.
- Successful login sets `conspace_admin_session`: HttpOnly, SameSite=Strict, Path=/api/admin, Secure in production; the response returns a CSRF token.
- `GET /api/admin/auth/session` returns the current user and a CSRF token for page refresh.
- Every unsafe admin request (POST, PUT, PATCH, DELETE), including logout, must send `X-CSRF-Token` and an allowed same-origin `Origin`.
- `POST /api/admin/auth/logout` revokes the server-side session and clears the cookie.
- `POST /api/admin/auth/password` accepts `currentPassword` and `newPassword`; new passwords must be at least 14 characters.
- Sessions expire after `SESSION_TTL_HOURS` (1–24; default 8). Session tokens are random opaque values; only SHA-256 token hashes are stored.
- Passwords use scrypt with per-password random salts. Login is rate-limited to five failed attempts per 15-minute IP bucket. IPs are hashed in the rate-limit table.
- Bootstrap the first ADMIN through the CLI with a password piped through stdin. No default password exists.

### Common admin response and errors

Success: `{"ok":true,"data":...}`. Errors:

```json
{"ok":false,"error":{"code":"FORBIDDEN","message":"You do not have permission to perform this action"}}
```

Validation errors use HTTP 400; unauthenticated 401; forbidden/CSRF 403; missing 404; conflicts or invalid workflow transitions 409; rate limit 429; oversized upload 413; unexpected errors 500. Database and filesystem internals are never returned.

## Admin API

All endpoints below are prefixed with `/api/admin`, require a valid session and CSRF header for unsafe methods.

### Auth and staff

- `POST /auth/login`, `GET /auth/session`, `POST /auth/logout`, `POST /auth/password`.
- `GET /users`, `POST /users`, `PATCH /users/:id`, `POST /users/:id/revoke-sessions`. ADMIN only. Staff rows include `personId`, explicit `roleAssignments`, `permissionAssignments`, `activeSessionCount`, last login and password-change status. Create accepts `role`, optional `roles`, `roleReason`, `permissions`, `permissionReason` and `personId`; linking/changing an existing person identity requires `identityReason`. Additional roles and nonempty delegated grants require a reason; role/permission/identity changes revoke active sessions. Session revocation is explicit and audited. User create/reset requires a 14+ character password. Password hashes are never returned.
- `GET /authors`, `POST /authors`, `PATCH /authors/:id`, `DELETE /authors/:id`. ADMIN/EDITOR can manage author profiles; only ADMIN can change verification. Deactivation is soft.

### Articles

- `GET /articles?status=&role=&search=&page=&limit=`
- `POST /articles`
- `GET /articles/:id`
- `PATCH /articles/:id`
- `DELETE /articles/:id` — soft archive of an unpublished draft only.
- `GET /articles/:id/revisions`
- `POST /articles/:id/submit`
- `POST /articles/:id/schedule` with `{"scheduledAt":"ISO-8601"}`
- `POST /articles/:id/publish`
- `POST /articles/:id/withdraw` with a reason.

Article fields: slug, title, excerpt, Markdown body, cover image URL/media, audience role, content type, author, niche IDs, tags, sources/citations, sensitivity flags and an explicit `sensitivityAssessed` attestation. Allowed sensitivity flags: `INDUSTRY_DARK_SIDE`, `PRICE_OR_RATE`, `WARRANTY_PERIOD`, `IDENTIFIABLE_ENTITY_RISK`, `LEGAL_CONTENT`. An article cannot be submitted until the editor explicitly assesses these flags.

### Editorial workflow

1. `DRAFT` → `SUBMITTED` by an editor.
2. Technical reviewer starts the review: `SUBMITTED` → `TECHNICAL_REVIEW`.
3. Technical decision: `APPROVED`, `REQUEST_CHANGES` → `NEEDS_CHANGES`, or `REJECTED`.
4. If a sensitivity flag is present, technical approval routes to `EDITOR_IN_CHIEF_REVIEW`. Otherwise it routes to `APPROVED`.
5. Editor-in-chief decision routes to `APPROVED`, `NEEDS_CHANGES` or `REJECTED`.
6. Approved articles can be scheduled by EDITOR or EDITOR_IN_CHIEF, or immediately published by EDITOR_IN_CHIEF or an explicitly delegated `CONTENT_PUBLISH` user. Scheduled articles are published by the backend worker when due.
7. Published material can be withdrawn by EDITOR_IN_CHIEF or an explicitly delegated `CONTENT_WITHDRAW` user. Withdrawal is audited.

Review endpoints:

- `GET /reviews/queue?stage=TECHNICAL|EDITOR_IN_CHIEF` returns `articles`, `terms`, `answers` and `nicheSections` collections; each niche section identifies `nicheId`, `sectionNo`, optional `audienceRole` and `templateType`.
- `GET /niches/:id/sections` returns the section ID and workflow metadata required to open a queued Template A/B block.
- `POST /reviews/articles/:id/start`
- `POST /reviews/articles/:id/decision` with `{"stage":"TECHNICAL|EDITOR_IN_CHIEF","decision":"APPROVED|REQUEST_CHANGES|REJECTED","reason":"..."}`
- `POST /reviews/terms/:id/start`, `POST /reviews/terms/:id/decision`
- `POST /reviews/question-answers/:id/decision`
- `POST /reviews/niche-sections/:id/start` with `{templateType}`
- `POST /reviews/niche-sections/:id/decision` with `{templateType,stage,decision,reason}`

The creator and mapped author cannot review or approve their own article. The same self-review restriction applies to terms, Q&A answers and niche sections. Identity checks compare `personId`, so two CMS accounts linked to the same real staff member are still treated as one person. ADMIN cannot bypass this rule. Review reasons are mandatory and retained.

### Niches

- `GET /niches`, `POST /niches`, `PATCH /niches/:id`, `DELETE /niches/:id` (soft deactivation).
- `GET /niches/groups`, `POST /niches/groups`, `PATCH /niches/groups/:id`.
- `GET /niches/:id/sections`, `PUT /niches/:id/sections/:sectionNo` (save draft), `POST /niches/:id/sections/:sectionNo/submit`, `POST /niches/:id/sections/:sectionNo/publish`.

The CMS stores the 12-block core niche template and its three audience-layer mappings. Database guards enforce no more than eight design categories, 30 construction niches and five construction groups. Construction niches require a group and source reference. No undocumented 30-niche list or five group names are seeded.

### Books and chapters

- `GET /books`, `POST /books`, `GET /books/:id`, `PATCH /books/:id`.
- `GET /chapters?bookId=`, `POST /chapters`, `PATCH /chapters/:id`, `DELETE /chapters/:id`.

The database seeds only the three confirmed book records and 58 numbered empty chapter slots:
- Cẩm nang Kiến trúc Hòa Lạc — 9 parts — `REFERENCE` / “Tài liệu tra cứu”.
- Phận nhà thầu xây dựng — 24 chapters — `NON_FICTION` / “Phi hư cấu”.
- Quẩn quanh KTS — 25 chapters — `FICTIONALIZED` / “Tự sự, có hư cấu”.

Chapter titles and body content are not fabricated. Chapters link to articles so the same review and publication workflow applies.

### Field notes

- `GET /field-notes?status=&compliance=ready|blocked&search=&page=&limit=`, `POST /field-notes`, `GET /field-notes/:id`, `PATCH /field-notes/:id`, `DELETE /field-notes/:id`.
- Field-note list rows include `sourceCount`, `mediaCount`, `unconfirmedMediaCount`, `fieldComplianceReady` and `reviewReady`; response metadata includes totals for compliant, blocked, ready-to-submit and returned cases.
- Field-note detail includes the linked article niches, sources, sensitivity flags and media rights metadata so editing does not erase existing relations.

Structured fields: phenomenon, root cause, intervention point, optional repair cost and its source, related niches, media, unit/company anonymization, address anonymization and photo-rights confirmation. A cost cannot be entered without a source. Field notes cannot be submitted until both anonymization flags and image-rights confirmation are true; every attached image must independently have confirmed usage rights. Article body, audience, sensitivity assessment and at least one traceable source are also required before review.

### Dictionary terms

- `GET /terms?status=&search=&page=&limit=`, `POST /terms`, `GET /terms/:id`, `PATCH /terms/:id`, `DELETE /terms/:id`.
- `POST /terms/:id/submit`, `POST /terms/:id/publish`.

A term requires a source reference before technical review. Public dictionary results include only published, reviewed terms.

### Reader questions and answers

- `GET /questions?status=&page=&limit=`, `GET /questions/:id`, `PATCH /questions/:id`.
- `POST /questions/:id/answer`, `POST /questions/:id/answer/submit`, `POST /questions/:id/answer/publish`.

Reader questions are anonymous. Private phone contact is decrypted only for ADMIN/EDITOR and only when the reader explicitly requested a private reply. Every private-contact access is audit logged. Q&A answers use the technical review workflow and route sensitive content to the editor-in-chief. Reader images cannot be published until usage rights are confirmed.

### Media

- `GET /media?page=&limit=&category=&rights=confirmed|unconfirmed&search=`
- List rows include `articleUsageCount`, `fieldNoteUsageCount`, `questionUsageCount` and `usedPublicly` so the CMS can show actual usage before editing or deleting a file. The response includes pagination `meta.total`.
- `POST /media` JSON body `{file:{filename,mimeType,data},altText,rightsConfirmed,rightsNote}`, where `data` is base64.
- `PATCH /media/:id` for alt text and rights metadata.
- `GET /media/:id/download`
- `DELETE /media/:id` — soft delete; media referenced by published articles, field notes or published Q&A cannot be deleted.

Allowed file signatures: JPEG, PNG, WebP and PDF. Admin upload maximum is 10 MB. Public question image maximum is five images at 5 MB each. MIME is checked against file magic bytes; extension is generated by the server, file names are sanitized, and storage keys are random UUIDs. Files are stored outside Git with restrictive permissions. Rights confirmation requires a note.

## Database, migration and bootstrap

- All tables live in schema `conspace` inside database `conspace`; role must be `conspace_app`.
- Migration runner is transactional, uses an advisory lock and checks SHA-256 checksums. Applied migration files cannot be edited.
- Run `npm run db:migrate --prefix backend`, then `npm run db:seed --prefix backend`.
- First admin bootstrap: `printf '%s' "$ADMIN_PASSWORD" | npm run cms:bootstrap-admin --prefix backend -- --email admin@example.com --name "CONSPACE Admin"`. Password is read from stdin, must be 14–256 characters, and is never committed or logged.
- Set a unique `CONTACT_ENCRYPTION_KEY` generated by a secret manager or `openssl rand -hex 32` before accepting private-reply phone numbers.
- Set `MEDIA_STORAGE_DIR` to a persistent directory outside the repository in production. Back up media storage with the CONSPACE database.
- Do not run migrations against `hola_maps` or `x_hub`. Migration CLI refuses any database/role pair other than `conspace`/`conspace_app`.

## Audit, revisions and privacy

- `GET /api/admin/audit?entityType=&entityId=&action=&page=&limit=` returns one chronological stream combining `audit_logs` and `workflow_events`, including actor, action, before/after snapshots, workflow status transitions, reason and metadata. Internal authenticated CMS roles can read this history; write access does not exist on this endpoint.
- Article revisions store versioned snapshots before each content edit.
- Audit logs record actor, action, entity, before/after data, request IP and user-agent. Password hashes, session tokens, CSRF tokens and private phone plaintext are never written to audit data.
- Workflow events record status transitions, actor, reason and timestamp.
- Private phone numbers are encrypted with AES-256-GCM and are never returned from public APIs.
- No public user account, marketplace, bidding, escrow, ranking, paid PR, or free-form technical/legal chatbot is introduced by this CMS release.




## IA & Editorial Governance v1.0 — API additions and semantics (v0.4)

### Reader perspectives are preferences, never access controls

homeowner, architect, and contractor are reading perspectives, not CMS roles or access scopes. The optional role query ranks matching published content first but never filters other published perspectives:
- GET /api/v1/articles?role=...
- GET /api/v1/search?role=...
- GET /api/v1/feed?role=...
- GET /api/v1/books?role=...
- GET /api/v1/field-notes?role=...
- GET /api/v1/niches/:slug?role=...

No role defaults to homeowner preference. Reset cursors when changing perspective. Opaque v2 article cursors are bound to the selected role; a mismatched role returns 400. v1 cursors remain accepted chronologically for rollout compatibility.

### Niche templates

GET /api/v1/niches adds templateType and expectedSectionCount. Eight documented design categories use TEMPLATE_B (7 blocks). Construction niches use TEMPLATE_A (12 blocks), with capacity for 30. Five construction groups are source-managed. No undocumented construction names or content are seeded.

Template A returns exactly 12 sections. Each section has sectionNo, key, title, sharedContent, sharedSourceRef, and layers. layers includes all documented homeowner, architect and contractor mappings, including empty entries. Shared content is stored once with audience_role IS NULL. Role selects ordering/lens only and never removes another layer.

Template A layer map: homeowner blocks 1,3,4,5,7,11; contractor blocks 1,6,8,9,10; architect blocks 2,9,10.

Template B returns exactly seven shared blocks with layers: []. The seven documented block titles are:
1. Ranh giới loại công trình.
2. Đặc thù.
3. Chuỗi ngách.
4. Quy chuẩn/pháp lý riêng.
5. Rủi ro.
6. KTS chuyên mảng.
7. Năng lực/giới hạn giao việc.

Template B does not invent perspective-specific layers. Empty source content stays empty. Public linked articles, books and field notes remain published-only.

### CMS roles and explicit publishing delegation

Authenticated user/session and GET /api/admin/users now return:
~~~json
{"id":"uuid","role":"ADMIN","roles":["ADMIN"],"permissions":[],"personId":"uuid"}
~~~

roles is the explicit role membership list used by server authorization. A user can hold multiple roles. ADMIN alone manages accounts and roles but cannot create/edit/submit content, review, approve, publish or withdraw. EDITOR creates/edits/submits and schedules. TECHNICAL_REVIEWER performs technical review only. EDITOR_IN_CHIEF reviews sensitive content and can approve, publish and withdraw.

Separate reasoned capabilities support delegation:
- CONTENT_PUBLISH allows publication of already approved/due content only. It does not allow technical or Chief review.
- CONTENT_WITHDRAW allows withdrawal only.
- EDITOR_IN_CHIEF role includes publish/withdraw authority.
- ADMIN does not inherit either permission.

POST /api/admin/users accepts optional roles, roleReason, permissions, permissionReason and personId. Any additional role requires roleReason. Any nonempty permissions list requires permissionReason. Permissions are CONTENT_PUBLISH and CONTENT_WITHDRAW. PATCH /api/admin/users/:id replaces roles or permissions when the corresponding array is supplied; changing only primary role preserves other explicit roles. Role/permission/identity changes revoke active sessions.

An ADMIN cannot grant additional roles, delegated permissions, or change/link personId to their own staff identity. The last active ADMIN membership cannot be removed. personId links multiple CMS accounts belonging to one real staff member; self-review checks compare personId, not account ID.

Publishing route permissions:
- POST /api/admin/articles/:id/publish: EDITOR_IN_CHIEF or explicit CONTENT_PUBLISH; approved or due-scheduled article only.
- POST /api/admin/articles/:id/withdraw: EDITOR_IN_CHIEF or explicit CONTENT_WITHDRAW; reason required.
- Term, Q&A and niche-section publish: EDITOR_IN_CHIEF or explicit CONTENT_PUBLISH.
- Technical and Chief review endpoints remain role-gated; publishing delegation never grants review rights.

### Legacy ADMIN compatibility

Migrations 004_ia_governance.sql, 005_niche_section_workflow.sql and 006_niche_section_review_ledger.sql are additive. Migration 004 creates cms_user_roles, cms_user_permissions and cms_users.person_id, migrates primary roles, and gives each currently active pre-v1.0 ADMIN explicit, audited LEGACY_ADMIN_COMPAT memberships for EDITOR, TECHNICAL_REVIEWER and EDITOR_IN_CHIEF. Migrations 005–006 add creator identity, sensitivity assessment, submission/technical/Chief review, approval/publication timestamps and review-ledger support for Template A/B niche sections. These are temporary explicit grants, not permissions inherited from ADMIN. New ADMIN-only accounts receive ADMIN only and no publishing permission.

Provision replacement EDITOR, TECHNICAL_REVIEWER and EDITOR_IN_CHIEF staff before removing the legacy grants. Revoke them through PATCH /api/admin/users/:id with roles and roleReason. Application rollback can continue using the unchanged cms_users.role column; retain additive role, permission, identity and audit tables.

### Public visibility invariants

Public APIs return only PUBLISHED content with approval and publication timestamps. Field cases additionally require unit/address anonymization and image rights. Terms require technical review and a source. Q&A answers require an approved published answer. Chapters expose body/navigation only when their linked article is published. Public media requires rights confirmation and eligible published linkage. Documents remain private.


## Publishing Engine v0.3 (public, no authentication)

All endpoints below use the existing envelope: success = { "ok": true, "data": ... }, error = { "ok": false, "error": { "code": "...", "message": "..." } }. All public SQL queries filter to approved PUBLISHED content (never DRAFT/APPROVED-only/SCHEDULED/REJECTED/WITHDRAWN). No placeholders or fake counts.

### GET /api/v1/feed?limit=6&role=homeowner|architect|contractor

Response: { "ok": true, "data": { "books": [], "articles": [], "fieldNotes": [], "questions": [] } }. Each lane is a DB-backed list ordered by publishedAt descending, default 6/max 20. Books = newest published chapters; fieldNotes = published and anonymized cases with confirmed photo rights; questions = approved and published answers.

### GET /api/v1/books?role=homeowner|architect|contractor

Data array: id, slug, title, audienceRole, contentLabel, contentLabelVi, expectedChapterCount, publishedChapterCount, latestPublishedAt. The 3 documented books have labels REFERENCE (Tài liệu tra cứu), NON_FICTION (Phi hư cấu), FICTIONALIZED (Tự sự, có hư cấu).

### GET /api/v1/books/:slug

Data: book metadata plus chapters array containing only approved PUBLISHED chapters; unpublished chapter slots and bodies are not returned. Unknown slug: 404.

### GET /api/v1/books/:slug/chapters/:chapterNo

Data: bookId, bookSlug, bookTitle, contentLabel, contentLabelVi, chapterNo, displayLabel, chapterTitle, articleId, articleSlug, title, excerpt, body, publishedAt, sources, previous, next. Previous and next are adjacent **published** chapters or null. Missing/unpublished: 404.

### GET /api/v1/niches/:slug?role=homeowner|architect|contractor

Data: niche metadata, lens, sections, articles, fieldNotes, chapters and relatedNiches. Template A has exactly 12 blocks; each block includes sectionNo, key, title, sharedContent, sharedSourceRef and its mapped `layers` array (including empty entries). Template B has exactly seven shared blocks and `layers: []`. The optional role query changes preference/order only and never removes another reader layer. Only PUBLISHED sections with approval timestamps, publication timestamp and a nonempty source reference are exposed. Unknown/inactive niche: 404.

### GET /api/v1/field-notes?niche=&role=homeowner|architect|contractor&limit=12&offset=0

Data: published, approved and fully anonymized field-case summaries; meta: total, limit, offset. Maximum limit 50. Unconfirmed image rights prevent public visibility.

### GET /api/v1/field-notes/:id

Data: id, articleId, slug, title, excerpt, body, publishedAt, phenomenon, rootCause, interventionPoint, repairCostAmount, repairCostCurrency, repairCostSource, images. Only real, rights-confirmed images are returned. Unpublished or non-anonymized: 404.

### GET /api/v1/search?q=...&type=all|article|niche|term|chapter|field_note&role=&niche=&limit=20&page=1

Search uses PostgreSQL full-text with parameterized SQL, to_tsvector('simple'), plainto_tsquery('simple') and ts_rank_cd. q length 2–120. Limit 1–50; page 1–1000.

Data array: {id,slug,title,snippet,type,publishedAt,audienceRole,bookSlug,chapterNo,score}. Meta: {q,type,total,limit,page,hasMore}. Search never exposes unpublished articles, draft chapter bodies, unreviewed terms, private field cases or unanswered questions.

## Frontend CMS integration: request bodies and transitions

- Authentication: POST /api/admin/auth/login body {email,password}. Response {ok:true,data:{user,csrfToken,expiresAt}} plus HttpOnly SameSite=Strict session cookie (Secure on production HTTPS). GET /api/admin/auth/session returns the same CSRF token. Every unsafe admin request requires credentials: include and X-CSRF-Token; production also requires allowed Origin.
- Staff: GET/POST /api/admin/users, PATCH /api/admin/users/:id, ADMIN only. Create accepts {email,displayName,role,password,roles?,roleReason?,permissions?,permissionReason?,personId?}; password length >=14. Role/permission/identity changes require reasons and revoke active sessions.
- Articles: GET /api/admin/articles?status=&role=&search=&page=&limit=, GET /api/admin/articles/:id and GET /api/admin/articles/:id/revisions are readable to assigned internal roles. POST /api/admin/articles requires EDITOR; PATCH /api/admin/articles/:id and DELETE unpublished drafts also require EDITOR. ADMIN alone is read-only. coverImageUrl accepts a normal absolute URL or the canonical internal media path /api/v1/media/:uuid so local CMS editing never needs to persist a 127.0.0.1 origin.
- Submit: POST /api/admin/articles/:id/submit {} transitions DRAFT/NEEDS_CHANGES to SUBMITTED. Explicit sensitivityAssessed, a nonempty body, a primary audienceRole and at least one traceable source are required, as are rights and field-note anonymization where relevant. Drafts may remain incomplete; the submit boundary is where these editorial requirements are enforced.
- Start technical review: POST /api/admin/reviews/articles/:id/start {} (TECHNICAL_REVIEWER). Decision: POST /api/admin/reviews/articles/:id/decision {stage:"TECHNICAL",decision:"APPROVED|REQUEST_CHANGES|REJECTED",reason:"..."} (TECHNICAL_REVIEWER). Sensitive flags route technical approval to EDITOR_IN_CHIEF_REVIEW.
- Chief decision: POST /api/admin/reviews/articles/:id/decision {stage:"EDITOR_IN_CHIEF",decision:"APPROVED|REQUEST_CHANGES|REJECTED",reason:"..."} (EDITOR_IN_CHIEF). Neither reviewer nor admin can approve their own article.
- Publish: POST /api/admin/articles/:id/publish {} (EDITOR_IN_CHIEF or explicit CONTENT_PUBLISH), only APPROVED or due SCHEDULED. Schedule: POST /api/admin/articles/:id/schedule {scheduledAt:"2026-11-13T02:00:00+07:00"} (EDITOR/EDITOR_IN_CHIEF), APPROVED and future date only. Withdraw: POST /api/admin/articles/:id/withdraw {reason:"..."} (EDITOR_IN_CHIEF or explicit CONTENT_WITHDRAW). A one-minute background loop locks due rows with SKIP LOCKED and logs events.
- Media: POST /api/admin/media application/json {file:{filename:"site.png",mimeType:"image/png",data:"<base64>"},rightsConfirmed:false,rightsNote:null,altText:"..."}. 10 MB decoded limit, 14 MB JSON request limit. JPEG/PNG/WebP/PDF signatures checked. For rightsConfirmed=true provide rightsNote; private PDF never served publicly. Other endpoints: GET/PATCH /api/admin/media/:id, GET /api/admin/media/:id/download, DELETE /api/admin/media/:id.
- Reader Q&A: POST /api/v1/questions application/json {description,guessedNicheId?,requestPrivateReply:"false",phone?,images?:[{filename,mimeType,data}]}; max five 5 MB decoded images, 35 MB JSON limit. Phone is discarded unless private reply explicitly requested; then encrypted with AES-256-GCM and disclosed only to authorized staff. CMS: GET/PATCH /api/admin/questions/:id, POST /api/admin/questions/:id/answer, POST /api/admin/questions/:id/answer/submit, POST /api/admin/questions/:id/answer/publish, POST /api/admin/reviews/question-answers/:id/decision.
- Niche section: EDITOR saves with PUT /api/admin/niches/:id/sections/:sectionNo {audienceRole?,content,sourceRef,sensitivityAssessed,sensitivityFlags}; Template A uses homeowner/architect/contractor or null for one shared stored block, Template B omits audienceRole. Template A block 6 is intrinsically INDUSTRY_DARK_SIDE: the Backend adds that sensitivity flag and requires EDITOR_IN_CHIEF review even if a caller omits the flag. EDITOR submits with POST /api/admin/niches/:id/sections/:sectionNo/submit {audienceRole?,reason}; TECHNICAL_REVIEWER starts and decides via /reviews/niche-sections/:id/start and /reviews/niche-sections/:id/decision. Sensitive content also requires EDITOR_IN_CHIEF review. Publish with POST /api/admin/niches/:id/sections/:sectionNo/publish {audienceRole?,reason} (EDITOR_IN_CHIEF or CONTENT_PUBLISH) only after approval and with a source. A PUBLISHED section cannot be overwritten by PUT; until a versioned revision workflow is introduced, the API returns 409 PUBLISHED_REVISION_REQUIRED so live content cannot disappear into DRAFT. Only published, approved and source-backed sections are public; old PUBLISHED rows without approval metadata are not exposed.

Errors: 400 VALIDATION_ERROR, 401 UNAUTHENTICATED/INVALID_CREDENTIALS, 403 FORBIDDEN/CSRF_INVALID/AUTHOR_CANNOT_APPROVE, 404 NOT_FOUND, 409 INVALID_STATE/CONFLICT/MEDIA_RIGHTS_REQUIRED/MEDIA_RELATION_REQUIRED/ARTICLE_CONTENT_REQUIRED/AUDIENCE_REQUIRED/SOURCE_REQUIRED/PUBLISHED_REVISION_REQUIRED, 413 PAYLOAD_TOO_LARGE, 415 UNSUPPORTED_MEDIA_TYPE, 429 RATE_LIMITED, 503 DATABASE_UNAVAILABLE/PRIVATE_REPLY_UNAVAILABLE, 500 INTERNAL_ERROR. Never expose connection strings or user secrets.
