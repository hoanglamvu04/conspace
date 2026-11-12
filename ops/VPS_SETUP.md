# CONSPACE / VPS-first setup

This runbook prepares the hosting environment. **Do not deploy the existing root TSX prototype or build the new CONSPACE product yet.**

Target domain: **conspace.vn** (+ **www.conspace.vn**).

## 0. Scope and safety

- The VPS is shared by existing websites. Do not uninstall/upgrade existing Node/PostgreSQL, stop other PM2 processes, replace existing Nginx sites or use blanket firewall resets.
- NEVER commit backend/.env, passwords, private SSH keys, credentials, PostgreSQL dumps, or certificate private keys.
- Reuse the existing PostgreSQL 16.15 cluster on localhost:5432. Create a separate database (`conspace`) and login role (`conspace_app`); never share the Hola Maps/X-HUB database or credentials.
- PostGIS 3.4.2 is already available on the host and enabled in `hola_maps` and `x_hub`. Enable it in CONSPACE only if spatial functionality is needed.
- Bandohoalac and X-HUB PM2 processes were reported running Node.js 22.23.2. CONSPACE targets that same runtime; do not upgrade the system Node runtime.
- The holding page and `/__infra/health` test **Nginx + HTTPS only**, not Node or application health.
- Do not reboot the VPS until PM2 startup persistence and all existing sites/services have been reviewed and a maintenance window agreed.

## 1. Inspect the actual VPS — read-only

```
cd /var/www/conspace
DOMAIN=conspace.vn bash ops/vps-audit.sh
sudo nginx -t
node -v
command -v node
npm -v
pm2 -v
pm2 status
sudo ss -lntp
```

Check CPU/RAM/disk, OS release, all listeners and existing Nginx virtual hosts. Verify the interactive shell Node version is 22.23.2 before starting CONSPACE under PM2. If not, inspect how existing PM2 apps select Node before changing anything.

**Stop** if the chosen domain is served elsewhere or a shared-service change could impact another project.

## 2. Existing prerequisites

Nginx, Certbot, PostgreSQL 16.15, PostGIS 3.4.2 and PM2 have been observed on this VPS. Verify before installing; do not install duplicates or upgrade existing services.

For Node, use the existing 22.23.2 runtime. If a dedicated Node installation is needed, use a user-scoped version manager and verify the PM2 process uses that interpreter; do not replace the system binary used by existing services.

## 3. Verify the CONSPACE database/role names before creating anything

```bash
sudo -u postgres psql -X -P pager=off -c "SELECT datname FROM pg_database WHERE datname = 'conspace';"
sudo -u postgres psql -X -P pager=off -c "SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname = 'conspace_app';"
```

Only if both checks return no row, create a dedicated login role and database:

```bash
sudo -u postgres createuser -P conspace_app
sudo -u postgres createdb -O conspace_app conspace
```

The password prompt avoids putting the password in shell history. Do not reuse Hola Maps/X-HUB credentials.

PostGIS is optional for CONSPACE. If location-based features are confirmed as a requirement, enable the already available extension only in the new database:

```bash
sudo -u postgres psql -d conspace -c 'CREATE EXTENSION IF NOT EXISTS postgis;'
```

Verify database access without printing credentials:

```bash
psql -h 127.0.0.1 -U conspace_app -d conspace -c 'SELECT current_database(), current_user;'
```

Do not expose PostgreSQL port 5432 publicly.

## 4. DNS and HTTP smoke

DNS records have been configured and checked for `conspace.vn` and `www.conspace.vn`. If changes are needed, do not remove or edit MX, SPF, DKIM, DMARC or unrelated TXT records. If behind Cloudflare, validate the origin and use Full (strict) TLS.

The Nginx CONSPACE vhost is already installed and serving the holding page. Before any edits:

```bash
sudo nginx -t
sudo nginx -T 2>&1 | grep -n -B 5 -A 25 'server_name conspace.vn'
```

Do not overwrite an existing vhost.

## 5. Certificate and HTTPS

A certificate named `conspace.vn` covering both `conspace.vn` and `www.conspace.vn` is installed. A targeted Certbot dry-run for this certificate succeeded. Verify with:

```bash
sudo certbot certificates
sudo certbot renew --cert-name conspace.vn --dry-run
cd /var/www/conspace
DOMAIN=conspace.vn bash ops/check-public.sh
```

A full-system `certbot renew --dry-run` previously failed for the unrelated `auto.xspace.vn` certificate. Do not alter that site's configuration as part of CONSPACE setup.

## 6. Gate 0 verification

- [x] Nginx vhost installed; local edge health returned HTTP 200.
- [x] DNS for apex and www resolves; HTTPS edge health returned expected JSON for both names.
- [x] Certificate includes both names; targeted Certbot dry-run succeeded.
- [x] PostgreSQL 16.15 and PostGIS 3.4.2 are available; PostGIS is enabled in existing Hola Maps and X-HUB databases.
- [x] Existing PM2 Bandohoalac and X-HUB processes reported online and running Node.js 22.23.2.
- [ ] Verify shell Node/npm/PM2 versions and confirm chosen API port is unused.
- [ ] Verify `conspace` database and `conspace_app` role do not exist; create only if absent, then test access.
- [ ] Verify PM2 startup persistence and perform a planned reboot test in a maintenance window.
- [ ] Confirm existing websites and services remain healthy after the reboot.

**Only after all remaining items pass** start application scaffolding under `frontend/` (React/Vite/JSX) and `backend/` (Node/Express/pg), add an `/api/health` route and its Nginx reverse proxy, build and publish actual product pages.

## What to send for remote review

Send non-secret output of the read-only checks. Never send any `.env` file, TLS private key, SSH key, database password or credential.
