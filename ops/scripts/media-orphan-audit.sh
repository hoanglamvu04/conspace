#!/usr/bin/env bash
# Orphan report by a fresh backend-generated manifest. Default is dry-run.
set -euo pipefail
umask 077
MEDIA_ROOT="${MEDIA_ROOT:-/var/lib/conspace/media}"
BACKUP_ROOT="${CONSPACE_BACKUP_ROOT:-/var/backups/conspace}"
MANIFEST="${MEDIA_MANIFEST:-/var/lib/conspace/media/referenced-public-files.txt}"
APPLY=false
[[ "${1:-}" == '--apply' ]] && APPLY=true
die(){ echo "FAIL: $*" >&2; exit 1; }

(( EUID == 0 )) || die 'Run as root.'
PUBLIC="$MEDIA_ROOT/public"
[[ ! -L "$PUBLIC" && -d "$PUBLIC" ]] || die 'Public media path missing or symlinked.'
test -f "$MANIFEST" || die 'No backend-generated media manifest; refusing to infer orphan files.'
HEADER="$(head -n 1 "$MANIFEST")"
[[ "$HEADER" =~ ^#\ conspace-media-manifest-v1\ database=conspace\ generated_at=([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)$ ]] ||
  die 'Manifest header invalid or not for database conspace.'
GENERATED="${BASH_REMATCH[1]}"
AGE=$(( $(date -u +%s) - $(date -u -d "$GENERATED" +%s) ))
(( AGE >= 0 && AGE <= 3600 )) || die 'Manifest must be generated within the last hour.'

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" == \#* || -z "$line" ]] && continue
  [[ "$line" =~ ^[a-f0-9]{32}\.(jpg|jpeg|png|webp|avif|pdf)$ ]] || die "Unsafe manifest entry: $line"
  printf '%s\n' "$line" >> "$TMP"
done < "$MANIFEST"
sort -u -o "$TMP" "$TMP"

if [[ "$APPLY" == true ]]; then
  LATEST_MEDIA="$(find "$BACKUP_ROOT" -mindepth 2 -maxdepth 2 -type f -name media.tar.gz -mmin -60 -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d ' ' -f 2-)"
  [[ -n "$LATEST_MEDIA" ]] || die 'A media backup from the last hour is required before deletion.'
  BACKUP_DIR="$(dirname "$LATEST_MEDIA")"
  (cd "$BACKUP_DIR" && sha256sum -c SHA256SUMS) || die 'Recent media backup checksum validation failed.'
fi

ORPHANS=0
while IFS= read -r -d '' file; do
  base="$(basename "$file")"
  [[ "$base" =~ ^[a-f0-9]{32}\.(jpg|jpeg|png|webp|avif|pdf)$ ]] || die "Unexpected file in public media directory: $base"
  if ! grep -Fqx -- "$base" "$TMP"; then
    printf 'ORPHAN: %s\n' "$base"
    ORPHANS=$((ORPHANS + 1))
    if [[ "$APPLY" == true ]]; then
      [[ ! -L "$file" && -f "$file" ]] || die "Refusing non-regular file: $file"
      rm -- "$file"
    fi
  fi
done < <(find "$PUBLIC" -mindepth 1 -maxdepth 1 -type f -print0)

if find "$PUBLIC" -mindepth 1 -maxdepth 1 ! -type f -print -quit | grep -q .; then
  die 'Unexpected directory or symlink in public media root; manual review required.'
fi
if [[ "$APPLY" == true ]]; then
  echo "PASS: Removed $ORPHANS unreferenced public media file(s); backup checksum prerequisite verified."
else
  echo "DRY RUN: $ORPHANS candidate orphan(s). No files deleted."
  echo 'Review the manifest source and backup before rerunning with --apply.'
fi
