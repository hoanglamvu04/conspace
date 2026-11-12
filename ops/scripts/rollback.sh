#!/usr/bin/env bash
# Restore prior staged CONSPACE release; no other process changes.
set -euo pipefail
REPO=/var/www/conspace
STATE=/var/lib/conspace-ops
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if (( EUID != 0 )) || [[ "${1:-}" != '--apply' ]]; then
  echo 'Usage (root, approved): bash ops/scripts/rollback.sh --apply' >&2
  exit 2
fi
PREVIOUS="$(cat "$STATE/previous.sha" 2>/dev/null || true)"
[[ -n "$PREVIOUS" ]] || { echo 'FAIL: No recorded previous release.' >&2; exit 1; }

if [[ "$PREVIOUS" == holding ]]; then
  systemctl is-active --quiet pm2-root || { echo 'FAIL: pm2-root inactive.' >&2; exit 1; }
  mkdir -p "$STATE"
  exec 9>"$STATE/deploy.lock"
  flock -n 9 || { echo 'FAIL: CONSPACE deployment lock held.' >&2; exit 1; }
  # On the initial deployment, restore original holding vhost BEFORE deleting API.
  nginx -t
  [[ -f "$REPO/ops/holding/index.html" ]] || { echo 'FAIL: Holding page missing.' >&2; exit 1; }
  EXPECTED="$(sha256sum "$REPO/ops/holding/index.html" | cut -d ' ' -f 1)"
  ACTUAL="$(curl --noproxy '*' --resolve conspace.vn:443:127.0.0.1 --fail --silent --show-error --max-time 10 https://conspace.vn/ | sha256sum | cut -d ' ' -f 1)"
  [[ "$EXPECTED" == "$ACTUAL" ]] || { echo 'FAIL: Restore and reload holding Nginx vhost FIRST.' >&2; exit 1; }
  pm2 jlist | node "$SCRIPT_DIR/pm2-check.cjs" /root/.pm2/dump.pm2
  if pm2 describe conspace-api >/dev/null 2>&1; then pm2 delete conspace-api; fi
  printf 'holding\n' > "$STATE/active.sha"
  echo 'PASS: Back to holding; PM2 dump and other apps untouched.'
  exit 0
fi

[[ "$PREVIOUS" =~ ^[a-f0-9]{40}$ ]] || { echo 'FAIL: Invalid previous SHA.' >&2; exit 1; }
exec bash "$SCRIPT_DIR/activate.sh" --apply "$PREVIOUS" --rollback
