#!/usr/bin/env bash
# Read-only CONSPACE acceptance; --with-restore creates ONLY temporary drill resources.
set -euo pipefail
umask 077
MODE="cms"
RESTORE=false
for arg in "$@"; do
  case "$arg" in
    --cms) MODE=cms ;;
    --public-only) MODE=public ;;
    --with-restore) RESTORE=true ;;
    *) echo 'Usage: production-acceptance.sh [--cms|--public-only] [--with-restore]' >&2; exit 2 ;;
  esac
done
BASE="https://conspace.vn"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
code() { curl --noproxy '*' --path-as-is -sS --max-time 15 -o "$TMP/body" -w '%{http_code}' "$1"; }
pass_code() {
  local status
  status="$(code "$1")" || { echo "FAIL: network $1" >&2; exit 1; }
  [[ "$status" == "$2" ]] || { echo "FAIL: expected $2 got $status for $1" >&2; exit 1; }
  echo "PASS: $1 ($status)"
}
health() {
  pass_code "$1" 200
  node - "$TMP/body" "$2" "${3:-false}" <<'NODE'
const fs=require('node:fs');
try{
const x=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(x.ok!==true||x.service!==process.argv[3]||(process.argv[4]==='true'&&x.checks?.database!=='up'))process.exit(1);
}catch{process.exit(1)}
NODE
}
denied() {
  local status
  status="$(code "$1")" || exit 1
  case "$status" in
    401|403) echo "PASS: anonymous denied $1 ($status)" ;;
    404) echo "BLOCKED: Admin endpoint missing (404), not authenticated: $1" >&2; exit 1 ;;
    *) echo "FAIL: anonymous admin access returned $status: $1" >&2; exit 1 ;;
  esac
}
private_path() {
  local status
  status="$(code "$1")" || exit 1
  case "$status" in
    403|404) echo "PASS: private/staging URL denied ($status)" ;;
    *) echo "FAIL: private/staging path returned $status" >&2; exit 1 ;;
  esac
}
for host in conspace.vn www.conspace.vn; do
  pass_code "https://$host/" 200
  health "https://$host/__infra/health" conspace-edge
  health "https://$host/api/health" conspace-api
  health "https://$host/api/ready" conspace-api true
  redirect="$(curl --noproxy '*' -sSI --max-time 15 "http://$host/" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}' | tail -n 1)"
  case "$redirect" in
    https://conspace.vn/*|https://www.conspace.vn/*) echo "PASS: HTTP->HTTPS $host" ;;
    *) echo "FAIL: missing safe HTTPS redirect for $host" >&2; exit 1 ;;
  esac
  private_path "https://$host/media/private/sprint2b-canary.jpg"
  private_path "https://$host/media/staging/sprint2b-canary.jpg"
  private_path "https://$host/media/private/%2e%2e%2fpublic%2fsprint2b-canary.jpg"
  if [[ "$MODE" == cms ]]; then
    pass_code "https://$host/admin/" 200
    denied "https://$host/api/admin/users"
  fi
done
if [[ "$MODE" == cms ]]; then
  OTHER_SITES_FILE="NO"
  OTHER_SITES_FILE="${OTHER_SITES_FILE:-/var/lib/conspace-ops/other-sites.acceptance}"
  [[ -s "$OTHER_SITES_FILE" && "$(stat -c '%a' "$OTHER_SITES_FILE")" == 600 ]] || {
    echo 'BLOCKED: Add root-protected 0600 other-sites.acceptance with: https://site.example/health 200' >&2; exit 1;
  }
  sites=0
  while read -r url expected extra; do
    [[ -z "$url" || "$url" == \#* ]] && continue
    [[ -z "$extra" && "$url" =~ ^https://[A-Za-z0-9.-]+(/[A-Za-z0-9./_-]*)?$ && "$expected" =~ ^(200|204|301|302|307|308)$ ]] || {
      echo 'FAIL: invalid other-sites baseline line (only HTTPS, no query/credentials)' >&2; exit 1;
    }
    pass_code "$url" "$expected"
    sites=$((sites+1))
  done < "$OTHER_SITES_FILE"
  (( sites > 0 )) || { echo 'BLOCKED: no other site baseline provided' >&2; exit 1; }
fi
BACKUP_ROOT="${CONSPACE_BACKUP_ROOT:-/var/backups/conspace}"
if (( EUID == 0 )) && [[ -d "$BACKUP_ROOT" ]]; then
  latest="$(find "$BACKUP_ROOT" -mindepth 2 -maxdepth 2 -type f -name SHA256SUMS -printf '%T@ %h\n' | sort -nr | head -n 1 | cut -d ' ' -f 2-)"
  [[ -n "$latest" ]] || { echo 'FAIL: no complete CONSPACE backup' >&2; exit 1; }
  (cd "$latest" && sha256sum -c SHA256SUMS >/dev/null) || { echo 'FAIL: backup checksum mismatch' >&2; exit 1; }
  echo "PASS: backup checksum $(basename "$latest")"
  if [[ "$RESTORE" == true ]]; then
    bash "$SCRIPT_DIR/restore-drill.sh" "$latest"
  else
    echo 'NOT RUN: restore drill (use --with-restore with owner approval)'
  fi
elif [[ "$MODE" == cms ]]; then
  echo 'BLOCKED: root-only CONSPACE backup verification not performed' >&2; exit 1
else
  echo 'NOT RUN: backup checks require root on VPS'
fi
if [[ "$MODE" == cms ]]; then
  echo 'PARTIAL: read-only CMS production checks passed; staging RBAC/CSRF acceptance is separately mandatory.'
else
  echo 'PASS: public-only checks, not CMS authorization acceptance.'
fi
