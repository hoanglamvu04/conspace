# CONSPACE — Gate 1 production deployment (main only)

Production target: VPS 103.149.170.146; `conspace.vn` and `www.conspace.vn`; Node 22.23.2; Nginx + Certbot; PM2 app `conspace-api` bound to `127.0.0.1:5088`; PostgreSQL database `conspace`, role `conspace_app`.

This is a runbook, not evidence that a production deployment has occurred. Full steps: [Gate 1 production runbook](docs/GATE1_PRODUCTION_RUNBOOK.md).

## Release gates

1. Work only on `main`. Read-only preflight: `bash ops/scripts/preflight.sh`. Verify Node, Nginx/TLS, PostgreSQL, port 5088, current PM2 process list and saved dump. `x-hub-api` must exist in BOTH live PM2 and `/root/.pm2/dump.pm2`; all live processes must be online and represented in the dump. Stop on any mismatch. Never run a global PM2 command to fix it.
2. GitHub Actions on the exact main SHA must have every check-run completed with conclusion success. Deployment script verifies the public GitHub check-runs API and requires `CONSPACE_CI_APPROVED_SHA` to equal the requested SHA. No CI-to-production auto-deploy exists.
3. Prepare private `backend/.env` (mode 600, not tracked) with production DB URL and loopback host/port. After Backend implements media config, add `MEDIA_ROOT=/var/lib/conspace/media`.
4. Run `bash ops/scripts/go-live.sh --apply <approved-main-SHA>`. It fetches/pulls main fast-forward only, stages immutable release, runs backend/frontend tests/build, creates database+media backup BEFORE migrations, runs transactional migrations/seed, reloads only `conspace-api`, switches Vite symlink and backs up/tests/reloads only the existing CONSPACE vhost.
5. Public smoke verifies HTTP redirect, TLS for both hostnames, `/__infra/health`, `/api/health`, `/api/ready` (database up), frontend HTML and assets. Monitor verifies PM2, DB readiness, disk and latest backup checksums.

## Storage and backup

- Media root: `/var/lib/conspace/media`, outside source code; private/staging 0700, public 0750 root:www-data. Nginx serves only random allowlisted files in public/.
- Backups: `/var/backups/conspace`, root-only 0700; custom-format dump of database `conspace` plus media archive; checksums; 14-day retention.
- Setup and timer instructions: `ops/docs/BACKUP_AND_RECOVERY.md`.
- CMS is not yet implemented in the inspected main tree. Do not expose admin or upload routes until Backend implements the controls in `ops/docs/CMS_SECURITY_MEDIA_CONTRACT.md`.

## Rollback

- App rollback: `bash ops/scripts/rollback.sh --apply` restores the previous immutable release and reloads only `conspace-api`.
- If the Nginx switch or public smoke fails, restore only the exact backup recorded at `/var/lib/conspace-ops/last-vhost-backup.txt`, run `nginx -t`, then `systemctl reload nginx`; rollback the app afterwards.
- First activation from holding: restore the exact Gate 0 vhost backup before using rollback-to-holding.
- Never run `pm2 update`, `pm2 kill`, `pm2 restart all`, `git reset --hard`, reboot, blanket chmod/chown, cluster-wide DB restore, or modify other sites.

**PM2 dump:** deployment does not call `pm2 save`. Save persistence is a separate owner decision after every existing app has been reviewed and `x-hub-api` is confirmed present. 
