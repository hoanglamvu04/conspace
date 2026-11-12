# CONSPACE — Gate 1 safe deployment (NOT executed)

Production: VPS 103.149.170.146; domains conspace.vn and www.conspace.vn. Target runtime Node 22.23.2, Nginx with Certbot HTTPS, PM2 conspace-api on loopback 127.0.0.1:5088, PostgreSQL conspace/conspace_app.

**Full operator procedure:** [Production runbook](docs/GATE1_PRODUCTION_RUNBOOK.md). This document is not evidence of live VPS state.

## Gates

1. Read-only audit: `bash ops/scripts/preflight.sh`. Verify Nginx/HTTPS, PostgreSQL socket, Node version, 5088 listener, current PM2 process names and saved dump. **x-hub-api must appear in both live PM2 and /root/.pm2/dump.pm2.**
2. Verify the single `main` branch has passed GitHub CI; deploy only an explicitly approved SHA equal to `origin/main` HEAD. Commit backend and frontend package lockfiles before staging. Prepare private backend/.env (mode 600) with HOST=127.0.0.1, PORT=5088 and separate conspace DB credentials.
3. Stage approved build: `bash ops/scripts/stage.sh <approved-SHA>`. Release worktree lives at `/var/www/conspace-releases/<SHA>`; npm ci --ignore-scripts, backend checks/tests, Vite build. Does not change production routing or PM2.
4. After explicit owner approval, `bash ops/scripts/activate.sh --apply <approved-SHA>`. Back up the CONSPACE vhost and PM2 dump privately. Change **only** conspace-api and managed frontend/dist symlink, confirm localhost API liveness and database readiness. Does not edit Nginx or save PM2 dump.
5. Back up current `/etc/nginx/sites-available/conspace.conf` using `cp -a`; **run `nginx -t` before any edits**. Manually merge `ops/nginx/conspace-app-locations.conf.example` into existing HTTPS server block: preserve SSL, both hostnames, redirect and `/__infra/health`; route `/api/` to loopback 5088 and serve Vite dist at `/`. Validate again with `nginx -t` before `systemctl reload nginx`.
6. Run `bash ops/scripts/smoke.sh`. Verify HTTP redirects, both HTTPS hosts, `/__infra/health`, `/api/health`, `/api/ready` (database up), frontend assets, PM2 process and focused logs.
7. Rollback: `bash ops/scripts/rollback.sh --apply` for previous staged release. For first activation from Gate 0, restore and validate the backed-up holding-page Nginx vhost **before** running rollback to holding.

**Never:** pm2 update/kill/restart all, reboot, git reset --hard, wholesale vhost overwrite, production DB deletion, other-site changes, unapproved release deployment, or PM2 save without a complete reviewed process inventory. No automated CI-to-production deployment.
