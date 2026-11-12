# CONSPACE — CMS security audit and media contract

Status: **audit of the current main branch**, not a live-VPS penetration test. Scope is limited to \`ops/**\` and \`.github/workflows/**\`; Backend must implement application authentication, authorization and upload handling before any CMS is exposed.

## 1. What exists today

The current Backend is a public-read API scaffold:

- \`backend/src/app.js\` uses Helmet, a CORS origin allowlist, JSON body limit 256 KiB and Morgan combined logging.
- \`GET /api/health\` is liveness; \`GET /api/ready\` checks PostgreSQL.
- \`/api/v1\` currently exposes public GET routes for niches, articles and terms. The repository filters articles to approved/published records.
- Production env validation rejects a non-loopback HOST; intended API bind is \`127.0.0.1:5088\`.
- No admin login, session store, admin router, user/role model, CSRF middleware, authentication rate limiter, editorial workflow API or upload endpoint exists in the inspected main tree.

**Conclusion:** CMS security cannot currently be passed because a CMS is not implemented. This is not a reason to hide an admin URL; it is a hard implementation gate. Do not add an admin frontend or expose write endpoints until Backend ships and tests the controls below. CORS is not authorization. Helmet is not authorization. An unguessable/hidden route is not authorization.

The VPS Nginx configuration, active PM2 state, cookies, TLS headers and filesystem permissions have not been inspected over SSH in this task. Do not claim those live controls are verified.

## 2. Required identity, session and CSRF controls (Backend-owned)

- Invite-only staff accounts. No public self-registration for privileged roles.
- Password hashes using Argon2id with parameters reviewed against the production host; MFA required for admin and publisher roles.
- Server-side sessions in a shared durable store (PostgreSQL is available); never trust role claims supplied by the browser.
- Cookie name \`__Host-conspace_admin\`; Secure, HttpOnly, SameSite=Strict, Path=/, no Domain attribute. Rotate session ID on login, MFA completion and privilege change; revoke server-side on logout, password reset and account disable.
- Suggested expiry: 30-minute idle timeout and 12-hour absolute lifetime, configurable by security owner.
- Cookie-authenticated state changes require a synchronizer CSRF token in a custom header plus strict Origin validation. SameSite is defense-in-depth, not the only CSRF control. GET/HEAD must never mutate state.
- Rate-limit login by both source IP and normalized account identifier (e.g. 5 attempts / 15 minutes with progressive delay); use generic login errors and single-use, short-lived password reset tokens. Avoid permanent lockout that enables denial of service.
- CORS must remain same-origin in production. Never enable wildcard origins with credentials.
- Validate input server-side with strict schemas. Deny by default; every admin route must explicitly require an authenticated principal and a permission.

## 3. Authorization matrix — required before CMS release

| Principal | Draft/edit | Technical review | Manage roles | Publish ordinary | Publish sensitive |
|---|---:|---:|---:|---:|---:|
| Anonymous / reader | No | No | No | No | No |
| Editor | Own/assigned drafts | No | No | No | No |
| Technical reviewer | No | Yes, technical decision only | No | No | No |
| Publisher / chief editor | Assigned editorial work | No self-review | No | Yes, after required review | Final approval only after independent technical review |
| Admin | Account/role administration | No self-approval | Yes, audited | Only with publisher permission | Never bypass two-person approval |

Additional invariants:

1. An editor/author cannot approve or publish their own article.
2. A technical reviewer cannot change their own role, another user's role, or set publication state.
3. A normal user/editor cannot call admin APIs even if they know the URL or submit a forged role field.
4. Sensitive content (legal issues, alleged misconduct, identifiable field cases, prices/standards, safety claims) requires a technical reviewer and a separate publisher/chief editor. The author must be a third identity or at minimum not either approver.
5. Publication requires all required approvals in the database; UI state is not authority. Direct API calls must return 401 for anonymous, 403 for insufficient permissions, and 409/422 when required approvals are missing.
6. Role assignment is admin-only, requires MFA, records before/after roles, and cannot be performed by a technical reviewer.

Backend acceptance tests must exercise direct API calls, not only UI buttons: anonymous admin read/write; editor to admin/role endpoints; reviewer to role endpoints; reviewer publishing; ordinary user approving sensitive content; author self-approval; publisher publishing without required review; CSRF missing/invalid; expired/revoked session; login brute force.

Use \`bash ops/scripts/cms-security-probe.sh\` for a read-only unauthenticated probe after admin routes exist. A 404 means CMS is absent, not protected. The probe exits with a blocked status if the sampled CMS routes are absent/incomplete.

## 4. Media storage contract — Backend and Ops

### Filesystem

- Absolute \`MEDIA_ROOT=/var/lib/conspace/media\`, outside \`/var/www/conspace\` and outside Git.
- \`staging/\` and \`private/\`: root:root mode 0700. Not mapped by Nginx.
- \`public/\`: root:www-data mode 2750 (setgid); published files root:www-data mode 0640. Confirm actual Nginx worker group before setup; do not use chmod 777.
- Ops prepares these paths with \`bash ops/scripts/setup-storage.sh --apply\`. It does not edit \`backend/.env\`; add \`MEDIA_ROOT=/var/lib/conspace/media\` to that private file (mode 600) only after Backend confirms it reads the variable.
- PM2 currently runs under the existing \`pm2-root\` account according to the deployment plan. If that changes, storage ownership must be redesigned before switching the process user.

### Upload validation (Backend-owned)

- Accept only JPEG, PNG, WebP, AVIF and PDF initially. Reject SVG, HTML, XML, JavaScript, archives, office macros and executables.
- Validate extension AND server-detected MIME AND file signature/magic bytes; never trust the browser Content-Type or filename.
- Suggested limits: raster image 10 MiB; PDF 25 MiB. Enforce at reverse proxy and application layer.
- Decode/re-encode raster images, strip EXIF/GPS metadata, scan PDFs where an antivirus scanner is available, and reject malformed/polyglot files.
- Generate a 128-bit random 32-hex storage key plus validated extension. Original filename is metadata only, normalized and never used as a filesystem path.
- Use safe path joins and verify resolved paths remain under MEDIA_ROOT; reject symlinks and traversal. Create files with restrictive modes.
- Uploads remain in private/staging until approved. Only publication copies/promotes the validated object to public/. Unpublished, rejected and reader-submitted files must never have public URLs.
- For field-case images, remove location metadata and confirm the unit/address is anonymized and image usage rights exist before publication.

### URL/API contract

- Public URL is \`/media/<32-lowercase-hex>.<allowlisted-extension>\`; no absolute filesystem path is returned.
- API may return \`coverImage\`/media URL only when the corresponding asset is in PUBLISHED state and exists in public/.
- Backend should add a media asset record (suggested fields: id, storage_key, detected_mime, size_bytes, sha256, status, owner_id, created_at, published_at, deleted_at). This schema/API is **not implemented** by this Ops change.
- Nginx example only serves the random-name allowlist from public/. Any other \`/media/*\` path returns 404; autoindex is off; nosniff and sandbox CSP are set. Do not expose private/ or staging/.

### Orphan cleanup

Backend must export a fresh manifest from the authoritative media table:

\`\`\`
# conspace-media-manifest-v1 database=conspace generated_at=2026-11-12T02:30:00Z
0123456789abcdef0123456789abcdef.webp
\`\`\`

Then run \`bash ops/scripts/media-orphan-audit.sh\` (dry-run). Review the manifest and candidates. Only after a recent media backup, run \`bash ops/scripts/media-orphan-audit.sh --apply\`. It refuses stale/invalid manifests, non-allowlisted names, symlinks and unexpected directories. Until Backend creates the authoritative media table/export, cleanup intentionally fails closed.

## 5. Logging and audit trail

- PM2 API stdout/stderr is isolated to \`/var/log/conspace/api-out.log\` and \`api-error.log\`; logrotate retains 14 daily files. Install paths/config with setup-storage; PM2 adopts the log paths on its next approved reload.
- Current Morgan combined logs request lines and can include query strings, IP and User-Agent. Do not put phone numbers, email, tokens or other personal data in URLs. Backend should replace this with a redacted structured request logger before CMS launch.
- Future auth/audit events: login success/failure, MFA challenge, session revoke, role changes, draft/approval/publication, upload/reject/delete, export and admin config changes. Include event ID, actor ID, action, target ID, timestamp, outcome and request ID. Do not log passwords, cookies, raw session IDs, CSRF tokens, Authorization headers, file bytes or full request bodies.
- Prefer append-only audit records in a dedicated table with restricted write/read permissions and retention policy; stdout may carry a sanitized event ID only.
- Nginx access/error logs must be separately rotated after verifying the actual vhost/log paths. Do not change shared Nginx log files as part of this PR.

## 6. Live verification still required

From the VPS, inspect (do not paste secrets):

\`\`\`bash
sudo nginx -t
sudo nginx -T 2>/dev/null | grep -n -B 8 -A 35 'server_name .*conspace.vn'
pm2 status
pm2 describe conspace-api
sudo ss -lntp '( sport = :5088 )'
sudo stat -c '%U:%G:%a %n' /var/lib/conspace/media /var/lib/conspace/media/{private,staging,public} /var/log/conspace
curl -sSI https://conspace.vn/
curl -sSI https://conspace.vn/api/health
\`\`\`

Never share raw PM2 environment output, backend/.env, session material or user-uploaded personal data.
