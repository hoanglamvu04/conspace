#!/usr/bin/env bash
# Read-only DNS and origin verification for CONSPACE Gate 0.
set -uo pipefail
DOMAIN="${DOMAIN:-conspace.vn}"
WWW_DOMAIN="${WWW_DOMAIN:-www.conspace.vn}"
EXPECTED_IP="${EXPECTED_IP:-103.149.170.146}"

printf 'CONSPACE DNS audit (expected origin IPv4: %s)\n' "$EXPECTED_IP"
if command -v dig >/dev/null 2>&1; then
  for host in "$DOMAIN" "$WWW_DOMAIN"; do
    for resolver in 1.1.1.1 8.8.8.8; do
      printf '\n%s @ %s: A / AAAA / CNAME\n' "$host" "$resolver"
      dig @"$resolver" +time=3 +tries=1 +noall +answer "$host" A 2>&1 || true
      dig @"$resolver" +time=3 +tries=1 +noall +answer "$host" AAAA 2>&1 || true
      dig @"$resolver" +time=3 +tries=1 +noall +answer "$host" CNAME 2>&1 || true
    done
  done
else
  echo 'dig not installed; showing local resolver results instead.'
  for host in "$DOMAIN" "$WWW_DOMAIN"; do
    getent ahostsv4 "$host" 2>&1 | head -n 5 || true
  done
fi

echo
echo 'If a CDN proxy is enabled, public A records may show CDN IPs, not origin IP.'
echo 'Do not change live DNS records until you confirm current hosts and mail services.'
echo 'After Nginx is configured, you may test the origin directly (does NOT require DNS):'
printf 'curl --resolve %s:80:%s http://%s/__infra/health\n' "$DOMAIN" "$EXPECTED_IP" "$DOMAIN"
