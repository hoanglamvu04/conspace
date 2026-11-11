#!/usr/bin/env bash
# Public-domain check AFTER Nginx, DNS and TLS are configured. Does not mutate VPS state.
set -euo pipefail
DOMAIN="${DOMAIN:-conspace.vn}"
WWW_DOMAIN="${WWW_DOMAIN:-www.$DOMAIN}"

for host in "$DOMAIN" "$WWW_DOMAIN"; do
  printf '[https] Checking %s ... ' "$host"
  curl --silent --show-error --fail --max-time 20 --head "https://$host/" >/dev/null
  echo OK

  printf '[edge] Checking %s ... ' "$host"
  body=$(curl --silent --show-error --fail --max-time 20 "https://$host/__infra/health")
  case "$body" in
    *'"service":"conspace-edge"'*) echo OK ;;
    *) printf 'FAILED: unexpected response: %s\n' "$body" >&2; exit 1 ;;
  esac
done

printf '[http] Checking HTTP -> HTTPS redirect ... '
redirect_code=$(curl --silent --show-error --max-time 20 --output /dev/null --write-out '%{http_code}' "http://$DOMAIN/")
case "$redirect_code" in
  301|302|307|308) echo "$redirect_code" ;;
  *) printf 'FAILED: got HTTP %s\n' "$redirect_code" >&2; exit 1 ;;
esac

echo 'PASS: public DNS path, verified TLS, Nginx edge health, HTTP redirect.'
echo 'NOTE: Express API and PostgreSQL application schema are NOT tested by this script.'
