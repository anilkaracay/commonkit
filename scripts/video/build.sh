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
# Record the actual hosted site: VIDEO_BASE_URL=https://commonkit.cayvox.com pnpm video:build --skip-site
# If local DNS caches an old NXDOMAIN, VIDEO_DNS_ADDRESS may use the domain's verified public IP.
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
    pnpm build:site
  fi
  node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
import { voiceLines } from './scripts/video/story.mjs';
const recorded = JSON.parse(readFileSync('video/build/voice/lines.json', 'utf8'));
if (JSON.stringify(recorded) !== JSON.stringify(voiceLines())) {
  throw new Error('Narration is out of date. Regenerate voice/lines.json and run scripts/video/voice.py before recording.');
}
JS
  node scripts/video/tour.mjs
fi

node scripts/video/assemble.mjs
