#!/usr/bin/env bash
# Read-only CONSPACE health summary. No credentials, environment values or request bodies.
set -euo pipefail
REPO=/var/www/conspace
BACKUP_ROOT="${CONSPACE_BACKUP_ROOT:-/var/backups/conspace}"
failures=0

echo '=== Services ==='
for service in nginx postgresql pm2-root; do
  state="$(systemctl is-active "$service" 2>/dev/null || true)"
  echo "$service: ${state:-unknown}"
  [[ "$state" == active ]] || failures=$((failures+1))
done

echo '=== API ==='
if curl --noproxy '*' --silent --show-error --fail --max-time 5 http://127.0.0.1:5088/api/health |
  grep -q '"service":"conspace-api"'; then echo 'PASS: API liveness'; else echo 'FAIL: API liveness'; failures=$((failures+1)); fi
if curl --noproxy '*' --silent --show-error --fail --max-time 5 http://127.0.0.1:5088/api/ready |
  grep -q '"database":"up"'; then echo 'PASS: API database readiness'; else echo 'FAIL: API database readiness'; failures=$((failures+1)); fi

echo '=== PM2 (names/status only) ==='
if [[ -r /root/.pm2/dump.pm2 ]]; then
  pm2 jlist | node "$REPO/ops/scripts/pm2-check.cjs" /root/.pm2/dump.pm2 --strict-all --require-online ||
    failures=$((failures+1))
else
  echo 'FAIL: PM2 dump missing/unreadable'; failures=$((failures+1))
fi

echo '=== Backup freshness and integrity ==='
LATEST="$(find "$BACKUP_ROOT" -mindepth 2 -maxdepth 2 -type f -name SHA256SUMS -printf '%T@ %h\n' 2>/dev/null | sort -nr | head -n 1 | cut -d ' ' -f 2-)"
if [[ -n "$LATEST" ]]; then
  AGE=$(( $(date -u +%s) - $(stat -c %Y "$LATEST/SHA256SUMS") ))
  echo "Latest backup: $(basename "$LATEST"), age ${AGE}s"
  if (( AGE > 93600 )); then echo 'FAIL: Backup older than 26 hours'; failures=$((failures+1)); else
    (cd "$LATEST" && sha256sum -c SHA256SUMS) || failures=$((failures+1))
  fi
else
  echo 'FAIL: No complete backup found'; failures=$((failures+1))
fi

echo '=== Disk ==='
df -h / /var/backups/conspace
AVAIL="$(df -P /var/backups/conspace | awk 'NR==2 {gsub(/%/, "", $5); print 100-$5}')"
if [[ "$AVAIL" =~ ^[0-9]+$ ]] && (( AVAIL < 15 )); then echo "FAIL: Backup filesystem has only ${AVAIL}% free"; failures=$((failures+1)); fi

echo '=== API logs ==='
for log in /var/log/conspace/api-out.log /var/log/conspace/api-error.log; do
  if [[ -f "$log" ]]; then printf '%s bytes: ' "$log"; stat -c '%s' "$log"; else echo "FAIL: Log file missing: $log"; failures=$((failures+1)); fi
done

if (( failures )); then echo "FAIL: $failures monitoring check(s) need attention."; exit 1; fi
echo 'PASS: CONSPACE operational checks.'
