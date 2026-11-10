# VIDEO_SHOTLIST — the 90-second demo video

This shot list is for the X post video (D-023). It updates the screen-only plan in `docs/DEMO_SCRIPT.md` §1 for D-024 (one real plug with a stand-in lamp, pilot clips) and D-025 (landing page at `/`, app at `/app`). The judge flow in DEMO_SCRIPT §2 is unchanged.

Rules for every shot:
- Only things with evidence at recording time. A shot without evidence is dropped, not faked or staged.
- Simulated or emulated assets keep the SIMULATED badge on screen and the caption says "simulated". The lamp is always captioned "stand-in".
- People appear only if they answered "Evet, videoda da" (`docs/PILOT.md` §4). No faces or names otherwise; no account ids of people who did not consent.
- English subtitles burned in (white, dark box, ≥ 42 px at 1080p), readable without sound.

## Sources

| Source | What | Type |
| :--- | :--- | :--- |
| Landing | hero and one section, scrolled slowly (`https://<domain>/`) | screen capture, 1080p |
| App | board, asset page, task page, proof (`https://<domain>/app`, `?demo=1`) | screen capture, 1080p |
| Bridge console | SSE / log lines with SIMULATED or `stand-in` labels | screen capture, large font |
| Explorer | tx tabs for the txs shown (from `evidence/steps.json`) | screen capture |
| Plug clip | real smart plug + desk lamp (stand-in), phone on a tripod, landscape | camera, 1080p30 |
| Pilot clips | consenting people checking out / returning the pilot item with the QR sheets | camera, 1080p30; only if the pilot happens |

## Shot list (90 s)

| Time | Shot | Source | Subtitle |
| :--- | :--- | :--- | :--- |
| 0–8 s | Landing hero; then the "why on-chain" line. | Landing | "Today a shared machine's money and rules live in one admin's spreadsheet. On COMMONKIT they live in the machine's own NEAR account." |
| 8–16 s | Reserve a slot on the printer page (SIMULATED badge visible), sign in the wallet. | App | "Reserve on NEAR. (simulated printer)" |
| 16–28 s | Lamp on the real plug. Request access without a reservation → bridge console 403 → lamp stays off. Then with a reservation → bridge switches the plug → lamp on. Session ends → lamp off. Split screen: camera left, bridge console right. | Plug clip + bridge console | "No reservation: off. Reservation on chain: on. Real smart plug; the lamp stands in for a machine." |
| 28–42 s | Rule due → agent opens the upkeep task with its rationale → a member submits → a different member approves → 2 cards appear under the worker's account. If the pilot happened: a 3 s clip of the real upkeep task (consenting member). | App (+ pilot clip) | "The machine asks for its own upkeep. Whoever does it earns the right to use it." |
| 42–47 s | Montage, four ~1 s cuts with kind chips: refill (Restock expense + receipt hash) · clean (fridge task) · check (fault → OUT OF SERVICE → Repair) · teach (training approved). | App | "Fix it, refill it, clean it, check it, teach it. (simulated)" |
| 47–57 s | Laser page: reservation without credential rejected → training approved → credential card → access OK. | App | "Risky machines need a credential. Training others earns access too. (simulated)" |
| 57–66 s | Ledger bar: float over cap → `swept` to the DAO (explorer tab). Proposal opened by the asset contract (explorer tab). | App + Explorer | "The machine keeps a small float. The rest goes back to the community's DAO." |
| 66–74 s | Pilot: two short clips of real people using the QR sheets to check out and return the item, then the pilot counter from evidence ("N reservations by M people"). Without a pilot: board with two DAOs and the shared `code_hash` strip. | Pilot clips or App | Pilot: "Real people, real item, testnet." · No pilot: "Same contract. Different commons. (simulated)" |
| 74–80 s | Explorer: a revoke / transfer attempt on a card fails. | Explorer | "No one can take back what you earned." |
| 80–90 s | `./scripts/verify.sh` output scrolling, then `https://<domain>/app` and the repo URL. | Terminal + App | "COMMONKIT — shared things that pay for their own upkeep." |

Total 90 s (8 + 8 + 12 + 14 + 5 + 10 + 9 + 8 + 6 + 10).

## Export and X upload limits

Checked 2026-11-10:
- X developer docs, "Media best practices" (https://docs.x.com/x-api/media/quickstart/best-practices), for API uploads from default accounts: up to 20 min and 8 GB; dimensions 32×32 to **1280×1024**; ≤ 60 fps; H.264 High Profile, YUV 4:2:0; AAC LC audio (HE-AAC not supported); aspect ratio between 1:3 and 3:1, 16:9 recommended.
- X Help Center pages (help.x.com, help.twitter.com) returned HTTP 403 to our fetcher, so the in-app limits could not be read from the primary source. Third-party guides (for example https://postsyncer.com/blog/how-long-can-a-twitter-video-be, https://www.captions.ai/blog-post/twitter-video-length-limit) report 140 s and 512 MB for non-Premium in-app uploads. Our video is 90 s and well under 512 MB, so it fits either way.

Export two files:
1. `commonkit-90s-1080p.mp4`: 1920×1080, 30 fps, H.264 High, YUV 4:2:0, AAC LC 128 kbps, ~8 Mbps (~90 MB). The human uploads this in the X app.
2. `commonkit-90s-720p.mp4`: 1280×720, same codecs, ~5 Mbps. Use it if the app rejects the 1080p file, and for any API upload (the API limit is 1280×1024).

The human re-checks the in-app limits on help.x.com just before posting (D-026: the human posts).

## Checklist

- [ ] Consent replies on file for everyone visible (pilot clips only).
- [ ] Plug clip shows "stand-in" in the subtitle in every frame where the lamp is visible.
- [ ] Every app shot of a simulated asset shows the SIMULATED badge.
- [ ] Every number on screen matches `evidence/` (no mock data in `?demo=1`).
- [ ] Duration ≤ 90 s; both exports play on a phone.
