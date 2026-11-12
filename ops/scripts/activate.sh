#!/usr/bin/env bash
# Activate only one approved CONSPACE release. No global PM2 actions or Nginx edits.
set -euo pipefail
umask 077
REPO=/var/www/conspace
RELEASES=/var/www/conspace-releases
STATE=/var/lib/conspace-ops
NGINX=/etc/nginx/sites-available/conspace.conf
DUMP=/root/.pm2/dump.pm2
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
die(){ echo "STOP: $*" >&2; exit 1; }

(( EUID == 0 )) && [[ "${1:-}" == '--apply' ]] || die 'Usage (root, approved): activate.sh --apply <staged-SHA>'
SHA="${2:-}"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || die 'Invalid release SHA.'
[[ "$(node -v)" == 'v22.23.2' ]] || die 'Expected Node.js 22.23.2.'
for tool in flock pm2 ss curl nginx; do command -v "$tool" >/dev/null || die "Missing $tool"; done

RELEASE="$RELEASES/$SHA"
[[ "$(cat "$RELEASE/.conspace-staged" 2>/dev/null || true)" == "$SHA" ]] || die 'Release not staged.'
test -s "$RELEASE/frontend/dist/index.html" || die 'Built frontend index missing.'
test -L "$RELEASE/backend/.env" || die 'Release backend/.env must be a private symlink.'
[[ "$(readlink -f "$RELEASE/backend/.env")" == "$REPO/backend/.env" ]] || die 'Unexpected backend secret target.'
[[ "$(stat -c '%a' "$REPO/backend/.env")" == 600 ]] || die 'backend/.env must be mode 600.'
test -r "$NGINX" && test -r "$DUMP" || die 'Nginx vhost or PM2 dump missing.'
nginx -t
systemctl is-active --quiet pm2-root || die 'pm2-root inactive; do not spawn another PM2 daemon.'

DIST="$REPO/frontend/dist"
if [[ -e "$DIST" && ! -L "$DIST" ]]; then die "$DIST is a real directory; preserve and inspect it manually."; fi
if [[ -L "$DIST" ]]; then
  case "$(readlink "$DIST")" in "$RELEASES"/*/frontend/dist) ;; *) die 'frontend/dist is not a managed release symlink.' ;; esac
fi

mkdir -p "$STATE/backups"
exec 9>"$STATE/deploy.lock"
flock -n 9 || die 'Another CONSPACE deployment is running.'
pm2 jlist | node "$SCRIPT_DIR/pm2-check.cjs" "$DUMP" --strict-all --require-online

OLD="$(cat "$STATE/active.sha" 2>/dev/null || echo holding)"
API_EXISTS=false
if pm2 describe conspace-api >/dev/null 2>&1; then API_EXISTS=true; fi
if [[ "$OLD" == holding && "$API_EXISTS" == true ]] || [[ "$OLD" != holding && "$API_EXISTS" == false ]]; then
  die 'Recorded release and conspace-api PM2 state disagree.'
fi
if [[ "$OLD" != holding ]]; then
  [[ "$OLD" =~ ^[a-f0-9]{40}$ ]] && test -s "$RELEASES/$OLD/backend/src/server.js" || die 'Previous release unavailable for rollback.'
fi

if [[ "$OLD" == "$SHA" ]]; then
  [[ "$API_EXISTS" == true && -L "$DIST" && "$(readlink "$DIST")" == "$RELEASE/frontend/dist" ]] || die 'Recorded active release does not match symlink/process.'
  curl --noproxy '*' --fail --silent --show-error --max-time 5 http://127.0.0.1:5088/api/ready >/dev/null || die 'Already active API is not ready.'
  echo "PASS: $SHA already active and ready; no change."
  exit 0
fi

LISTENER="$(ss -H -lntp '( sport = :5088 )')"
if [[ -n "$LISTENER" ]]; then
  [[ "$API_EXISTS" == true ]] || die "Port 5088 belongs to another service: $LISTENER"
  API_PID="$(pm2 pid conspace-api | head -n 1)"
  [[ "$API_PID" =~ ^[1-9][0-9]*$ && "$LISTENER" == *'127.0.0.1:5088'* && "$LISTENER" == *"pid=$API_PID,"* ]] ||
    die 'Port 5088 listener is not the loopback conspace-api process.'
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$STATE/backups/$STAMP-$SHA"
mkdir -m 700 "$BACKUP"
cp -a "$DUMP" "$BACKUP/dump.pm2"
cp -a "$NGINX" "$BACKUP/conspace.conf"
printf '%s\n' "$OLD" > "$BACKUP/previous.sha"
echo "Private backup created: $BACKUP (contains PM2 environment; do not share)."

wait_for_api() {
  for attempt in {1..20}; do
    if curl --noproxy '*' --silent --show-error --fail --max-time 3 http://127.0.0.1:5088/api/health 2>/dev/null |
      grep -q '"service":"conspace-api"' &&
       curl --noproxy '*' --silent --show-error --fail --max-time 3 http://127.0.0.1:5088/api/ready 2>/dev/null |
      grep -q '"database":"up"'; then return 0; fi
    sleep 1
  done
  return 1
}

reload_release() {
  local cwd="$1"
  if pm2 describe conspace-api >/dev/null 2>&1; then
    CONSPACE_API_CWD="$cwd" pm2 reload "$REPO/ops/ecosystem.config.cjs" --only conspace-api --env production --update-env
  else
    CONSPACE_API_CWD="$cwd" pm2 start "$REPO/ops/ecosystem.config.cjs" --only conspace-api --env production
  fi
}

restore_api() {
  echo 'Attempting isolated conspace-api rollback...' >&2
  if [[ "$OLD" == holding ]]; then
    if pm2 describe conspace-api >/dev/null 2>&1; then pm2 delete conspace-api || true; fi
  else
    reload_release "$RELEASES/$OLD/backend" || true
  fi
}

if ! reload_release "$RELEASE/backend"; then
  restore_api
  die 'PM2 could not reload conspace-api; frontend unchanged.'
fi
if ! wait_for_api; then
  restore_api
  die 'New API health/readiness failed; previous API restored where possible.'
fi

TMP_LINK="$REPO/frontend/.conspace-dist-next-$$"
ln -s "$RELEASE/frontend/dist" "$TMP_LINK"
if ! mv -Tf "$TMP_LINK" "$DIST"; then
  rm -f "$TMP_LINK"
  restore_api
  die 'Frontend symlink switch failed; attempted API rollback.'
fi

printf '%s\n' "$OLD" > "$STATE/previous.sha.tmp"
mv -f "$STATE/previous.sha.tmp" "$STATE/previous.sha"
printf '%s\n' "$SHA" > "$STATE/active.sha.tmp"
mv -f "$STATE/active.sha.tmp" "$STATE/active.sha"
echo "PASS: conspace-api reloaded and frontend switched to $SHA."
echo 'Nginx was not edited. PM2 dump was not saved.'
