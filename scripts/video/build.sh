#!/usr/bin/env bash
# COMMONKIT demo video (≤ 90 s, screen-only per D-022; shot list in scripts/video/shots.mjs).
#
#   pnpm video:build                      full build: site → recordings → shots → captions → exports
#   pnpm video:build --only s05-task      re-render one shot (or a comma list), then re-assemble
#   pnpm video:build --assemble           only re-assemble (after editing captions in shots.mjs)
#   pnpm video:build --rerecord           re-run ./scripts/simulate.sh printer_3d and ./scripts/verify.sh first
#   pnpm video:build --skip-site          use the existing site/ as it is
#
# Outputs (gitignored): video/out/commonkit-demo-1080p.mp4 (master), video/out/commonkit-demo-x-1280x720.mp4,
# video/out/commonkit-demo-contact-sheet.png. Committed: video/commonkit-demo.en.srt.
# Intermediate files live in video/build/ (gitignored; frames are deleted after each clip).
# End-card links: VIDEO_SITE_URL=… VIDEO_REPO_URL=… (placeholders until the human fills them in).
# Reads testnet lightly: the app is loaded once and navigated client-side; three explorer pages; verify.sh only
# with --rerecord (or when its recording is missing).
set -euo pipefail
cd "$(dirname "$0")/../.."

ONLY="" ; ASSEMBLE_ONLY=0 ; RERECORD=0 ; SKIP_SITE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="$2"; shift 2 ;;
    --assemble) ASSEMBLE_ONLY=1; shift ;;
    --rerecord) RERECORD=1; shift ;;
    --skip-site) SKIP_SITE=1; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done

wants() { [ -z "$ONLY" ] || [[ ",$ONLY," == *",$1,"* ]]; }
REC=video/build/rec
mkdir -p "$REC" video/out

if [ "$ASSEMBLE_ONLY" = 0 ]; then
  # Terminal recordings: real runs, kept between builds.
  if [ "$RERECORD" = 1 ] || [ ! -f "$REC/simulate-printer.cast" ]; then
    wants s04-unlock && node scripts/video/terminal.mjs record simulate-printer -- ./scripts/simulate.sh printer_3d
  fi
  if [ "$RERECORD" = 1 ] || [ ! -f "$REC/verify.cast" ]; then
    wants s08-verify && node scripts/video/terminal.mjs record verify -- ./scripts/verify.sh
  fi
  for s in s01-refusal s04-unlock s08-verify; do
    if wants "$s"; then node scripts/video/terminal.mjs render "$s"; fi
  done

  BROWSER_SHOTS=""
  for s in s02-problem s03-reserve s05-task s06-money s07-norevoke s09-close; do
    wants "$s" && BROWSER_SHOTS="$BROWSER_SHOTS,$s"
  done
  if [ -n "$BROWSER_SHOTS" ]; then
    if [ "$SKIP_SITE" = 0 ]; then
      # build-site.sh empties site/ first; keep the last good build in case the landing is mid-edit.
      rm -rf video/build/site.prev && { [ -f site/index.html ] && cp -R site video/build/site.prev || true; }
      if ! pnpm build:site; then
        echo "[video] pnpm build:site failed; recording the previous site/ build" >&2
        [ -d video/build/site.prev ] && rm -rf site && mv video/build/site.prev site
      fi
      rm -rf video/build/site.prev
    fi
    node scripts/video/record.mjs --only "${BROWSER_SHOTS#,}"
  fi
fi

node scripts/video/assemble.mjs
