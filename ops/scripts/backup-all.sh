#!/usr/bin/env bash
# Database + media backup for CONSPACE only. Run as root; no passwords in argv/env.
set -euo pipefail
umask 077
DB=conspace
MEDIA_ROOT="${MEDIA_ROOT:-/var/lib/conspace/media}"
BACKUP_ROOT="${CONSPACE_BACKUP_ROOT:-/var/backups/conspace}"
NGINX_GROUP="${NGINX_GROUP:-www-data}"
BACKUP_ID="${BACKUP_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
die(){ echo "FAIL: $*" >&2; exit 1; }

(( EUID == 0 )) || die 'Run as root.'
[[ "$BACKUP_ID" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || die 'Invalid backup ID.'
command -v runuser >/dev/null && command -v pg_dump >/dev/null && command -v pg_restore >/dev/null || die 'PostgreSQL client tools missing.'
[[ ! -L "$MEDIA_ROOT" && ! -L "$BACKUP_ROOT" ]] || die 'Refusing symlink media or backup root.'
[[ "$(stat -c '%U:%G:%a' "$BACKUP_ROOT" 2>/dev/null || true)" == root:root:700 ]] || die 'Backup root must be root:root mode 0700.'
[[ "$(stat -c '%U:%G:%a' "$MEDIA_ROOT" 2>/dev/null || true)" == "root:$NGINX_GROUP:2750" ]] || die "Media root must be root:$NGINX_GROUP mode 2750."
[[ "$(stat -c '%U:%G:%a' "$MEDIA_ROOT/private" 2>/dev/null || true)" == root:root:700 ]] || die 'private media directory must be root:root mode 0700.'
[[ "$(stat -c '%U:%G:%a' "$MEDIA_ROOT/staging" 2>/dev/null || true)" == root:root:700 ]] || die 'staging media directory must be root:root mode 0700.'
[[ "$(stat -c '%U:%G:%a' "$MEDIA_ROOT/public" 2>/dev/null || true)" == "root:$NGINX_GROUP:2750" ]] || die "public media directory must be root:$NGINX_GROUP mode 2750."
pg_isready -h /var/run/postgresql -p 5432 -d "$DB" >/dev/null || die 'PostgreSQL is not ready.'
if find "$MEDIA_ROOT" -type l -print -quit | grep -q .; then die 'Media tree contains symlinks; inspect before backup.'; fi

DB_NAME="$(runuser -u postgres -- psql -X -d "$DB" -Atqc 'SELECT current_database()')"
[[ "$DB_NAME" == conspace ]] || die 'Refusing to dump a database other than conspace.'
OUT="$BACKUP_ROOT/$BACKUP_ID"
[[ ! -e "$OUT" ]] || die "Backup directory already exists: $OUT"
install -d -o root -g root -m 0700 "$OUT"

DB_TMP="$OUT/database.dump.tmp"
MEDIA_TMP="$OUT/media.tar.gz.tmp"
cleanup(){ rm -f "$DB_TMP" "$MEDIA_TMP"; }
trap cleanup EXIT

runuser -u postgres -- pg_dump --format=custom --no-owner --no-acl --dbname=conspace > "$DB_TMP"
test -s "$DB_TMP" || die 'pg_dump produced an empty archive.'
pg_restore --list "$DB_TMP" >/dev/null || die 'pg_restore archive listing failed.'
mv "$DB_TMP" "$OUT/database.dump"

tar --one-file-system --numeric-owner -czf "$MEDIA_TMP" -C "$MEDIA_ROOT" private public staging
tar -tzf "$MEDIA_TMP" | awk '/^\// || /(^|\/)\.\.(\/|$)/ { bad=1 } END { exit bad }' ||
  die 'Media archive contains an unsafe path.'
mv "$MEDIA_TMP" "$OUT/media.tar.gz"

(cd "$OUT" && sha256sum database.dump media.tar.gz > SHA256SUMS)
chmod 0600 "$OUT/database.dump" "$OUT/media.tar.gz" "$OUT/SHA256SUMS"
sync
echo "PASS: CONSPACE database and media backed up to $OUT."
echo 'Backup files are root-only and contain personal/project data; never commit or share them.'

# Keep the latest 7 complete backup sets even when older than 14 days.
mapfile -t complete < <(find "$BACKUP_ROOT" -mindepth 2 -maxdepth 2 -type f -name SHA256SUMS -printf '%T@ %h\n' | sort -nr | cut -d ' ' -f 2-)
if (( ${#complete[@]} > 7 )); then
  for ((i=7; i<${#complete[@]}; i++)); do
    old="${complete[i]}"
    [[ "$old" == "$BACKUP_ROOT"/20????????T??????Z ]] || die "Unexpected prune path: $old"
    [[ -d "$old" && ! -L "$old" ]] || die "Refusing non-directory backup entry: $old"
    if [[ -n "$(find "$old" -maxdepth 0 -mtime +14 -print)" ]]; then
      rm -rf -- "$old"
    fi
  done
fi
echo 'Retention: 14 days; preserve at least 7 complete backup sets.'
