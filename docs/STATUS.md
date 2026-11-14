# STATUS

Updated after every milestone. Newest entry on top. Only verified facts.

## Submission-day check — 2026-11-14 (Codex)

- Repository is public. GitHub CI and Pages passed on `869cdd8`; the task-opening-rule follow-up is `a71dac1`.
- Cloudflare CNAME `commonkit` → `anilkaracay.github.io` was added with DNS only, as requested by the owner. Public resolvers 1.1.1.1 and 8.8.8.8 return GitHub Pages addresses. GitHub's domain check succeeded, its TLS certificate was approved, and `https_enforced` is true. HTTPS returns 200 with normal certificate validation.
- `verify.sh`: exit 0, all 91 lines passed. TypeScript suite: 560 passed, 9 intentionally skipped; web 133 tests (117 before these fixes). Lint and typecheck passed. Site build and fake washer simulation passed; the fake simulation explicitly skips ledger/keyless/code-hash checks.
- Fixed earned-right reservations, trusted-member deposits, task claim/submit/verification/council actions, training actions, and post-transaction cache invalidation (D-043). Task details now show the rule snapshot from task creation even after a DAO profile change.
- Scope is the testnet loop with emulated/simulated devices. The owner chose to keep that scope for submission. README describes the verified scope concisely and adds an explicitly proposed first deployment and unvalidated funding model.
- The owner will fill and submit the form themselves. Do not request H6 personal data. X publication and final form submission remain with the owner.
- Final video: 81.84 seconds (file duration 81.837667), 1080p master plus 720p X export, 15 English captions and synthetic narration; recorded from the HTTPS-hosted app with persistent NEAR testnet/device-simulation disclosure. The first eight seconds explain shared access, upkeep funding and contributor usage rights on the live “Shared machines. Community rules.” hero, refreshed after the `46fb0cb` Pages deployment with contained callouts and a compact reading row. Booking starts at 8.9 seconds and its recorded confirmation appears at 14.2 seconds. The sequence then shows independent upkeep approval, earned usage-right NFTs, right-3 redeemed for a zero-usage-fee booking, its consumed state, the capped budget and DAO sweep, and proposal #10 opened by printer-01 and approved by the council. The recorder signs no wallet transactions; explorer pages show recorded testnet transactions. The AAC track decoded successfully; no listening-based audio-quality assessment is claimed. Repository copy: `video/commonkit-demo.mp4`; browser player: `/demo/`; file metadata: `video/manifest.json`.
- Fresh browser/chain QA: `ck-browser-qa-261114.testnet`, a newly created team-controlled account. Real React UI reservation `AkSeyqkgRS2CuvNcpdMDK1v4X6bkY2niNo2cSt9vPZ9X` confirmed and refreshed availability. Cleanup cancellation `azzR7G1A52N8sBQA62DAo5h3q3n2qd2aspdMgEfCtnT` refunded the full 2.25 testnet NEAR; the browser then showed Cancelled. NEP-413 valid signature accepted, modified message rejected, public-key ownership checked on chain. The temporary local signer was stopped; no third-party wallet popup/redirect or UI cancel-click is claimed. Details: `evidence/browser-wallet-qa.json`.
- Locked host rebuild matched both deployed WASM hashes (`evidence/build-check-2026-11-14.json`); cargo-near CI installer pinned to 0.23.0. Independent-review fixes also clarify operator-key location, public annotations, actual track descriptions, and verification breadth.

## HUMAN TODO (kept current by the lead; open items listed in every update)

| # | Task | When | Unblocks | State |
| :--- | :--- | :--- | :--- | :--- |
| H1 | Physical deployment | after hackathon | field validation | deferred; submitted scope uses emulated devices |
| H2 | Physical smart-plug test | after hackathon | field validation | deferred; no physical-device claim |
| H3 | GitHub Actions | — | green CI | done; public CI green on 2026-11-14 |
| H4 | Additional testnet funding | only for new chain activity | optional future runs | not needed for the current read-only demo |
| H5 | Browser and signed testnet QA | — | UX evidence | real UI reserve and signed cancellation/NEP-413 passed with local signer; third-party wallet redirect not claimed |
| H6 | Fill personal form fields | before submission | form | owner fills directly; no agent data collection |
| H7 | Make repo public | — | submission | done; API verified 2026-11-14 |
| H8 | Publish X post with video (text + file provided) | G6 | demoUrl | later |
| H9 | Submit form on nearhackathon.com (filled checklist provided) | after H7+H8 | done | later |
| H10 | Pick art direction | — | redesign | ✅ light-led blue concept chosen (D-030) |
| H11 | Custom-domain hosting | — | hosted demo | done; GitHub Pages + DNS only CNAME + HTTPS enforcement |

## Gates

