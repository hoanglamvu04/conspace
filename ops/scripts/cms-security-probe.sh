#!/usr/bin/env bash
# Read-only unauthenticated CMS exposure probe. No credentials/cookies are sent.
set -euo pipefail
BASE_URL="${BASE_URL:-https://conspace.vn}"
BASE_URL="${BASE_URL%/}"
CMS_PRESENT=0
INCOMPLETE=0
FAILURES=0
paths=(
  /api/admin/users
  /api/admin/roles
  /api/admin/articles
  /api/admin/media
  /api/admin/audit
)
echo "Probe target: $BASE_URL"
for path in "${paths[@]}"; do
  status="$(curl --noproxy '*' --silent --show-error --max-time 12 -o /dev/null -w '%{http_code}' "$BASE_URL$path")"
  case "$status" in
    401|403) echo "PASS protected: $path -> HTTP $status"; CMS_PRESENT=1 ;;
    404) echo "NOT IMPLEMENTED: $path -> HTTP 404"; INCOMPLETE=1 ;;
    200) echo "FAIL exposed without authentication: $path -> HTTP 200"; FAILURES=$((FAILURES+1)); CMS_PRESENT=1 ;;
    *) echo "INCONCLUSIVE: $path -> HTTP $status"; FAILURES=$((FAILURES+1)); CMS_PRESENT=1 ;;
  esac
done

echo '=== Public response security headers ==='
for url in "$BASE_URL/" "$BASE_URL/api/health"; do
  headers="$(curl --noproxy '*' --silent --show-error --max-time 12 -D - -o /dev/null "$url" | tr -d '\r')"
  for header in X-Content-Type-Options Referrer-Policy Content-Security-Policy; do
    if printf '%s\n' "$headers" | grep -qi "^$header:"; then
      echo "PASS header $header: $url"
    else
      echo "WARN missing $header: $url"
    fi
  done
done

if (( FAILURES > 0 )); then
  echo "FAIL: $FAILURES unauthenticated probe(s) were inconclusive or exposed."
  exit 1
fi
if (( INCOMPLETE > 0 || CMS_PRESENT == 0 )); then
  echo 'BLOCKED: CMS endpoints are absent or incomplete. This is not a CMS security pass.'
  exit 3
fi
echo 'PASS: sampled admin endpoints deny unauthenticated access. Role/CSRF tests still require Backend integration tests.'
