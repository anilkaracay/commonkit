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

# One committed video serves both the repository and the no-wallet browser player.
if [ -f video/commonkit-demo.mp4 ]; then
  mkdir -p site/demo
  cp video/commonkit-demo.mp4 site/demo/
  node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const srt = readFileSync('video/commonkit-demo.en.srt', 'utf8');
writeFileSync('site/demo/commonkit-demo.en.vtt', 'WEBVTT\n\n' + srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'));
JS
fi

echo "site/ ready: $(find site -type f | wc -l | tr -d ' ') files"