| Gate | Content | State |
| :--- | :--- | :--- |
| G1 Core live | ✅ contracts, keyless, verify.sh, bridge + agent; HTTPS hosted app | evidence/verify-step21.txt; commonkit.cayvox.com |
| G2 Proof complete | ✅ 21-step evidence, live verification, simulated profiles, fresh signed browser/chain QA | evidence/ |
| G3 Real world | submission scope: emulated/simulated devices, team-controlled accounts | field validation follows submission |
| G4 Feature freeze | ✅ contracts unchanged; submission-day UI fixes verified | D-043, D-044 |
| G5 Ship-ready | ✅ local checks, README, 81.84 s video and player; final CI runs on push | video/manifest.json |
| G6 Handover | ✅ docs/SUBMISSION_PACKAGE.md, docs/PITCH.md, X video and draft; tracks ["social", "nfts"] | owner publishes X and fills/submits form |
| G7 After "repo public" | CI green; tag `hackathon-submission` | ☐ |
| G8 After "submitted" | record time; code freeze; keep demo up to 2026-11-25; PITCH.md | ☐ |

## Milestones

| Milestone | State | Evidence |
| :--- | :--- | :--- |
| M0 Research + scaffold | ✅ (verifier pending) | docs/RESEARCH_RESULTS.md (C8 contract-as-proposer proven on testnet, D-101); `pnpm validate:profiles` 12/12 ✅ |
| M1a asset contract | ✅ (verifier: pass with fixes → fixed, D-213) | 279 unit tests (`cargo test -p commonkit-asset`), wasm sha256 24132b0a…ec8e, code_hash 3RpdWfB6MRHyL5wb5ZVFGoKWFLo3uXyDpp592Xdp9g2h |
| M1b commons contract | ✅ (verifier: pass with fixes → fixed) | 120 unit tests, code_hash J7Ve4BDdn1tsxvwwXM5cRhuf6iMbaeMqFSNzdgcxgQvn |
| M1c sandbox + invariants | ✅ all verifier findings fixed, no contract bug found (99545d9) | 402 unit + 36 sandbox tests incl. 20/20 inv_* (lead rerun, evidence/ci-local/test-contracts-2026-11-10.txt); storage measured (D-217: keep 7 NEAR reserve); reproducible build hashes documented, deployed host build kept (D-218) |
| M2 testnet setup | ✅ 4 assets + 2 commons live and keyless | strict `./scripts/verify.sh` exit 0, 48 ✅ (evidence/verify-2026-11-10.txt); delete-key txs in evidence/setup.json (e.g. printer-01 Bf6gbxyT…); D-709 margin repair via DAO transfers |
| M3 bridge + adapters | ✅ simulator, NEP-413 (full-access only, D-019/D-414), emulators + real adapters (D-413), device:add (D-415), signer | 202 bridge tests; used on testnet in steps 3, 8, 13 and evidence/bridge-washer-loop.json |
| M4 agent | ✅ on testnet via sdk signer | 76 agent tests; steps 7, 16, 19, 20; evidence/agent-limits.json |
| M5 web skeleton | ✅ superseded by M7 | |
| M6 e2e + evidence | ✅ 21/21 on testnet | evidence/steps.json, evidence/verify-step21.txt, evidence/agent-limits.json |
| M7 web on testnet + hosting | ✅ app under /app on testnet RPC + evidence (133 tests); site build passes; GitHub Pages with HTTPS | commonkit.cayvox.com |
| M8 emulators + simulated e2e + real-world layer (D-022/D-024) | ◐ emulators ✅, simulate.sh 12/12 ✅ (D-420); real plug waits on H2, pilot on H1 | evidence/simulate-all-2026-11-10.txt |
| M9 README + submission prep | ✅ README, 81.84 s video, browser player, X draft and final testnet QA | owner publishes X and submits form |

## Blockers / questions for the human

- Remaining delivery actions: publish the updated demo build, owner publishes X demo, owner submits the form. The project is public, CI runs, and hosting is configured.
- A real-wallet browser round trip would add UX evidence; mock-wallet tests do not prove that round trip.

## Log

<!-- YYYY-MM-DD HH:MM UTC — what changed, what was verified (tx hashes / test names), what is next -->

