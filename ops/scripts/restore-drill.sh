#!/usr/bin/env bash
# Restore verification ONLY into a newly created temporary database and media directory.
set -euo pipefail
umask 077
BACKUP_ROOT="${CONSPACE_BACKUP_ROOT:-/var/backups/conspace}"
BACKUP_DIR="${1:-}"
die(){ echo "FAIL: $*" >&2; exit 1; }

(( EUID == 0 )) || die 'Run as root.'
[[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" ]] || die "Pass an existing backup directory under $BACKUP_ROOT."
ROOT_REAL="$(realpath -e "$BACKUP_ROOT")"
DIR_REAL="$(realpath -e "$BACKUP_DIR")"
case "$DIR_REAL/" in "$ROOT_REAL/"*) ;; *) die 'Backup path resolves outside the approved backup root.' ;; esac
[[ -f "$DIR_REAL/SHA256SUMS" ]] || die 'Backup checksum file missing.'
(cd "$DIR_REAL" && sha256sum -c SHA256SUMS)
pg_restore --list "$DIR_REAL/database.dump" >/dev/null
tar -tzf "$DIR_REAL/media.tar.gz" >/dev/null

STAMP="$(date -u +%Y%m%d%H%M%S)"
TEST_DB="conspace_restorecheck_$STAMP"
RESTORE_MEDIA="/var/tmp/conspace-media-restorecheck-$STAMP"
[[ "$TEST_DB" =~ ^conspace_restorecheck_[0-9]{14}$ ]] || die 'Invalid temporary DB name.'
[[ ! -e "$RESTORE_MEDIA" ]] || die 'Temporary media restore path already exists.'
EXISTS="$(runuser -u postgres -- psql -X -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$TEST_DB'")"
[[ -z "$EXISTS" ]] || die 'Temporary database name already exists.'
CREATED=false
cleanup(){
  if [[ "$CREATED" == true ]]; then runuser -u postgres -- dropdb --if-exists "$TEST_DB" >/dev/null || true; fi
  if [[ -d "$RESTORE_MEDIA" ]]; then rm -rf -- "$RESTORE_MEDIA"; fi
}
trap cleanup EXIT

ROLE_EXISTS="$(runuser -u postgres -- psql -X -d postgres -Atqc "SELECT 1 FROM pg_roles WHERE rolname = 'conspace_app'")"
[[ "$ROLE_EXISTS" == 1 ]] || die 'conspace_app role missing; cannot validate application-role restore.'
runuser -u postgres -- createdb --owner=conspace_app "$TEST_DB"
CREATED=true
runuser -u postgres -- pg_restore --exit-on-error --no-owner --no-acl --role=conspace_app --dbname="$TEST_DB" "$DIR_REAL/database.dump"
runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d "$TEST_DB" -c 'SET ROLE conspace_app; SELECT current_database(), current_user;'
runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d "$TEST_DB" -Atqc "SELECT to_regclass('conspace.schema_migrations') IS NOT NULL" | grep -qx t ||
  die 'Restored migration ledger is missing.'

install -d -o root -g root -m 0700 "$RESTORE_MEDIA"
tar --no-same-owner --no-same-permissions -xzf "$DIR_REAL/media.tar.gz" -C "$RESTORE_MEDIA"
test -d "$RESTORE_MEDIA/private" && test -d "$RESTORE_MEDIA/public" && test -d "$RESTORE_MEDIA/staging" ||
  die 'Restored media folder structure is incomplete.'

echo "PASS: database restored and queried as conspace_app in temporary $TEST_DB."
echo "PASS: media archive extracted to temporary $RESTORE_MEDIA."
echo 'Temporary DB and media directory will be removed on exit. Production conspace, hola_maps and x_hub were not modified.'
