# VIDEO_SHOTLIST — final hosted demo

The final recording follows `scripts/video/story.mjs` and `scripts/video/tour.mjs` (D-038, D-039). This supersedes the earlier camera/plug/pilot shot plan. It records https://commonkit.cayvox.com, reads live NEAR testnet views, and shows historical testnet transactions from `evidence/steps.json`. Devices keep their SIMULATED labels. The recorder signs no wallet transactions.

## Sequence

1. Landing hero → Open the app (no wallet).
2. Four machines in two communities → printer account.
3. Pick a booking slot → exact fee and deposit → the recorded `reservation_confirmed` transaction.
4. Upkeep rule → agent-opened task → member evidence and independent approval.
5. Two earned usage-right cards → a real rejected transfer (`E_NON_TRANSFERABLE`).
6. Capped operating float → DAO treasury sweep → the machine's own purchase proposal.
7. Proof page re-reading testnet → script verification → real site and repository on the end card.

English narration is generated locally with Kokoro-82M; captions are burned into the video. No mock app data, camera clips, or staged wallet signing are used.

## Rebuild

Narration preparation is documented in `scripts/video/voice.py`; its input is `voiceLines()` from `scripts/video/story.mjs`. Model files and WAV intermediates remain gitignored. Regenerate narration after changing spoken lines. The build refuses outdated narration and a failed site build.

```bash
VIDEO_BASE_URL=https://commonkit.cayvox.com pnpm video:build --skip-site
```

For local recording, omit `VIDEO_BASE_URL`. `VIDEO_HOST` is optional; leave it unset to show the actual local host. If the recording host caches an old NXDOMAIN, `VIDEO_DNS_ADDRESS` can use an address independently verified from public DNS; TLS validation remains enabled.

## Deliverables

| File | Purpose |
| :--- | :--- |
| `video/out/commonkit-demo-1080p.mp4` | 1920 × 1080 master, 30 fps, H.264 + AAC |
| `video/out/commonkit-demo-x-1280x720.mp4` | X upload, 1280 × 720, 30 fps, H.264 + AAC |
| `video/commonkit-demo.mp4` | Committed copy of the master, also served at `/demo/commonkit-demo.mp4` |
| `video/commonkit-demo.en.srt` | Committed English captions; site build also emits a WebVTT track |
| `video/out/commonkit-demo-contact-sheet.png` | Visual QA, one frame per caption plus the end card |

The assembly enforces the advertised 90-second ceiling. The owner attaches the 720p file natively to their X post; the form requires that public post URL, not the video-file URL. The website player is https://commonkit.cayvox.com/demo/.
