#!/usr/bin/env bash
# Read-only CONSPACE outage diagnostics. Does NOT restart PM2/Nginx or reveal .env.
set -u
cd /var/www/conspace || exit 1
echo "=== CONSPACE CURRENT CHECKOUT ==="
git branch --show-current
git log -1 --oneline

echo "=== DEPLOY STATE (READ ONLY) ==="
for state in active.sha previous.sha last-vhost-backup.txt; do
  file="/var/lib/conspace-ops/$state"
  if test -f "$file"; then
    echo "$state: $(cat "$file")"
  else
    echo "$state: missing"
  fi
done

echo "=== HTTPS ENDPOINT STATUS (DIRECT VPS ORIGIN) ==="
for host in conspace.vn www.conspace.vn; do
  for path in /__infra/health /api/health /api/ready /; do
    printf '%-22s %-22s ' "$host" "$path"
    curl --noproxy '*' --resolve "$host:443:127.0.0.1" \
      -sS --max-time 10 -o /dev/null -w 'HTTP %{http_code}; remote %{remote_ip}\n' \
      "https://$host$path" || true
  done
done
echo "=== BACKEND LOOPBACK STATUS ==="
for path in /api/health /api/ready /api/v1/niches; do
  printf '%-22s ' "$path"
  curl --noproxy '*' -sS --max-time 8 -o /dev/null \
    -w 'HTTP %{http_code}\n' "http://127.0.0.1:5088$path" || true
done

echo "=== FRONTEND BUILD LINKS / PERMISSIONS ==="
ls -ld /var/www/conspace/frontend /var/www/conspace/frontend/dist \
  /var/www/conspace-releases /var/www/conspace/ops/holding 2>&1 || true
readlink -f /var/www/conspace/frontend/dist 2>/dev/null || true
if test -f /var/www/conspace/frontend/dist/index.html; then
  ls -l /var/www/conspace/frontend/dist/index.html
else
  echo "MISSING: frontend/dist/index.html"
fi

echo "=== NGINX STATUS ==="
nginx -t 2>&1 | tail -n 5
echo "=== CONSPACE VHOST DECLARATIONS (NO SECRETS) ==="
grep -nE 'server_name\s+.*conspace\.vn|^[[:space:]]*root |^[[:space:]]*location |^[[:space:]]*proxy_pass ' \
  /etc/nginx/sites-available/conspace.conf 2>/dev/null || true

echo "=== NGINX RECENT RELATED ERRORS (MAX 35) ==="
if test -r /var/log/nginx/error.log; then
  tail -n 800 /var/log/nginx/error.log |
    grep -Ei 'conspace|5088|/index\.html|permission denied|redirection cycle' |
    tail -n 35 || true
else
  echo "Nginx error log not found/readable"
fi
echo "=== PM2 PROCESS NAMES / STATUS ==="
pm2 list || true
echo "=== NEXT ==="
echo "If a path reports 500, the matched Nginx error line determines the real cause."
echo "No changes made to DB, PM2, Nginx, or Git."
