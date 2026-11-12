#!/usr/bin/env bash
# Explicit, audited application switch. NEVER edits Nginx or saves global PM2 state.
set -euo pipefail
umask 077

REPO=/var/www/conspace
RELEASES=/var/www/conspace-releases
STATE=/var/lib/conspace-ops
NGINX=/etc/nginx/sites-available/conspace.conf
DUMP=/root/.pm2/dump.pm2
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if (( EUID != 0 )) || [[ "${1:-}" != '--apply' ]]; then
  echo 'Usage (root, owner-approved): bash ops/scripts/activate.sh --apply <staged-SHA> [--rollback]' >&2
  exit 2
fi
SHA="${2:-}"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || { echo 'FAIL: Invalid release SHA.' >&2; exit 2; }
[[ "${3:-}" == '' || "${3:-}" == '--rollback' ]] || { echo 'FAIL: Invalid option.' >&2; exit 2; }
[[ "$(node -v)" == 'v22.23.2' ]] || { echo 'FAIL: Node must be v22.23.2.' >&2; exit 1; }
for command_name in flock pm2 ss curl nginx; do
  command -v "$command_name" >/dev/null || { echo "FAIL: Missing $command_name" >&2; exit 1; }
done

RELEASE="$RELEASES/$SHA"
[[ "$(cat "$RELEASE/.conspace-staged" 2>/dev/null || true)" == "$SHA" ]] || { echo 'FAIL: Release was not successfully staged.' >&2; exit 1; }
test -s "$RELEASE/frontend/dist/index.html"
test -L "$RELEASE/backend/.env"
[[ "$(readlink -f "$RELEASE/backend/.env")" == "$REPO/backend/.env" ]] || { echo 'FAIL: Unexpected backend secret path.' >&2; exit 1; }
test -r "$NGINX"
test -r "$DUMP"
nginx -t
systemctl is-active --quiet pm2-root || { echo 'FAIL: pm2-root is inactive; do not spawn a new PM2 daemon.' >&2; exit 1; }

# Never overwrite a pre-existing, non-managed dist directory.
DIST="$REPO/frontend/dist"
if [[ -e "$DIST" && ! -L "$DIST" ]]; then
  echo "FAIL: $DIST is a real directory. Inspect and manually back it up during a maintenance window." >&2
  exit 1
