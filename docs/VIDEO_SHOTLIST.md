# VIDEO_SHOTLIST — final hosted demo

The final 81.84-second recording follows `scripts/video/story.mjs` and `scripts/video/tour.mjs` (D-038, D-039). An eight-second purpose introduction on the actual landing hero explains shared access, upkeep funding and earned usage rights before the workflow. This supersedes the earlier booking-first cut and camera/plug/pilot shot plan. It records https://commonkit.cayvox.com, reads live NEAR testnet views, and shows historical testnet transactions from `evidence/steps.json`. The browser bar persistently discloses NEAR testnet and emulated/simulated devices. The recorder signs no wallet transactions; a displayed booking selection is followed by a clearly labelled recorded transaction.

## Sequence

| Time | Picture and claim |
| :--- | :--- |
| 0.2–8.7 s | Actual landing hero: “Shared machines. Community rules.” Purpose caption: share and manage community machines; book access, fund upkeep and earn usage rights. |
| 8.9–13.9 s | Select two printer slots; show the usage fee and refundable deposit. |
| 14.2–18.4 s | Recorded step-2 `reservation_confirmed` transaction: Alex's two-slot reservation. |
| 19.5–28.7 s | Bridge access/usage explanation, upkeep rule and agent-opened task; caption distinguishes the 30-minute demo threshold from the 200-hour production threshold. |
| 28.7–33.9 s | Completed nozzle-cleaning task, passed test print and independent approval by Mark. |
| 33.9–36.8 s | Two earned, non-transferable usage-right NFTs. |
| 37.1–43.2 s | Step-9 transaction: Ava used `right-3` for reservation #2 with usage fee `0`; refundable deposit still applies. |
| 43.2–47.4 s | Highlight the consumed card, showing that care earned access and the right was consumed after the session. |
| 48.4–56.6 s | Keyless machine account, capped operating budget and fees swept back to the community's Sputnik DAO. |
| 56.6–65.4 s | Community proposal #10: nozzle-kit purchase, 4 testnet NEAR, proposer `printer-01` (opened by the machine), Approved; council approval and payment to the demo supplier. |
| 67.1–77.8 s | Live Proof page: eight keyless accounts, matching machine code hashes and balanced ledgers; read-only verifier; “COMMONKIT: care earns access.” |
| 77.8–81.8 s | Site/repository end card and testnet/device-simulation scope. |

English narration is generated locally with Kokoro-82M; 15 captions are burned into the video and supplied as SRT. The captions explicitly call the cards NFTs and describe matching machine code hashes; the narration uses the shorter phrases “usage rights” and “one machine contract.” The AAC track passed a technical decode check; narration delivery has not been assessed by listening. No mock app data, camera clips, or staged wallet signing are used. The machine account holds funds; the NFT represents earned access.

## Rebuild

Narration preparation is documented in `scripts/video/voice.py`; its input is `voiceLines()` from `scripts/video/story.mjs`. Model files and WAV intermediates remain gitignored. Regenerate narration after changing spoken lines. The build refuses outdated narration and a failed site build.

```bash
VIDEO_BASE_URL=https://commonkit.cayvox.com pnpm video:build --skip-site
```

For local recording, omit `VIDEO_BASE_URL`. `VIDEO_HOST` is optional; leave it unset to show the actual local host. If the recording host caches an old NXDOMAIN, `VIDEO_DNS_ADDRESS` can use an address independently verified from public DNS; TLS validation remains enabled.

The final intro was refreshed from the live hero after the `46fb0cb` Pages deployment with contained callouts and a compact reading row. `VIDEO_INTRO_ONLY=1 node scripts/video/tour.mjs` records just that opening into `video/build/intro.mp4` and `intro.json`; with the same narration it is exactly 260 frames (8.667 seconds), allowing the opening to be replaced without changing the evidence footage or caption timing.

## Deliverables

| File | Purpose |
| :--- | :--- |
| `video/out/commonkit-demo-1080p.mp4` | 1920 × 1080 master, 30 fps, H.264 + AAC |
| `video/out/commonkit-demo-judge-cut.mp4` | Copy of the final 81.84-second master for handoff |
| `video/out/commonkit-demo-x-1280x720.mp4` | X upload, 1280 × 720, 30 fps, H.264 + AAC |
| `video/commonkit-demo.mp4` | Committed copy of the master, also served at `/demo/commonkit-demo.mp4` |
| `video/commonkit-demo.en.srt` | Committed English captions; site build also emits a WebVTT track |
| `video/out/commonkit-demo-contact-sheet.png` | Visual QA, one frame per caption plus the end card |

The assembly enforces a 90-second ceiling; the final file is 81.837667 seconds. `video/manifest.json` records the committed master's duration, byte count and SHA-256. The owner attaches the 720p file natively to their X post; the form requires that public post URL, not the video-file URL. The website player is https://commonkit.cayvox.com/demo/.
