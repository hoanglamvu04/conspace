#!/usr/bin/env bash
# Recover CONSPACE's previously activated Gate 1 release without rebuilding or migrating.
# Intended for the first Nginx 500 caused by inaccessible frontend/dist.
set -euo pipefail
umask 077

REPO=/var/www/conspace
STATE=/var/lib/conspace-ops
VHOST=/etc/nginx/sites-available/conspace.conf
die(){ echo "STOP: $*" >&2; exit 1; }
(( EUID == 0 )) || die "Run as root"
cd "$REPO"
[[ -f "$STATE/active.sha" ]] || die "No recorded active release"
SHA="$(cat "$STATE/active.sha")"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || die "Unexpected active release SHA"
[[ -L frontend/dist ]] || die "Expected a deployed dist symlink"
[[ "$(readlink -f frontend/dist)" == "/var/www/conspace-releases/$SHA/frontend/dist" ]] ||
  die "Active release does not match frontend/dist"
[[ -f "$VHOST" ]] || die "CONSPACE vhost missing"

echo "=== 1. Check already active API / Postgres ==="
curl --noproxy '*' --fail --silent --show-error --max-time 8 http://127.0.0.1:5088/api/health |
  node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{let j=JSON.parse(s);if(j.ok!==true||j.service!=="conspace-api")process.exit(1)})'
curl --noproxy '*' --fail --silent --show-error --max-time 8 http://127.0.0.1:5088/api/ready |
  node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{let j=JSON.parse(s);if(j.ok!==true||j.checks?.database!=="up")process.exit(1)})'

echo "=== 2. Fix only public React build permissions ==="
bash ops/scripts/fix-static-access.sh

echo "=== 3. Check CONSPACE Nginx vhost (holding or already switched) ==="
nginx -t
IS_HOLDING=false
if grep -Eq '^[[:space:]]*root[[:space:]]+/var/www/conspace/ops/holding;' "$VHOST"; then
  IS_HOLDING=true
fi

echo "=== 4. Activate React routing only on CONSPACE ==="
python3 ops/scripts/switch-nginx-gate1.py

echo "=== 5. Smoke test public HTTPS ==="
if ! bash ops/scripts/smoke.sh; then
  echo "FAIL: Public smoke did not pass" >&2
  if [[ "$IS_HOLDING" == true ]]; then
    BACKUP="$(cat "$STATE/last-vhost-backup.txt" 2>/dev/null || true)"
    if [[ "$BACKUP" == "$VHOST.before-gate1-"* && -f "$BACKUP" ]]; then
      echo "Restoring previous CONSPACE holding vhost from $BACKUP" >&2
      cp -a "$BACKUP" "$VHOST"
      nginx -t && systemctl reload nginx
    else
      echo "URGENT: Could not identify safe CONSPACE Nginx backup; inspect manually." >&2
    fi
  fi
  die "Inspect error; no app/DB/PM2 changes were made by this recovery script."
fi

echo "PASS: CONSPACE React frontend + API are live over HTTPS (release $SHA)."
echo "NOTE: PM2 persistence is not changed. Save the PM2 dump separately after confirming app health."