fi
if [[ -L "$DIST" ]]; then
  case "$(readlink "$DIST")" in
    "$RELEASES"/*/frontend/dist) ;;
    *) echo 'FAIL: Existing frontend/dist symlink is not managed by CONSPACE ops.' >&2; exit 1 ;;
  esac
fi

mkdir -p "$STATE/backups"
exec 9>"$STATE/deploy.lock"
flock -n 9 || { echo 'FAIL: Another CONSPACE switch is in progress.' >&2; exit 1; }

# Sanitized, read-only PM2 inventory. x-hub-api must exist in live + saved lists.
pm2 jlist | node "$SCRIPT_DIR/pm2-check.cjs" "$DUMP"

OLD="$(cat "$STATE/active.sha" 2>/dev/null || true)"
[[ -n "$OLD" ]] || OLD=holding
API_EXISTS=false
if pm2 describe conspace-api >/dev/null 2>&1; then API_EXISTS=true; fi
if [[ "$OLD" == holding && "$API_EXISTS" == true ]] || [[ "$OLD" != holding && "$API_EXISTS" == false ]]; then
  echo 'FAIL: PM2 conspace-api state differs from recorded active release. Investigate, do not delete.' >&2
  exit 1
fi
if [[ "$OLD" != holding ]]; then
  [[ "$OLD" =~ ^[a-f0-9]{40}$ ]] && test -s "$RELEASES/$OLD/backend/src/server.js" || {
    echo 'FAIL: Previous release not available for automatic API recovery.' >&2; exit 1;
  }
fi

if [[ "$OLD" == "$SHA" ]]; then
  [[ "$API_EXISTS" == true && -L "$DIST" && "$(readlink "$DIST")" == "$RELEASE/frontend/dist" ]] || {
    echo 'FAIL: Stored active SHA does not match PM2 and frontend symlink.' >&2; exit 1;
  }
  curl --noproxy '*' --fail --silent --show-error --max-time 5 http://127.0.0.1:5088/api/ready >/dev/null || {
    echo 'FAIL: Already-active API is not ready.' >&2; exit 1;
  }
  echo "PASS: $SHA already active and ready; no changes made."
  exit 0
fi

# Abort if 5088 belongs to another process or listens on a public interface.
LISTENER="$(ss -H -lntp '( sport = :5088 )')"
if [[ -n "$LISTENER" ]]; then
  if [[ "$API_EXISTS" != true ]]; then
    echo "FAIL: Port 5088 occupied by a non-CONSPACE service: $LISTENER" >&2; exit 1
  fi
  API_PID="$(pm2 pid conspace-api | head -n 1)"
  if [[ ! "$API_PID" =~ ^[1-9][0-9]*$ || "$LISTENER" != *'127.0.0.1:5088'* || "$LISTENER" != *"pid=$API_PID,"* ]]; then
    echo 'FAIL: Port 5088 listener does not match loopback conspace-api PID.' >&2; exit 1
  fi
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$STATE/backups/$STAMP-$SHA"
mkdir -m 700 "$BACKUP"
cp -a "$DUMP" "$BACKUP/dump.pm2"
cp -a "$NGINX" "$BACKUP/conspace.conf"
printf '%s\n' "$OLD" > "$BACKUP/previous.sha"
echo "Backup created: $BACKUP (contains PM2 env/secrets; do not share)."

restore_api() {
  echo 'Attempting isolated conspace-api recovery...' >&2
  if pm2 describe conspace-api >/dev/null 2>&1; then pm2 delete conspace-api || true; fi
  if [[ "$OLD" != holding ]]; then
    CONSPACE_API_CWD="$RELEASES/$OLD/backend" pm2 start "$REPO/ops/ecosystem.config.cjs" --only conspace-api --env production || true
  fi
}

wait_for_api() {
  for attempt in {1..15}; do
    if curl --noproxy '*' --silent --show-error --fail --max-time 3 http://127.0.0.1:5088/api/health 2>/dev/null |
      grep -q '"service":"conspace-api"' &&
       curl --noproxy '*' --silent --show-error --fail --max-time 3 http://127.0.0.1:5088/api/ready 2>/dev/null |
      grep -q '"database":"up"'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# Only the isolated CONSPACE PM2 process is replaced.
if [[ "$API_EXISTS" == true ]]; then pm2 delete conspace-api; fi
if ! CONSPACE_API_CWD="$RELEASE/backend" pm2 start "$REPO/ops/ecosystem.config.cjs" --only conspace-api --env production; then
  restore_api
  echo 'FAIL: Starting new conspace-api failed. Frontend unchanged.' >&2
  exit 1
fi
if ! wait_for_api; then
  restore_api
  echo 'FAIL: New API health/readiness failed. Frontend unchanged.' >&2
  exit 1
fi

# Switch only a managed dist symlink; rename is atomic on the same filesystem.
TMP_LINK="$REPO/frontend/.conspace-dist-next-$$"
if ! ln -s "$RELEASE/frontend/dist" "$TMP_LINK" || ! mv -Tf "$TMP_LINK" "$DIST"; then
  rm -f "$TMP_LINK"
  restore_api
  echo 'FAIL: Frontend symlink switch failed; attempted API recovery.' >&2
  exit 1
fi

printf '%s\n' "$OLD" > "$STATE/previous.sha.tmp"
mv -f "$STATE/previous.sha.tmp" "$STATE/previous.sha"
printf '%s\n' "$SHA" > "$STATE/active.sha.tmp"
mv -f "$STATE/active.sha.tmp" "$STATE/active.sha"
echo "PASS: conspace-api and frontend/dist now point to staged release $SHA."
echo 'Nginx was NOT edited/reloaded; PM2 dump was NOT saved. Perform reviewed Nginx switch and public smoke separately.'
