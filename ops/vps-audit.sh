#!/usr/bin/env bash
# Read-only inventory. Never install packages, edit files, restart services or reveal env secrets.
set -uo pipefail
DOMAIN="${DOMAIN:-conspace.vn}"
WWW_DOMAIN="${WWW_DOMAIN:-www.$DOMAIN}"
PGPORT="${PGPORT:-5432}"

section() { printf '\n=== %s ===\n' "$1"; }
run_if_exists() {
  if command -v "$1" >/dev/null 2>&1; then
    "$@" 2>&1 || true
  else
    printf 'NOT INSTALLED: %s\n' "$1"
  fi
}

section "HOST"
date -u '+UTC: %Y-%m-%dT%H:%M:%SZ'
hostname 2>/dev/null || true
uname -a
if [ -r /etc/os-release ]; then
  grep -E '^(PRETTY_NAME|ID|VERSION_ID)=' /etc/os-release || true
fi

section "CAPACITY"
run_if_exists nproc
run_if_exists free -h
run_if_exists df -h /
run_if_exists uptime

section "TOOLS AND VERSIONS"
for tool in git node npm pm2 nginx certbot psql pg_isready curl openssl ss; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf '%-13s %s\n' "$tool" "$(command -v "$tool")"
  else
    printf '%-13s %s\n' "$tool" "MISSING"
  fi
done
run_if_exists node --version
run_if_exists npm --version
run_if_exists psql --version
run_if_exists nginx -v

section "LISTENING PORTS (READ ONLY)"
if command -v ss >/dev/null 2>&1; then
  ss -lnt 2>/dev/null || true
fi

section "NGINX CONFIG CHECK"
if command -v nginx >/dev/null 2>&1; then
  nginx -t 2>&1 || printf 'If access was denied, re-run sudo nginx -t separately.\n'
fi
if [ -d /etc/nginx/sites-enabled ]; then
  grep -RliF -- "$DOMAIN" /etc/nginx/sites-enabled 2>/dev/null || true
fi

section "SERVICES"
if command -v systemctl >/dev/null 2>&1; then
  for service in nginx postgresql; do
    printf '%s: ' "$service"
    systemctl is-active "$service" 2>/dev/null || true
  done
fi

section "POSTGRES AVAILABILITY (NO LOGIN)"
if command -v pg_isready >/dev/null 2>&1; then
  pg_isready -h 127.0.0.1 -p "$PGPORT" || true
fi

section "DNS (NOT PROOF OF VPS OWNERSHIP)"
if command -v getent >/dev/null 2>&1; then
  for host in "$DOMAIN" "$WWW_DOMAIN"; do
    printf '%s -> ' "$host"
    getent ahostsv4 "$host" 2>/dev/null | awk 'NR==1 {print $1}' || true
  done
fi

section "NOTES"
printf 'Inventory only: these results do NOT prove HTTPS, database permission or deployment success.\n'
printf 'Do not paste SSH keys, PostgreSQL passwords, real env values or cloud credentials.\n'
