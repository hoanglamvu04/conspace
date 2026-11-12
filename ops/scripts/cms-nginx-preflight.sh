#!/usr/bin/env bash
# Read-only fail-closed CMS Nginx readiness check. Never prints nginx -T or secrets.
set -euo pipefail
VHOST=/etc/nginx/sites-available/conspace.conf
[[ -f "$VHOST" ]] || { echo 'STOP: CONSPACE vhost missing' >&2; exit 1; }
nginx -t >/dev/null
need() {
  if ! grep -Eq "$1" "$VHOST"; then echo "BLOCKED: missing CONSPACE vhost directive: $2" >&2; exit 1; fi
}
need '^[[:space:]]*server_name[[:space:]].*conspace\.vn.*www\.conspace\.vn' 'both domain names'
need '^[[:space:]]*location[[:space:]]*=[[:space:]]*/__infra/health' 'edge health'
need '^[[:space:]]*location[[:space:]]*=[[:space:]]*/api/admin/auth/login' 'login limiter location'
need '^[[:space:]]*location[[:space:]]*=[[:space:]]*/api/admin/media' 'exact upload rate-limited endpoint'
need '^[[:space:]]*location[[:space:]]*\^~[[:space:]]*/api/admin/' 'admin API scoped proxy'
need '^[[:space:]]*location[[:space:]]*\^~[[:space:]]*/admin/' 'admin frontend SPA'
need '^[[:space:]]*location[[:space:]]*/media/' 'non-published media deny'
need '^[[:space:]]*limit_req[[:space:]]+zone=conspace_admin_login' 'login limiter'
need '^[[:space:]]*limit_req[[:space:]]+zone=conspace_admin_api' 'admin API limiter'
need '^[[:space:]]*limit_req[[:space:]]+zone=conspace_media_upload' 'media upload limiter'
need '^[[:space:]]*proxy_pass[[:space:]]+http://127\.0\.0\.1:5088;' 'loopback Express proxy'
if grep -Eq '^[[:space:]]*(alias|root)[[:space:]]+[^;]*(/media/(private|staging)|/media;)' "$VHOST"; then
  echo 'BLOCKED: Nginx exposes private/staging or all media root' >&2; exit 1;
fi
# Read effective http {} config in memory; only report zone names, never raw config.
nginx -T 2>/dev/null | awk '
  /^[[:space:]]*limit_req_zone[[:space:]]/ {
    if($0 ~ /zone=conspace_admin_login:/) a=1;
    if($0 ~ /zone=conspace_admin_api:/) b=1;
    if($0 ~ /zone=conspace_media_upload:/) c=1;
  }
  END {if(!(a&&b&&c)) exit 1}
' || { echo 'BLOCKED: Required global Nginx rate limit zones absent' >&2; exit 1; }
echo 'PASS: CMS Nginx vhost structural checks + nginx -t. Live header/authorization checks are still required.'
