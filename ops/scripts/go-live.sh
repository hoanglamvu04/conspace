#!/usr/bin/env bash
# Owner-approved, CI-gated deployment of main to CONSPACE only.
# Never runs global PM2 actions, changes PostgreSQL cluster config, or reboots the VPS.
set -euo pipefail
umask 077
REPO=/var/www/conspace
die(){ printf 'STOP: %s\n' "$*" >&2; exit 1; }
(( EUID == 0 )) || die 'Run as root (the owner of pm2-root).'
[[ "${1:-}" == '--apply' ]] || die 'Usage: go-live.sh --apply <40-char-main-SHA>'
APPROVED_SHA="${2:-}"
[[ "$APPROVED_SHA" =~ ^[a-f0-9]{40}$ ]] || die 'Invalid approved SHA.'
[[ -z "$(git -C "$REPO" status --porcelain)" ]] || die 'Working tree has changes/untracked files. Inspect; do not discard.'
[[ "$(git -C "$REPO" branch --show-current)" == main ]] || die 'Only main is deployable.'

cd "$REPO"
git fetch --no-tags origin main
git pull --ff-only origin main
SHA="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse refs/remotes/origin/main)"
[[ "$SHA" == "$REMOTE" && "$SHA" == "$APPROVED_SHA" ]] || die "Local main, origin/main and approved SHA must match. local=$SHA remote=$REMOTE approved=$APPROVED_SHA"
[[ "${CONSPACE_CI_APPROVED_SHA:-}" == "$SHA" ]] || die 'Set CONSPACE_CI_APPROVED_SHA to this SHA only after verifying all GitHub Actions checks passed.'
[[ "$(node -v)" == 'v22.23.2' ]] || die 'Expected Node.js 22.23.2.'
for file in backend/package-lock.json frontend/package-lock.json; do test -s "$file" || die "$file missing."; done
test -f /root/.pm2/dump.pm2 || die 'PM2 saved dump missing.'
test -f /etc/nginx/sites-available/conspace.conf || die 'CONSPACE Nginx vhost missing.'
test -f backend/.env || die 'Private backend/.env missing; prepare it manually.'
[[ "$(stat -c '%a' backend/.env)" == 600 ]] || die 'backend/.env must be mode 600.'
if git ls-files --error-unmatch backend/.env >/dev/null 2>&1; then die 'backend/.env is tracked by Git.'; fi

echo '=== 1. Verify GitHub Actions checks for this exact commit ==='
CHECKS_JSON="$(mktemp)"
trap 'rm -f "$CHECKS_JSON"' EXIT
curl --fail --silent --show-error --max-time 20 \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/hoanglamvu04/conspace/commits/$SHA/check-runs?per_page=100" > "$CHECKS_JSON"
node - "$CHECKS_JSON" <<'NODE'
const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(data.check_runs) || data.check_runs.length === 0) {
  console.error('STOP: No GitHub check-runs found for this SHA.');
  process.exit(1);
}
const bad = data.check_runs.filter((check) =>
  check.status !== 'completed' || check.conclusion !== 'success'
);
for (const check of data.check_runs) {
  console.log((check.conclusion === 'success' ? 'PASS: ' : 'WAIT/FAIL: ') + check.name + ' [' + check.status + '/' + check.conclusion + ']');
}
if (bad.length) {
  console.error('STOP: Every check-run for the approved SHA must be completed/success.');
  process.exit(1);
}
NODE

echo '=== 2. Verify existing PM2 apps and saved dump (read-only) ==='
pm2 jlist | node ops/scripts/pm2-check.cjs /root/.pm2/dump.pm2 --strict-all --require-online
bash ops/scripts/preflight.sh

echo '=== 3. Prepare isolated storage/log directories ==='
bash ops/scripts/setup-storage.sh --apply

echo '=== 4. Stage immutable release and run tests/build ==='
bash ops/scripts/stage.sh "$SHA"
RELEASE="/var/www/conspace-releases/$SHA"

echo '=== 5. Back up CONSPACE database + media BEFORE migrations ==='
bash ops/scripts/backup-all.sh

echo '=== 6. Apply transactional CONSPACE migrations and seed ==='
npm run db:migrate --prefix "$RELEASE/backend"
npm run db:seed --prefix "$RELEASE/backend"

echo '=== 7. Reload only conspace-api and switch frontend ==='
if [[ -d frontend/dist && ! -L frontend/dist ]]; then
  OLD_DIST="frontend/dist.before-gate1-$(date -u +%Y%m%dT%H%M%SZ)"
  mv frontend/dist "$OLD_DIST"
  echo "Preserved old dist at $OLD_DIST"
fi
bash ops/scripts/activate.sh --apply "$SHA"
if ! bash ops/scripts/fix-static-access.sh; then
  bash ops/scripts/rollback.sh --apply || true
  die 'Static asset permission check failed; application rollback attempted.'
fi

echo '=== 8. Back up, validate and reload only CONSPACE Nginx vhost ==='
if ! python3 ops/scripts/switch-nginx-gate1.py; then
  bash ops/scripts/rollback.sh --apply || true
  die 'Nginx switch failed; its script restores the vhost backup and app rollback was attempted.'
fi

echo '=== 9. Verify both public HTTPS hostnames ==='
if ! bash ops/scripts/smoke.sh; then
  BACKUP="$(cat /var/lib/conspace-ops/last-vhost-backup.txt 2>/dev/null || true)"
  case "$BACKUP" in
    /etc/nginx/sites-available/conspace.conf.before-gate1-*)
      if [[ -f "$BACKUP" ]]; then
        cp -a "$BACKUP" /etc/nginx/sites-available/conspace.conf
        nginx -t && systemctl reload nginx
      else
        echo 'URGENT: Recorded Nginx backup file is missing.' >&2
      fi
      ;;
    *) echo 'URGENT: Refusing to guess Nginx backup path.' >&2 ;;
  esac
  bash ops/scripts/rollback.sh --apply || true
  die 'Public smoke failed; Nginx restore and application rollback attempted.'
fi

echo '=== 10. Final process and backup checks ==='
pm2 describe conspace-api
pm2 logs conspace-api --lines 30 --nostream || true
bash ops/scripts/monitor.sh
printf '\nPASS: CONSPACE deployment verified for main commit %s\n' "$SHA"
echo 'PM2 dump was NOT saved. Do not run pm2 save until the owner reviews every existing app and explicitly approves it.'
