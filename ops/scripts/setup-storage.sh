#!/usr/bin/env bash
# Explicit one-time setup for durable media, backup and isolated API logs.
set -euo pipefail
umask 077
REPO=/var/www/conspace
MEDIA_ROOT="${MEDIA_ROOT:-/var/lib/conspace/media}"
BACKUP_ROOT="${CONSPACE_BACKUP_ROOT:-/var/backups/conspace}"
NGINX_GROUP="${NGINX_GROUP:-www-data}"
die(){ echo "STOP: $*" >&2; exit 1; }

(( EUID == 0 )) && [[ "${1:-}" == '--apply' ]] || die 'Usage (root, approved): setup-storage.sh --apply'
[[ "$MEDIA_ROOT" == /var/lib/conspace/media ]] || die 'The reviewed Nginx alias currently supports only /var/lib/conspace/media.'
[[ "$BACKUP_ROOT" == /var/backups/conspace ]] || die 'The reviewed systemd unit currently supports only /var/backups/conspace.'
case "$MEDIA_ROOT/" in "$REPO/"*) die 'MEDIA_ROOT must be outside the Git/source tree.' ;; esac
getent group "$NGINX_GROUP" >/dev/null || die "Nginx group $NGINX_GROUP not found; inspect nginx.conf first."

ensure_dir() {
  local path="$1" owner="$2" group="$3" mode="$4"
  [[ ! -L "$path" ]] || die "Refusing symlink storage path: $path"
  if [[ -e "$path" ]]; then
    [[ -d "$path" ]] || die "Not a directory: $path"
    local actual
    actual="$(stat -c '%U:%G:%a' "$path")"
    [[ "$actual" == "$owner:$group:$mode" ]] || die "$path exists with $actual; expected $owner:$group:$mode. Review manually; not changed."
  else
    install -d -o "$owner" -g "$group" -m "$mode" "$path"
  fi
}
ensure_dir /var/lib/conspace root "$NGINX_GROUP" 2750
ensure_dir "$MEDIA_ROOT" root "$NGINX_GROUP" 2750
ensure_dir "$MEDIA_ROOT/staging" root root 0700
ensure_dir "$MEDIA_ROOT/private" root root 0700
ensure_dir "$MEDIA_ROOT/public" root "$NGINX_GROUP" 2750
ensure_dir "$BACKUP_ROOT" root root 0700
ensure_dir /var/log/conspace root root 0750

LOGROTATE=/etc/logrotate.d/conspace-api
SOURCE="$REPO/ops/logrotate/conspace-api"
test -s "$SOURCE" || die "Missing $SOURCE"
if [[ -e "$LOGROTATE" ]]; then
  cp -a "$LOGROTATE" "$LOGROTATE.before-conspace-$(date -u +%Y%m%dT%H%M%SZ)"
fi
install -o root -g root -m 0644 "$SOURCE" "$LOGROTATE"
if command -v logrotate >/dev/null 2>&1; then logrotate -d "$LOGROTATE" >/dev/null; fi
echo "PASS: MEDIA_ROOT=$MEDIA_ROOT (private/staging 0700; public 2750 root:$NGINX_GROUP)."
echo "PASS: backup root $BACKUP_ROOT (0700) and /var/log/conspace (0750) prepared."
echo "Add MEDIA_ROOT=$MEDIA_ROOT to private backend/.env only after Backend implements it."
echo 'No Nginx, PM2, PostgreSQL, or other-site configuration was changed.'