- 2026-11-13 ~10:30 UTC — G5 audit (fresh clone, 7.5/10 → ~8.5 once hosted) findings fixed: pnpm test TS-only (515 pass), README quick-look path, Built-with corrected, tiers "adapted", app mobile Lighthouse 53→90, landing 100/100/100/100, internal labels removed, English cast names (D-036), official NEAR mark (D-034), Trezu testnet integration (D-037: templates compiled by Trezu's engine, proposal dorm-b-ck#13 passed, local Trezu UI screenshot), tracks social+nfts (D-032), Q-015 none (D-035), rust pinned 1.98.1. Final video render running. Blockers on the human: H11 hosting (README <HOSTED_URL>, <VIDEO_URL>), H6 form data, pilot decision (cut-off 2026-11-14 06:00 UTC), NEAR mark check against the brand kit, then H7/H8/H9.

- 2026-11-13 06:10 UTC — RESUMED. Health check from scratch: frozen install, profiles 12/12, typecheck, lint, 492 TS tests, 402 contract unit tests, `./scripts/verify.sh` 0 ❌ (check 11 on-chain for all 21 steps), `simulate.sh washer` ✅, `build:site` ✅. Running: app fixes + app-only (D-031), landing cut to a professional intro, demo-video pipeline. Pilot/plug cut-off 2026-11-14 06:00 UTC (D-031).

- 2026-11-10 PAUSED by the human ("durdur; devam et deyince kaldigin yerden devam"). State at pause: new light-led blue design system (D-030, packages/design) shipped; landing rebuilt (4bf1776, Lighthouse mobile 99–100/100/100/100); app reskinned (d9e1c8f, 81 tests). Working tree clean, nothing in flight. RESUME LIST (in order): (1) app review fixes not yet started — /app/proof check 11 must mirror verify.sh (no_tx_reason passes; reproducible-build lines are info, not warnings) [honesty blocker]; clean proposal titles on the board with raw description on expand; NEAR units on asset Money totals; plain-language upkeep dial units; hide the `simulated` telemetry tile; export posters from packages/design + @layer CSS. (2) rebuild site, verifier visual + Lighthouse review of landing + app. (3) G4 freeze → G5 fresh-clone audit → G6 handover. Human-blocked: H1, H2, H3, H4 (13 NEAR), H6, H11.

- 2026-11-10 ~09:45 UTC — M6 ✅: 21/21 judge steps passed on testnet (evidence/steps.json, EVIDENCE.md; step 21 verify.sh with checks 1–11 exit 0 → evidence/verify-step21.txt; agent limits → evidence/agent-limits.json; demo overrides → evidence/demo-overrides.json). simulate.sh 12/12 on local sandbox (evidence/simulate-all-2026-11-10.txt, D-420). Root ~9.9 NEAR left; pilot funding needs 10 (H4). Next: verifier G1/G2 review, README from evidence, hosting (H11).

- 2026-11-10 ~06:30 UTC — M2 ✅ (6 contract accounts keyless; strict verify.sh 48 ✅, evidence/verify-2026-11-10.txt). Bridge washer loop on testnet (evidence/bridge-washer-loop.json). Judge steps on testnet with evidence (evidence/steps.json): 1, 2, 3, 4, 5, 6, 7, 8, 11, 12 — core steps 2/3 (reserve 3hHS1wra…, session ARRc2y3M…/597JnHej…), 4 (403, no tx by design), 6 (sweep DBTLyXkr…), 7/8 (task AbQSVeSa…, approve Gr7bwqmC…, rights right-3/right-4) passed; 21 runs last. Web on testnet under /app (62 tests), landing 13/13 sections (Lighthouse 100/100/100/100 mobile). Running: remaining judge steps, simulate.sh × 12 (sandbox mode), web review fixes. Blocked on human: H1, H2, H3, H4 (13 NEAR), H10, H11.

- 2026-11-10 ~05:30 UTC — M1c done and independently rerun green (`pnpm test:contracts`: 402 unit + 34 sandbox incl. 20/20 inv_*). Verifier M1a/M1b findings fixed (D-213). No-hardware decision D-022 applied across profiles/docs; X post 276/280 (D-023). sdk/web carry all §10 error codes. Running: chain-ops deploying 4 assets (keyless deletion gated on lead go), bridge emulators + adapters, agent signer wiring, verifier review of M1c tests. Next: M2 keyless + verify.sh, then M6 21 judge steps.

- 2026-11-09 ~14:30 UTC — Spec change D-017 (maintenance → upkeep: kinds × triggers, capped reimbursement, faults, out of service) applied to CONTRACT_SPEC, 12 profiles, and all docs (judge flow now 21 steps, D-801; fridge-01 asset D-018). Research done (D-101…D-108). Bridge wave 1 + D-017 done (102 tests). Web M5 on mock data done (46 tests). Lockfile committed; clean `pnpm install --frozen-lockfile` passes. Rate limit hit once (13:00–13:00 UTC reset at 16:00 TR) — agents now commit after every chunk. Running: asset contract (D-017), chain-ops M2 prep, agent M4 offline. Next: verifier on M1a+M1b, then M1c sandbox + all inv_* tests.

- 2026-11-09 ~11:45 UTC — Step 0 done. Toolchain: rustc 1.98.1 + wasm32, cargo-near 0.23.0, near-cli-rs 0.31.1, Node 24.21.0 (CI 22), pnpm 12.16.1, Docker 29.8.1. Live HACKATHON.md identical to docs/HACKATHON.md. Private repo https://github.com/anilkaracay/commonkit created and pushed. Root testnet account `commonkit-sxflo.testnet` created (faucet, 10 NEAR). Scaffold: pnpm + cargo workspaces, 8 profiles + schema + validator, packages/sdk, CI workflow (red until contracts + lockfile land). Running in parallel: research (C8 first), asset + commons contracts, bridge simulator + NEP-413, web skeleton. Next: integrate Wave 1, M1c sandbox + invariants, then M2 testnet setup.
