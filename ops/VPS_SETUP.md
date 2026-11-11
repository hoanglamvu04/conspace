# CONSPACE / VPS-first setup

This runbook prepares the hosting environment. **Do not deploy the existing root TSX prototype or build the new CONSPACE product yet.**

Target domain suggested by the CONSPACE profile: **conspace.vn** (+ **www.conspace.vn**). Confirm domain control and actual VPS before setting records.

## 0. Scope and safety

- Run on the intended Ubuntu/Debian VPS via your own SSH session. This guide does not grant remote access.
- Shared VPS: do not uninstall/upgrade existing Node/PostgreSQL, stop other PM2 processes, replace existing Nginx sites or use blanket firewall resets.
- NEVER commit backend/.env, passwords, private SSH keys, credentials, PostgreSQL dumps, or certificate private keys.
- Use a distinct database (conspace) and user (conspace_app). Port 5088 is a future suggestion, not a reserved/verified port.
- The status page and /__infra/health are tests of **Nginx + HTTPS only**; they are NOT Node or application health checks.

## 1. Inspect the actual VPS — no changes yet

~~~
git clone --branch infra/vps-domain-first https://github.com/hoanglamvu04/conspace.git /var/www/conspace
cd /var/www/conspace
DOMAIN=conspace.vn bash ops/vps-audit.sh
sudo nginx -t
~~~

If /var/www/conspace already exists, inspect it first. Do not clone over it. Save the audit output, check CPU/RAM/disk, OS release, all listeners and existing Nginx virtual hosts.

**Stop here** if the chosen domain is already served elsewhere or any shared-service change could impact another project.

## 2. Install only missing prerequisites after audit

On a compatible Ubuntu/Debian host:

~~~
sudo apt-get update
sudo apt-get install -y git curl ca-certificates nginx certbot python3-certbot-nginx
~~~

If PostgreSQL/PostGIS is missing, check distribution packages and the PostgreSQL major version already used by other apps. Install the corresponding PostgreSQL and PostGIS packages **without replacing an active production cluster**.

Node (recommended dedicated deployment account, using nvm):

~~~
command -v nvm
nvm install 24
nvm use 24
node -v
npm -v
npm install -g pm2
pm2 --version
~~~

nvm is a shell function; if missing, install it from the official nvm documentation after reviewing its current installation instructions. Do not globally change an existing app's Node runtime. No PM2 app is started in this phase.

## 3. Create a dedicated PostgreSQL/PostGIS database

First verify the PostgreSQL cluster and PostGIS extension package. If database/role do not already exist:

~~~
sudo -u postgres createuser -P conspace_app
sudo -u postgres createdb -O conspace_app conspace
sudo -u postgres psql -d conspace -c 'CREATE EXTENSION IF NOT EXISTS postgis;'
psql -h 127.0.0.1 -U conspace_app -d conspace -c 'SELECT current_database();'
~~~

The createuser -P prompt accepts the password without putting it in command history. Do NOT reuse Hola Maps credentials, or copy any production database. Confirm local PostgreSQL connectivity; do not expose port 5432 publicly.

## 4. DNS and HTTP smoke

In your DNS manager set the apex A record (conspace.vn) to the VPS public IPv4 and either a www CNAME to conspace.vn or corresponding A record. Add AAAA only if the VPS has working IPv6. If behind Cloudflare, validate the origin separately and use Full (strict) TLS after certificates exist.

Before enabling Nginx config, inspect:

~~~
sudo nginx -t
sudo grep -R --include='*' 'server_name' /etc/nginx/sites-enabled 2>/dev/null
~~~

If there is no conflicting vhost, install the read-only sample manually and verify before reloading:

~~~
sudo cp ops/nginx/conspace-http.conf.example /etc/nginx/sites-available/conspace.conf
sudo ln -s /etc/nginx/sites-available/conspace.conf /etc/nginx/sites-enabled/conspace.conf
sudo nginx -t
sudo systemctl reload nginx
curl -I http://conspace.vn
curl -fsS http://conspace.vn/__infra/health
~~~

Do not blindly overwrite an existing /etc/nginx/sites-available/conspace.conf or create a duplicate sites-enabled symlink.

## 5. Certificate and HTTPS

**Only after the domain DNS resolves correctly and inbound port 80 works**:

~~~
sudo certbot --nginx -d conspace.vn -d www.conspace.vn
sudo nginx -t
sudo systemctl reload nginx
DOMAIN=conspace.vn bash ops/check-public.sh
sudo certbot renew --dry-run
~~~

Choose the HTTP -> HTTPS redirect when Certbot asks. Ensure ports 80/443 are available in the VPS firewall/security group without changing the firewall for other services. A public DNS lookup alone does not prove the target VPS is serving the response.

## 6. Gate 0 verification

Record all these checks:

- bash ops/vps-audit.sh runs and existing services are unaffected.
- sudo nginx -t passes after enabling the new vhost.
- PostgreSQL connection as conspace_app succeeds and postgis extension is available.
- HTTPS certificate verifies for both hostnames, with HTTP redirect.
- GET https://conspace.vn/__infra/health returns a JSON object with service conspace-edge.
- After an agreed and safe reboot window, Nginx/HTTPS/site remain accessible.
- No existing application on the shared VPS has an unexpected change.

**Only then** start application scaffolding under frontend/ (React/Vite/JSX) and backend/ (Node/Express/pg), add an /api/health route and its Nginx reverse proxy, build and publish actual product pages.

## What to send for remote review

Send the non-secret output of ops/vps-audit.sh, sudo nginx -t, and ops/check-public.sh (when relevant), plus the public VPS IP and confirmation of DNS ownership if needed. Never send database passwords or SSH keys in chat.
