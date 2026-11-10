#!/usr/bin/env bash
# One static site for hosting (D-025): landing/dist at /, web/dist at /app/.
# Output: site/ (gitignored). SPA fallback for /app/* is configured in vercel.json and
# implemented by scripts/serve-site.mjs for local previews.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf site
mkdir -p site/app

if [ -f landing/package.json ] && [ "${SKIP_LANDING:-0}" != "1" ]; then
  pnpm --filter @commonkit/landing build
  cp -R landing/dist/. site/
else
  echo "landing skipped (absent or SKIP_LANDING=1): writing a minimal redirect to /app/" >&2
  printf '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/app/"><title>COMMONKIT</title><a href="/app/">COMMONKIT app</a>\n' > site/index.html
fi

COMMONKIT_WEB_BASE=/app/ pnpm --filter @commonkit/web build
cp -R web/dist/. site/app/

echo "site/ ready: $(find site -type f | wc -l | tr -d ' ') files"
