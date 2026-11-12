#!/usr/bin/env bash
# Stage one approved integration commit without touching the live site or PM2.
set -euo pipefail
umask 022

REPO=/var/www/conspace
RELEASES=/var/www/conspace-releases
BRANCH=main
SHA="${1:-}"

if (( EUID != 0 )); then echo 'FAIL: Run as root for the existing deployment layout.' >&2; exit 1; fi
if [[ ! "$SHA" =~ ^[a-f0-9]{40}$ ]]; then
  echo 'Usage: bash ops/scripts/stage.sh <approved-40-character-SHA>' >&2
  exit 2
fi
[[ "$(node -v)" == 'v22.23.2' ]] || { echo 'FAIL: Expected Node v22.23.2.' >&2; exit 1; }
test -d "$REPO/.git" || { echo "FAIL: Missing $REPO/.git" >&2; exit 1; }
test -f "$REPO/backend/.env" || { echo 'FAIL: Private backend/.env must be prepared on VPS.' >&2; exit 1; }
ENV_MODE="$(stat -c '%a' "$REPO/backend/.env")"
[[ "$ENV_MODE" == '600' || "$ENV_MODE" == '400' ]] || { echo 'FAIL: Set backend/.env to mode 600 (or 400) before staging.' >&2; exit 1; }
if git -C "$REPO" ls-files --error-unmatch backend/.env >/dev/null 2>&1; then
  echo 'FAIL: backend/.env is tracked by Git.' >&2; exit 1
fi

# Fetch only approved integration ref. Never checkout worker branches on VPS.
git -C "$REPO" fetch --no-tags origin "refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
HEAD_SHA="$(git -C "$REPO" rev-parse "refs/remotes/origin/$BRANCH")"
[[ "$SHA" == "$HEAD_SHA" ]] || { echo "FAIL: SHA must match approved $BRANCH HEAD ($HEAD_SHA)." >&2; exit 1; }
for lock in backend/package-lock.json frontend/package-lock.json; do
  git -C "$REPO" cat-file -e "$SHA:$lock" || {
    echo "FAIL: $lock missing in integrated commit. Require reviewed lockfiles before production." >&2; exit 1;
  }
done

RELEASE="$RELEASES/$SHA"
if [[ -e "$RELEASE" ]]; then
  if [[ "$(cat "$RELEASE/.conspace-staged" 2>/dev/null || true)" == "$SHA" && -f "$RELEASE/frontend/dist/index.html" ]]; then
    echo "PASS: Release already staged and built: $RELEASE"
    exit 0
  fi
  echo "FAIL: Incomplete/existing release directory: $RELEASE. Inspect manually; no deletion performed." >&2
  exit 1
fi

mkdir -p "$RELEASES"
git -C "$REPO" worktree add --detach "$RELEASE" "$SHA"
# Never install before checking lockfiles, and do not run package lifecycle scripts.
npm ci --prefix "$RELEASE/backend" --ignore-scripts --no-audit --no-fund
npm ci --prefix "$RELEASE/frontend" --ignore-scripts --no-audit --no-fund
npm run check --prefix "$RELEASE/backend"
npm run test --prefix "$RELEASE/backend"
if node -e 'const p=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); process.exit(p.scripts && p.scripts.test ? 0 : 1)' "$RELEASE/frontend/package.json"; then
  npm test --prefix "$RELEASE/frontend"
else
  echo 'SKIP: frontend package has no test script; production build remains required.'
fi
npm run build --prefix "$RELEASE/frontend"
test -s "$RELEASE/frontend/dist/index.html"
ln -s "$REPO/backend/.env" "$RELEASE/backend/.env"
printf '%s\n' "$SHA" > "$RELEASE/.conspace-staged"
echo "PASS: Staged, tested and built $SHA. No active site, Nginx or PM2 processes changed."
