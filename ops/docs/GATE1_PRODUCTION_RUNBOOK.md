# CONSPACE Gate 1 — manual production runbook (NOT EXECUTED)

## Scope and hard stop conditions

Use only after backend, frontend and ops PR review + merge into `bootstrap/gate1-base`, successful CI checks, and explicit production approval. Never deploy `work/backend`, `work/frontend`, `work/ops`, or old `main` directly. VPS is shared with other websites. Do not modify unrelated vhosts, certificates, existing PM2 processes, roles or databases. Never run `pm2 update`, `pm2 restart all`, `pm2 kill`, `git reset --hard`, or reboot.

The Gate 0 production Nginx holding page is the documented baseline, **not live-verified by this PR**. Nginx `/__infra/health` is independent of backend `/api/health` and PostgreSQL `/api/ready`.

## 1. Read-only initial evidence

SSH using the owner's authorized credentials; use the root account only after confirming it owns `pm2-root`. Do not paste credentials, raw `pm2 jlist`, raw dump, or `.env` into a chat.

```bash
whoami
node -v
pm2 status
sudo systemctl is-active pm2-root
sudo systemctl is-enabled pm2-root
sudo nginx -t
sudo ss -lntp '( sport = :5088 )'
sudo pg_isready -h 127.0.0.1 -p 5432 -d conspace
sudo certbot certificates
sudo nginx -T 2>/dev/null | grep -n -B 6 -A 28 'server_name .*conspace.vn'
```

Once approved ops scripts exist in the VPS repo, run as root:

```bash
cd /var/www/conspace
bash ops/scripts/preflight.sh
pm2 jlist | node ops/scripts/pm2-check.cjs /root/.pm2/dump.pm2 --strict-all
```

**Hard stop:** `x-hub-api` absent from either current PM2 or saved dump. PM2 dump previously missed that app. Never run `pm2 save` automatically. First review current/saved inventories with the owner and back up the dump privately. Do not create an empty alternate PM2 daemon. Verify port 5088 is unused or owned by the existing loopback `conspace-api`. `pg_isready` checks server availability only, not app credentials.

## 2. Select an approved, immutable integration release

Check the Git working tree first; if dirty, stop (do not discard local changes).

```bash
cd /var/www/conspace
git status --short
git fetch origin
git switch bootstrap/gate1-base
git pull --ff-only origin bootstrap/gate1-base
APPROVED_SHA="$(git rev-parse HEAD)"
printf 'Candidate SHA: %s\n' "$APPROVED_SHA"
```

The owner must confirm that exact commit and CI results. Both `backend/package-lock.json` and `frontend/package-lock.json` must be reviewed and committed. Store the real `backend/.env` only at `/var/www/conspace/backend/.env`, mode 600, with a separate `conspace_app` account. Never print it or commit it. Ensure Node 22.23.2 matches existing PM2 runtime.

```bash
bash ops/scripts/stage.sh "$APPROVED_SHA"
```

Stage uses a detached worktree under `/var/www/conspace-releases/<SHA>`, `npm ci --ignore-scripts`, backend syntax/tests and Vite build. It does not modify live PM2, database or Nginx. Any future database migration must have its own reviewed backup, backward-compatible migration plan and explicit approval.

## 3. Activate application (only during approved change window)

```bash
bash ops/scripts/preflight.sh
bash ops/scripts/activate.sh --apply "$APPROVED_SHA"
```

Activation verifies loopback port ownership, `pm2-root`, saved `x-hub-api`, staged SHA, current Nginx syntax, and DB readiness. It privately backs up `dump.pm2` and the CONSPACE vhost in `/var/lib/conspace-ops/backups/`. It updates only `conspace-api` using `CONSPACE_API_CWD` and switches a managed `frontend/dist` symlink atomically. A pre-existing real dist directory causes a safe stop. The script **does not edit/reload Nginx**, and does not call `pm2 save`.

## 4. Nginx: manual, CONSPACE-only modification

Confirm actual vhost path and HTTPS server layout; stop if the file belongs to other hosts or differs from expected.

```bash
sudo readlink -f /etc/nginx/sites-enabled/conspace.conf
sudo nginx -t
VHOST=/etc/nginx/sites-available/conspace.conf
VHOST_BACKUP="${VHOST}.pre-gate1.$(date -u +%Y%m%dT%H%M%SZ)"
sudo cp -a "$VHOST" "$VHOST_BACKUP"
sudo nginx -t
printf 'Rollback vhost backup: %s\n' "$VHOST_BACKUP"
```

Only after those checks, use `sudoedit "$VHOST"` and manually merge the **locations**, not a whole server block, from `ops/nginx/conspace-app-locations.conf.example`. Preserve all Certbot HTTPS blocks, existing HTTP-to-HTTPS redirect, `server_name conspace.vn www.conspace.vn`, `/__infra/health`, and ACME behavior. Add `location ^~ /api/` and `location = /api` with `proxy_pass http://127.0.0.1:5088` (no trailing slash: Express must receive `/api/health`). Replace existing `location /` rather than duplicate it; serve `root /var/www/conspace/frontend/dist` and `try_files $uri $uri/ /index.html`.

```bash
sudo nginx -t
sudo systemctl reload nginx
bash /var/www/conspace/ops/scripts/smoke.sh
```

`smoke.sh` verifies both hostnames' TLS and redirects, edge health, API live+ready, Vite HTML and asset. On any failure, inspect and restore the correct CONSPACE vhost backup; `nginx -t` must pass before reload. Never overwrite a different website's vhost.

## 5. Read logs; PM2 persistence requires separate approval

```bash
pm2 status
pm2 describe conspace-api
pm2 logs conspace-api --lines 40 --nostream
sudo journalctl -u nginx -n 30 --no-pager
sudo ss -lntp '( sport = :5088 )'
```

Review output locally, redact sensitive data. Check previously existing websites using their documented health URLs, without modifying them. Only if owner separately approves PM2 persistence, back up `/root/.pm2/dump.pm2`, confirm every live app including `x-hub-api` is healthy, then consider `pm2 save`; re-run `pm2-check.cjs --strict-all`. No reboot in this sprint.

## 6. Rollback

For a previous Gate 1 release, `/var/lib/conspace-ops/previous.sha` identifies the prior staged SHA:

```bash
bash /var/www/conspace/ops/scripts/rollback.sh --apply
bash /var/www/conspace/ops/scripts/smoke.sh
```

For **first** Gate 1 activation, previous state is `holding`. First restore *the exact vhost backup recorded in step 4*:

```bash
VHOST=/etc/nginx/sites-available/conspace.conf
sudo cp -a "$VHOST" "${VHOST}.failed-gate1.$(date -u +%Y%m%dT%H%M%SZ)"
sudo nginx -t
# Set VHOST_BACKUP to the exact verified pre-change file; do not glob/guess.
sudo cp -a "$VHOST_BACKUP" "$VHOST"
sudo nginx -t
sudo systemctl reload nginx
bash /var/www/conspace/ops/scripts/rollback.sh --apply
```

Holding rollback validates the HTTPS root's exact holding HTML before removing **only** `conspace-api`. It does not change TLS, DB, other PM2 apps or the PM2 dump. If validation fails, stop instead of removing the API. Keep the backup until the owner signs off.

## 7. Evidence and release gate

Record approved commit SHA, backup path, timestamp, `preflight`, `stage`, `activate`, Nginx checks before/after, `smoke`, readiness output and non-secret targeted logs. **No production success claim without this live evidence.**
