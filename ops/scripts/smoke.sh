#!/usr/bin/env bash
# Read-only external smoke: TLS, redirects, Nginx edge, API DB readiness, Vite assets.
set -euo pipefail
check_json() {
  local required="$1"
  node -e '
    let body = "";
    process.stdin.on("data", chunk => body += chunk);
    process.stdin.on("end", () => {
      let data;
      try { data = JSON.parse(body); } catch { process.exit(1); }
      if (data.ok !== true || data.service !== process.argv[1]) process.exit(1);
      if (process.argv[2] === "ready" && data.checks?.database !== "up") process.exit(1);
    });
  ' "$required" "${2:-}"
}
for HOST in conspace.vn www.conspace.vn; do
  echo "=== $HOST ==="
  REDIRECT="$(curl --noproxy '*' --silent --show-error --max-time 15 -o /dev/null -w '%{http_code}|%{redirect_url}' "http://$HOST/")"
  case "$REDIRECT" in
    301\|https://*|302\|https://*|307\|https://*|308\|https://*) echo "HTTP->HTTPS: $REDIRECT" ;;
    *) echo "FAIL: Unexpected redirect: $REDIRECT" >&2; exit 1 ;;
  esac
  curl --noproxy '*' --fail --silent --show-error --max-time 15 "https://$HOST/__infra/health" | check_json conspace-edge
  curl --noproxy '*' --fail --silent --show-error --max-time 15 "https://$HOST/api/health" | check_json conspace-api
  curl --noproxy '*' --fail --silent --show-error --max-time 15 "https://$HOST/api/ready" | check_json conspace-api ready
  HTML="$(curl --noproxy '*' --fail --silent --show-error --max-time 15 "https://$HOST/")"
  ASSET="$(printf '%s' "$HTML" | grep -oE '/assets/[^" ]+\.(js|css)' | head -n 1 || true)"
  [[ -n "$ASSET" ]] || { echo "FAIL: No Vite asset link in $HOST HTML." >&2; exit 1; }
  curl --noproxy '*' --fail --silent --show-error --max-time 15 --head "https://$HOST$ASSET" >/dev/null
  echo "PASS: TLS, edge, API live+ready, frontend and asset: $HOST"
done
echo 'PASS: Gate 1 smoke for both hostnames.'
