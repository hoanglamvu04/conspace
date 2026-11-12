#!/usr/bin/env bash
# Read-only. Run with the same root PM2 account used by pm2-root.service.
set -euo pipefail

REPO=/var/www/conspace
NGINX=/etc/nginx/sites-available/conspace.conf
DUMP=/root/.pm2/dump.pm2
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if (( EUID != 0 )); then
  echo 'FAIL: Run as root (existing pm2-root PM2_HOME); do not use another PM2 account.' >&2
  exit 1
fi
for command_name in node npm git pm2 nginx ss curl pg_isready; do
  command -v "$command_name" >/dev/null || { echo "FAIL: Missing command $command_name" >&2; exit 1; }
done

printf '\n=== Node and repository ===\n'
node -v
if [[ "$(node -v)" != 'v22.23.2' ]]; then
  echo 'FAIL: Expected Node v22.23.2. Do not upgrade or replace system Node.' >&2
  exit 1
fi
test -d "$REPO/.git" || { echo "FAIL: Missing $REPO/.git" >&2; exit 1; }
git -C "$REPO" branch --show-current
git -C "$REPO" status --short --untracked-files=no

printf '\n=== Nginx / SSL (no edits) ===\n'
test -r "$NGINX" || { echo "FAIL: Missing $NGINX" >&2; exit 1; }
nginx -t
for host in conspace.vn www.conspace.vn; do
  curl --noproxy '*' --fail --silent --show-error --max-time 15 "https://$host/__infra/health" |
    node -e "let t='';process.stdin.on('data',x=>t+=x);process.stdin.on('end',()=>{let j=JSON.parse(t);if(j.ok!==true||j.service!=='conspace-edge')process.exit(1);console.log('edge: '+j.service+' OK')})"
done

printf '\n=== PM2 persistence ===\n'
systemctl is-active --quiet pm2-root || { echo 'FAIL: pm2-root service is not active; do not spawn a new PM2 daemon.' >&2; exit 1; }
test -r "$DUMP" || { echo 'FAIL: /root/.pm2/dump.pm2 missing or unreadable' >&2; exit 1; }
pm2 jlist | node "$SCRIPT_DIR/pm2-check.cjs" "$DUMP"
systemctl is-active pm2-root || true
systemctl is-enabled pm2-root || true

printf '\n=== Port 5088 ===\n'
ss -H -lntp '( sport = :5088 )' || true
printf 'Existing listener must be checked against the conspace-api PM2 PID before activation.\n'

printf '\n=== PostgreSQL socket (not credential verification) ===\n'
pg_isready -h 127.0.0.1 -p 5432 -d conspace
printf '\nPASS: Read-only preflight. This does NOT authorize live deployment.\n'
