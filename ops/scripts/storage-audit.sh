#!/usr/bin/env bash
# Read-only storage/permissions check; no chmod, chown, uploads or Nginx changes.
set -euo pipefail
MEDIA=/var/lib/conspace/media
BACKUPS=/var/backups/conspace
NGINX_USER=${NGINX_WORKER_USER:-www-data}
fail(){ echo "FAIL: $*" >&2; exit 1; }
[[ -d "$MEDIA" && ! -L "$MEDIA" ]] || fail 'MEDIA_ROOT missing/symlink'
[[ -d "$MEDIA/private" && ! -L "$MEDIA/private" ]] || fail 'private missing/symlink'
[[ -d "$MEDIA/staging" && ! -L "$MEDIA/staging" ]] || fail 'staging missing/symlink'
[[ -d "$MEDIA/public" && ! -L "$MEDIA/public" ]] || fail 'public missing/symlink'
[[ "$(stat -c '%U:%G:%a' "$MEDIA/private")" == root:root:700 ]] || fail 'private permission mismatch'
[[ "$(stat -c '%U:%G:%a' "$MEDIA/staging")" == root:root:700 ]] || fail 'staging permission mismatch'
[[ "$(stat -c '%U:%G:%a' "$BACKUPS")" == root:root:700 ]] || fail 'backup dir not root:root 0700'
[[ "$(stat -c '%a' /var/www/conspace/backend/.env)" == 600 ]] || fail 'backend/.env not mode 0600'
[[ -d "$MEDIA/public" ]] && getent passwd "$NGINX_USER" >/dev/null || fail 'Nginx worker identity missing'
if runuser -u "$NGINX_USER" -- test -r "$MEDIA/private"; then fail 'Nginx can read private media'; fi
if runuser -u "$NGINX_USER" -- test -r "$MEDIA/staging"; then fail 'Nginx can read staging media'; fi
runuser -u "$NGINX_USER" -- test -r "$MEDIA/public" || fail 'Nginx cannot read public media directory'
if find "$MEDIA" -xdev -type l -print -quit | grep -q .; then fail 'Symlink inside media tree'; fi
if find "$MEDIA" -xdev -type f -perm /111 -print -quit | grep -q .; then fail 'Executable media file'; fi
if [[ -f /etc/logrotate.d/conspace-api ]]; then
  logrotate -d /etc/logrotate.d/conspace-api >/dev/null 2>&1 || fail 'logrotate config invalid'
else fail 'CONSPACE logrotate config not installed'; fi
PID="$(pm2 pid conspace-api | head -n 1)"
[[ "$PID" =~ ^[1-9][0-9]*$ ]] || fail 'conspace-api PM2 PID missing'
API_USER="$(ps -o user= -p "$PID" | tr -d ' ')"
[[ "$API_USER" == root ]] || fail 'API account is not expected PM2 root; redesign storage ownership before uploads'
echo 'PASS: CONSPACE media/private/staging isolation, backups, logrotate, PM2 account permissions.'
