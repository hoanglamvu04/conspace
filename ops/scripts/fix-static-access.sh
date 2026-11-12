#!/usr/bin/env bash
# Correct only CONSPACE public Vite build access for Nginx.
# Never recursively chmod the repo, backend, .env or Postgres data.
set -euo pipefail

REPO=/var/www/conspace
RELEASES=/var/www/conspace-releases
LINK="$REPO/frontend/dist"
WORKER="${NGINX_WORKER:-www-data}"

die() { echo "STOP: $*" >&2; exit 1; }
(( EUID == 0 )) || die "Must run as root"
[[ -L "$LINK" ]] || die "Expected managed frontend/dist symlink (not a regular directory)"
TARGET="$(readlink -f -- "$LINK")" || die "Cannot resolve frontend/dist"
[[ -d "$TARGET" && -f "$TARGET/index.html" ]] || die "Vite dist/index.html is missing"
[[ "$TARGET" == "$RELEASES/"*"/frontend/dist" ]] || die "Unexpected dist target: $TARGET"
SHA="${TARGET#"$RELEASES/"}"
SHA="${SHA%%/*}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || die "Unexpected release directory name"
[[ "$TARGET" == "$RELEASES/$SHA/frontend/dist" ]] || die "Release target mismatch"
[[ -d "$TARGET/assets" ]] || die "Missing compiled Vite assets"
id "$WORKER" >/dev/null 2>&1 || die "Nginx worker user $WORKER missing; check /etc/nginx/nginx.conf"

# Refuse to expose files that should never be part of frontend/dist.
if find "$TARGET" \( -type l -o -name '.env' -o -name '*.pem' -o -name '*.key' \) -print -quit | grep -q .; then
  die "dist includes symlinks or secret-like files; inspect build before changing permissions"
fi

# Only traverse ancestor directories; do not grant listing/reading of private code.
for directory in "$REPO" "$REPO/frontend" "$RELEASES" "$RELEASES/$SHA" "$RELEASES/$SHA/frontend"; do
  [[ -d "$directory" ]] || die "Missing directory $directory"
  chmod o+x "$directory"
done

# Only compiled public assets get read/list permissions.
find "$TARGET" -type d -exec chmod o+rx {} +
find "$TARGET" -type f -exec chmod o+r {} +

runuser -u "$WORKER" -- test -r "$LINK/index.html" ||
  die "Nginx worker $WORKER still cannot read frontend/dist/index.html"
ASSET="$(find "$TARGET/assets" -type f -print -quit)"
[[ -n "$ASSET" ]] || die "No compiled assets"
runuser -u "$WORKER" -- test -r "$ASSET" ||
  die "Nginx worker $WORKER cannot read compiled assets"

echo "PASS: $WORKER can traverse and read CONSPACE's public React build ($SHA)."
echo "Backend .env, other apps and private release files were not chmodded."
