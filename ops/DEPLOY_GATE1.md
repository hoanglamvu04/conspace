# CONSPACE — Safe Gate 1 deployment guide (not executed)

VPS: 103.149.170.146. Hostnames: conspace.vn, www.conspace.vn. Nginx + Certbot currently serve the Gate 0 holding page. PostgreSQL 16.15/PostGIS 3.4.2 and PM2 root daemon already exist.

DO NOT deploy a worker branch to the public website. Deploy only after backend + frontend + ops PRs have been reviewed and merged into the approved integration branch.

## 1. Non-destructive preflight

```bash
cd /var/www/conspace
git status --short
git branch --show-current
node -v
npm -v
pm2 status
sudo nginx -t
sudo ss -lntp '( sport = :5088 )'
sudo systemctl is-enabled pm2-root
sudo systemctl is-active pm2-root
```

Required: Node 22.23.2, no application using port 5088, nginx test passes, previous PM2 apps online. Do not reboot now.

**Important:** Earlier PM2 dump missed `x-hub-api`. Before changing saved state, back up `/root/.pm2/dump.pm2` and compare saved/current processes. Use `pm2 save` only after all required existing apps are present and healthy.

## 2. Checkout approved code (only after PR review)

```bash
cd /var/www/conspace
git fetch origin
git switch bootstrap/gate1-base
git pull --ff-only origin bootstrap/gate1-base
```

Do not run `git reset --hard`; preserve locally created secrets and any pending changes. Existing `ops/holding` remains in the repo for rollback.

## 3. Install and test

```bash
cd /var/www/conspace
node -v
npm install --prefix backend --no-audit --no-fund
npm install --prefix frontend --no-audit --no-fund
npm run check --prefix backend
npm run test:backend
npm run build
```

The worker branches should commit both backend/frontend package-lock.json; once present, prefer `npm ci --prefix backend` and `npm ci --prefix frontend` on VPS for reproducibility. Do not run production `npm install` before reviewing new dependency scripts.

## 4. Backend secret configuration (root/deploy user only)

```bash
cd /var/www/conspace
umask 077
test -e backend/.env || cp backend/.env.example backend/.env
chmod 600 backend/.env
```

Edit `backend/.env` privately with actual `DATABASE_URL`, `NODE_ENV=production`, `HOST=127.0.0.1` and `PORT=5088`. Never copy real .env into Git or chat, and URL-encode reserved characters in the DB password.

## 5. API startup in PM2

```bash
cd /var/www/conspace
pm2 start ops/ecosystem.config.cjs --only conspace-api --env production
curl --noproxy '*' -fsS http://127.0.0.1:5088/api/health
curl --noproxy '*' -fsS http://127.0.0.1:5088/api/ready
pm2 status
```

If readiness is HTTP 503, investigate the database credentials privately. Do not edit a different app's database or password. Do not continue to Nginx change until tests pass.

## 6. Switch web vhost from holding page to frontend dist

- Back up the existing `/etc/nginx/sites-available/conspace.conf` with a timestamp using `cp -a`.
- Preserve Certbot-managed HTTPS/redirect blocks, TLS and `/__infra/health`.
- In the HTTPS server block, add a dedicated `/api/` reverse proxy to `127.0.0.1:5088`, and change **the existing** `location /` to serve `/var/www/conspace/frontend/dist`. Do not duplicate `location /`.
- See `ops/nginx/conspace-app-locations.conf.example` for the exact snippet.
- Validate with `sudo nginx -t`, then use **reload**, not restart.

Smoke test:

```bash
curl --noproxy '*' -fsS https://conspace.vn/api/health
curl --noproxy '*' -fsS https://conspace.vn/__infra/health
curl --noproxy '*' -I https://conspace.vn/
curl --noproxy '*' -fsS https://www.conspace.vn/api/health
```

The Gate 0 edge health and both TLS hostnames must remain valid.

## 7. Persist carefully and rollback

Once all apps are healthy, confirm PM2 saved/current list matches including `x-hub-api`, then (if approved) back up `dump.pm2` and run `pm2 save`.

Rollback website by restoring the saved `conspace.conf`, testing with `nginx -t` and reloading. Leave other Nginx sites and PM2 apps untouched. Return CONSPACE to the holding page while investigating API/build issues.

Never run `pm2 update`, `pm2 kill`, `pm2 restart all`, blanket `chown -R` or system-wide Node/Postgres upgrades for CONSPACE.
