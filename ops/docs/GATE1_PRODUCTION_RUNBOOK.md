# CONSPACE Gate 1 — main deployment and operations runbook

## Scope / hard stops

Deploy only the exact `main` commit whose GitHub Actions checks are all completed/success and whose SHA is explicitly approved by the owner. Do not deploy feature/worker branches or a commit that has not passed CI. VPS is shared. No changes to other vhosts, certificates, PM2 applications, databases or PostgreSQL cluster settings.

Never run `pm2 update`, `pm2 kill`, `pm2 restart all`, `git reset --hard`, or reboot. Deployment does not call `pm2 save`.

## 1. Read-only evidence first

SSH using the owner's existing credentials. Run as the account that owns `pm2-root` (documented as root); do not create a second PM2 daemon.

```bash
whoami
node -v
systemctl is-active nginx postgresql pm2-root
systemctl is-enabled pm2-root
nginx -t
ss -lntp '( sport = :5088 )'
pg_isready -h /var/run/postgresql -p 5432 -d conspace
certbot certificates
nginx -T 2>/dev/null | grep -n -B 8 -A 35 'server_name .*conspace.vn'
cd /var/www/conspace
bash ops/scripts/preflight.sh
pm2 jlist | node ops/scripts/pm2-check.cjs /root/.pm2/dump.pm2 --strict-all --require-online
```

Do not paste raw PM2 JSON/dump, Nginx full config, .env, cookies, keys or database credentials. The PM2 checker prints only process names/status. Stop unless `x-hub-api` is both live and saved and all live apps are online and present in dump. Do not refresh dump automatically.

## 2. Prepare media/log/backup storage once

Inspect Nginx worker group and any existing storage paths first. Then:

```bash
cd /var/www/conspace
sudo bash ops/scripts/setup-storage.sh --apply
```

Expected layout: `/var/lib/conspace/media/{staging,private,public}`, `/var/backups/conspace`, `/var/log/conspace`. The script fails closed if an existing path has unexpected ownership/mode. It does not edit backend/.env. Backend must implement MEDIA_ROOT before using uploads; then add `MEDIA_ROOT=/var/lib/conspace/media` to private backend/.env (600).

Install daily backup timer:

```bash
sudo install -o root -g root -m 0644 ops/systemd/conspace-backup.service /etc/systemd/system/
sudo install -o root -g root -m 0644 ops/systemd/conspace-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now conspace-backup.timer
systemctl list-timers conspace-backup.timer
```

## 3. Verify CI and select immutable SHA

Ensure the checkout is clean. Deployment script will fetch and fast-forward main; it refuses local modifications.

```bash
cd /var/www/conspace
git status --short
git fetch --no-tags origin main
git pull --ff-only origin main
git rev-parse HEAD
```

Open GitHub Actions for that exact commit and confirm all check-runs succeeded. Set the approval variable only after verifying:

```bash
export CONSPACE_CI_APPROVED_SHA=<40-character-main-SHA>
```

The script independently queries GitHub's public check-runs API and fails on missing, pending, failed or cancelled checks.

## 4. Deploy (explicit apply)

Confirm private `backend/.env` exists, is not tracked, has mode 600, and uses the dedicated `conspace_app` credential/database. Never print it. Node must be exactly 22.23.2.

```bash
cd /var/www/conspace
sudo --preserve-env=CONSPACE_CI_APPROVED_SHA bash ops/scripts/go-live.sh --apply <same-main-SHA>
```

The script performs, in order:

1. Verify clean `main`, fetch/pull --ff-only, local SHA = origin/main = approved SHA.
2. Verify all GitHub check-runs success.
3. Check all live PM2 processes are online and saved, including `x-hub-api`.
4. Prepare storage/log directories.
5. Stage a detached immutable worktree; `npm ci`, backend syntax/tests, frontend tests/build.
6. Back up only `conspace` database and media; verify archive structure/checksums.
7. Run the current transactional migration runner and seed against `conspace` only.
8. Reload only `conspace-api` with the immutable release cwd; wait for local health and DB readiness; atomically switch frontend dist symlink.
9. Apply Nginx change only to the existing CONSPACE HTTPS server block after backup and `nginx -t`; preserve Certbot, both hostnames, redirect and `/__infra/health`.
10. Public smoke and operational monitor.

If the database migration fails, stop; the current migration runner uses a transaction and rolls back. Do not continue to PM2/Nginx. If activation or public smoke fails, the script attempts only CONSPACE rollback and reports any manual recovery needed.

## 5. Nginx / media behavior

The Nginx switch script preserves the existing server block and adds:
- `/api` and `/api/` proxy to `127.0.0.1:5088` without a URI rewrite.
- Vite SPA root at `/var/www/conspace/frontend/dist`.
- `/media/<32-hex>.<jpg|jpeg|png|webp|avif|pdf>` alias to the public media directory; all other media paths return 404.

Private/staging media are never aliased. Backend must enforce MIME/signature, extension, size, random filename and publication controls before files enter public/. See `CMS_SECURITY_MEDIA_CONTRACT.md`.

## 6. Logging and monitoring

PM2 log paths are `/var/log/conspace/api-out.log` and `api-error.log`; logrotate retains 14 daily files. Current Morgan combined logging may include query strings; do not put PII/secrets in URLs. Auth failure and audit-event logging are Backend work and are not present until CMS implementation.

```bash
pm2 status
pm2 describe conspace-api
pm2 logs conspace-api --lines 40 --nostream
sudo journalctl -u nginx -n 40 --no-pager
sudo bash /var/www/conspace/ops/scripts/monitor.sh
```

## 7. Rollback and migration recovery

```bash
sudo bash /var/www/conspace/ops/scripts/rollback.sh --apply
sudo bash /var/www/conspace/ops/scripts/smoke.sh
```

For a failed Nginx change, use the exact backup path recorded at `/var/lib/conspace-ops/last-vhost-backup.txt`, restore only `/etc/nginx/sites-available/conspace.conf`, run `nginx -t`, then reload. Never guess a backup path or replace an entire vhost.

Database/media restore drill (non-production targets only):

```bash
BACKUP_DIR="$(find /var/backups/conspace -mindepth 2 -maxdepth 2 -name SHA256SUMS -printf '%T@ %h\n' | sort -nr | head -n 1 | cut -d ' ' -f 2-)"
sudo bash /var/www/conspace/ops/scripts/restore-drill.sh "$BACKUP_DIR"
```

Migration history is checksum-locked. Never edit an applied migration. A failed transactional migration should be fixed forward and retried after tests and a fresh backup. Production restore requires a separately approved maintenance plan; no automated script drops/replaces the production database.

## 8. PM2 persistence

The deployment never runs `pm2 save`. After successful verification, the owner may separately back up `/root/.pm2/dump.pm2`, confirm every existing process (including `x-hub-api`) is healthy and saved, and approve a manual `pm2 save`. No reboot in this runbook.
