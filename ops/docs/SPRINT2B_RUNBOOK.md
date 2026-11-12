# Sprint 2B / CONSPACE CMS Ops runbook

Status: **code prepared in Git only**. No SSH was available during authoring. The real VPS/Nginx/PM2/media/backup state remains unverified. Do **not** treat a CI syntax PASS as a production acceptance PASS.

## 1. CI dependency blocker and Frontend handoff

GitHub Actions run [43167636931](https://github.com/hoanglamvu04/conspace/actions/runs/43167636931) failed **Frontend full dependency audit**. Current frontend pins `vite@5.4.19` with transitive `esbuild@0.21.5`. npm audit reported **1 moderate and 1 high** (esbuild dev-server issue: GHSA-67mh-4wv8-2f99; vulnerable Vite dependency chain). Full audit must remain. npm audit suggested Vite 5.4.21; have Frontend owner validate the patched candidate and update BOTH frontend/package.json and frontend/package-lock.json. Ops does not edit frontend.

Backend also has lower-severity Morgan advisories; Backend owns any package changes. A successful `npm ci`/test/build does NOT override failed dependency audit.

## 2. HTTP routing and HTTPS

The existing public `/api/` proxy and SPA fallback already carry `/api/admin/...` and `/admin/...` **as URLs**, but are not proof of authentication or throttling. To activate CMS-specific controls, inspect the *effective* Nginx configuration and Backend's final route contract. Do not deploy a CMS on 404 placeholder endpoints.

- Use `ops/nginx/conspace-rate-limit-http.conf.example` for three uniquely named **http-level** zones: login, admin API, media upload. Do not set a global `limit_req_status` on this shared VPS.
- Manually merge `ops/nginx/conspace-cms-https-locations.conf.example` into the *existing CONSPACE HTTPS* server block only. Includes `/admin/` SPA (not an auth boundary), exact login rate limit, scoped `/api/admin/` and `/api/admin/media/` proxies, same-origin HTTPS headers and strict upload body limit. Confirm Backend route names first.
- Never alias `/var/lib/conspace/media/private` or `/var/lib/conspace/media/staging`. Keep the approved random-ID public-only media alias and deny fallback `/media/`.
- Backend must set `__Host-conspace_admin` cookie: `Secure; HttpOnly; SameSite=Strict` or reviewed Lax; `Path=/`; no Domain. It must rotate/revoke sessions, check CSRF on state-changing requests, enforce role permissions **server-side**, and trust proxy only for the reviewed loopback Nginx hop. Nginx headers/rate limits are defense in depth, not auth/CSRF implementation.
- Do not set CSP without checking frontend assets and Nginx header inheritance. Preserve the current certificates, redirects, `/__infra/health`, `/api/health`, `/api/ready` and other vhosts.

On VPS, owner reviews configuration and takes a backup *before the first edit*:

```bash
sudo -i
cd /var/www/conspace
nginx -t
VHOST=/etc/nginx/sites-available/conspace.conf
cp -a "$VHOST" "$VHOST.before-cms-$(date -u +%Y%m%dT%H%M%SZ)"
# Install/review only CONSPACE rate-limit zones in an appropriate http{} include.
# Merge CMS locations into EXISTING $VHOST using sudoedit, not wholesale replacement.
nginx -t
# Only after validation and explicit production approval:
systemctl reload nginx
bash ops/scripts/cms-nginx-preflight.sh
```

Do not paste full `nginx -T` output to chat: it may contain other tenants' configuration.

## 3. Durable media, backups, permissions, logrotate and monitoring

Existing Ops scripts implement `MEDIA_ROOT=/var/lib/conspace/media` outside Git, with private/staging root:root 0700, published directory root:www-data 2750, database/media combined backup and isolated restore drill. The expected PM2 runtime is root, so changing it to an unprivileged service account requires revisiting ownership/ACLs before uploads. Do **not** chmod the whole source tree.

After inspecting actual runtime user/group and filesystem, owner can run:

```bash
cd /var/www/conspace
bash ops/scripts/setup-storage.sh --apply
bash ops/scripts/storage-audit.sh
bash ops/scripts/backup-all.sh
BACKUP_DIR="$(find /var/backups/conspace -mindepth 2 -maxdepth 2 -type f -name SHA256SUMS -printf '%T@ %h\n' | sort -nr | head -n 1 | cut -d ' ' -f 2-)"
bash ops/scripts/restore-drill.sh "$BACKUP_DIR"
bash ops/scripts/monitor.sh
logrotate -d /etc/logrotate.d/conspace-api
```

`backup-all.sh` dumps **only** database `conspace`, archives `private/public/staging` media and stores checksums root-only. Retention is 14 days with at least 7 complete backups preserved. Current copy is *local only*, not an offsite disaster-recovery backup; approve separate encrypted offsite replication and test recovery. The daily `conspace-backup.timer` is a *template* until installed and enabled. Restore drill uses a fresh temporary DB + media folder; production `conspace`, `hola_maps` and `x_hub` are never restore targets.

`monitor.sh` additionally checks RAM pressure (warning 85%, critical 95%), disk, process health, backup freshness/integrity and API readiness. `storage-audit.sh` verifies filesystem isolation, Nginx worker read access only to public media, no executable/symlinked media, logrotate and PM2 runtime. Monitoring does not send alerts by itself.

## 4. Isolated staging authz / CSRF / cookie acceptance (MUST run before CMS approval)

Backend must supply exact route paths, role accounts, and disposable test records. Copy only the **example shape** into a root-protected path OUTSIDE Git; replace all placeholders with staging-only data. Do not store real cookie/token/password in repository, CI secrets or shell history.

```bash
install -d -m 0700 /var/lib/conspace-ops/acceptance
install -m 0600 ops/docs/cms-staging-acceptance.example.json \
  /var/lib/conspace-ops/acceptance/cms-private.json
# Edit privately to use an ISOLATED HTTPS staging hostname and disposable records.
nano /var/lib/conspace-ops/acceptance/cms-private.json
node ops/scripts/cms-authz-acceptance.mjs \
  /var/lib/conspace-ops/acceptance/cms-private.json --validate-only
# ONLY AFTER confirming the hostname, data isolation and test users:
node ops/scripts/cms-authz-acceptance.mjs \
  /var/lib/conspace-ops/acceptance/cms-private.json --confirm-isolated
```

Script requires all: unauthenticated admin denied, Editor forbidden, Technical Reviewer cannot escalate role, unauthorized sensitive approval denied, publish without required approvals denied, CSRF-invalid write denied, valid Admin permitted on **staging disposable data**, and login cookie flags. It refuses production hosts and example placeholders. It prints only case IDs/statuses. Backend must also provide integration tests for session revocation and rate-limiting. Do not repeatedly brute-force login as a monitoring check.

## 5. Production acceptance: read-only by default

```bash
# Public-only smoke does not imply CMS is secure.
bash ops/scripts/production-acceptance.sh --public-only
# CMS acceptance requires actual admin API, no-auth denial and other-site baseline.
# Prepare mode-0600 /var/lib/conspace-ops/other-sites.acceptance
# with one HTTPS URL and expected status (e.g., https://other-site.example/health 200) per unrelated website.
bash ops/scripts/production-acceptance.sh --cms
# Only when owner approves isolated scratch DB/media restore work:
bash ops/scripts/production-acceptance.sh --cms --with-restore
```

`--cms` verifies 200 public homepage, both HTTPS hosts and health/ready, HTTP->HTTPS, anonymous 401/403 (404 = **blocker**), private/staging URL denial, the owner's other-site baseline, and backup integrity. It is a *partial* production audit; only staging tests can exercise privileged writes. Do not record a final CMS PASS until both production and staging acceptance are complete.

## 6. Manual deploy from main — no auto deploy on commit

Production `ops/scripts/go-live.sh` requires exact SHA on main, GitHub check-runs from GitHub Actions (both `ops-static` and `backend-and-frontend` passing), `CONSPACE_CI_APPROVED_SHA`, and **root-owned mode-0600** per-SHA approval files. CMS releases additionally require explicit `cms-approved` evidence after isolated staging acceptance. The owner must also preinstall approved CMS Nginx locations and pass `cms-nginx-preflight.sh`. Source-based CMS-route detection blocks an obvious misclassified public release, but cannot replace human review.

```bash
# After full CI green and separate explicit owner signoff:
sudo -i
cd /var/www/conspace
git fetch --no-tags origin main
SHA="$(git rev-parse origin/main)"
install -d -m 0700 /var/lib/conspace-ops/approvals
install -m 0600 /dev/null "/var/lib/conspace-ops/approvals/$SHA.approved"
printf 'cms\n' > "/var/lib/conspace-ops/approvals/$SHA.release-kind"
chmod 600 "/var/lib/conspace-ops/approvals/$SHA.release-kind"
# ONLY after real staging CMS acceptance:
install -m 0600 /dev/null "/var/lib/conspace-ops/approvals/$SHA.cms-approved"
CONSPACE_CI_APPROVED_SHA="$SHA" bash ops/scripts/go-live.sh --apply "$SHA"
```

For an approved *public-only* release, use `public` instead of `cms` and DO NOT create CMS approval. Do not run these commands while CI fails. Deploy uses `git pull --ff-only`, `npm ci`, tests, Vite build, pre-migration conspace+media backup, **scratch restore validation**, checked migration (no automatic seed), targeted PM2 reload of only `conspace-api`, CONSPACE Nginx test/backup/reload, HTTPS smoke and targeted rollback. DB migrations are not automatically reversed. Do not run global PM2 commands, reboot or delete rollback releases.

### Operational blockers

- Run 43167636931 failed full Frontend audit; Frontend must fix Vite/esbuild and generate passing CI.
- Actual CMS login/RBAC/CSRF/upload functionality is owned by Backend and not yet proven in main.
- No SSH evidence was available to validate live Nginx, cookie, media permissions, backups, restore or other sites.
- All production changes require owner approval. Never claim deployment or final acceptance from source review alone.
