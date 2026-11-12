#!/usr/bin/env bash
# Read-only. Run with the same root PM2 account used by pm2-root.service.
set -euo pipefail
REPO=/var/www/conspace
NGINX=/etc/nginx/sites-available/conspace.conf
DUMP=/root/.pm2/dump.pm2
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if (( EUID != 0 )); then echo 'FAIL: Run as root (existing pm2-root PM2_HOME).' >&2; exit 1; fi
for tool in node npm git pm2 nginx ss curl pg_isready; do command -v "$tool" >/dev/null || { echo "FAIL: Missing $tool" >&2; exit 1; }; done

echo '=== Node / repository ==='
node -v
[[ "$(node -v)" == v22.23.2 ]] || { echo 'FAIL: Expected Node v22.23.2.' >&2; exit 1; }
test -d "$REPO/.git" || { echo "FAIL: Missing $REPO/.git" >&2; exit 1; }
git -C "$REPO" branch --show-current
git -C "$REPO" status --short

echo '=== Nginx / HTTPS (read-only) ==='
test -r "$NGINX" || { echo "FAIL: Missing $NGINX" >&2; exit 1; }
nginx -t
for host in conspace.vn www.conspace.vn; do
  curl --noproxy '*' --fail --silent --show-error --max-time 15 "https://$host/__infra/health" |
    node -e "let t='';process.stdin.on('data',x=>t+=x);process.stdin.on('end',()=>{let j=JSON.parse(t);if(j.ok!==true||j.service!=='conspace-edge')process.exit(1);console.log('edge '+j.service+' OK')})"
done

echo '=== PM2 persistence (sanitized) ==='
systemctl is-active --quiet pm2-root || { echo 'FAIL: pm2-root inactive; do not spawn another daemon.' >&2; exit 1; }
test -r "$DUMP" || { echo 'FAIL: PM2 dump missing/unreadable.' >&2; exit 1; }
pm2 jlist | node "$SCRIPT_DIR/pm2-check.cjs" "$DUMP" --strict-all --require-online

echo '=== Port 5088 ==='
ss -H -lntp '( sport = :5088 )' || true
echo 'Confirm any listener is the loopback conspace-api PID before activation.'

echo '=== PostgreSQL socket ==='
pg_isready -h /var/run/postgresql -p 5432 -d conspace
echo 'PASS: read-only preflight; this does not authorize production deployment.'
