#!/usr/bin/env bash
# COMMONKIT demo video (≤ 90 s, screen-only per D-022): one continuous browser walkthrough of the built site (D-038).
#
#   pnpm video:build                 full build: site → walkthrough recording → bar + captions → exports
#   pnpm video:build --assemble      only re-assemble (after a recording)
#   pnpm video:build --skip-site     record the existing site/ as it is
#
# Story and captions: scripts/video/story.mjs. Recorder: scripts/video/tour.mjs. Assembly: scripts/video/assemble.mjs.
# Outputs (gitignored): video/out/commonkit-demo-1080p.mp4 (master), video/out/commonkit-demo-x-1280x720.mp4,
# video/out/commonkit-demo-contact-sheet.png. Committed: video/commonkit-demo.en.srt.
# URL bar host: VIDEO_HOST=<domain> (default localhost:4320, the address of `pnpm serve:site`).
# End-card links: VIDEO_SITE_URL=… VIDEO_REPO_URL=… (placeholders until the human fills them in).
set -euo pipefail
cd "$(dirname "$0")/../.."

ASSEMBLE_ONLY=0 ; SKIP_SITE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --assemble) ASSEMBLE_ONLY=1; shift ;;
    --skip-site) SKIP_SITE=1; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
mkdir -p video/build video/out

if [ "$ASSEMBLE_ONLY" = 0 ]; then
  if [ "$SKIP_SITE" = 0 ]; then
    # build-site.sh empties site/ first; keep the last good build in case the landing is mid-edit.
    rm -rf video/build/site.prev && { [ -f site/index.html ] && cp -R site video/build/site.prev || true; }
    if ! pnpm build:site; then
      echo "[video] pnpm build:site failed; recording the previous site/ build" >&2
      [ -d video/build/site.prev ] && rm -rf site && mv video/build/site.prev site
    fi
    rm -rf video/build/site.prev
  fi
  node scripts/video/tour.mjs
fi

node scripts/video/assemble.mjs
