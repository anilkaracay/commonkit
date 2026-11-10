# STATUS

Updated by Claude Code after every milestone. Newest entry on top. Only verified facts.

## HUMAN TODO (kept current by the lead; open items listed in every update)

| # | Task | When | Unblocks | State |
| :--- | :--- | :--- | :--- | :--- |
| H1 | Pick pilot item, 4–5 people, place, time | ASAP | Lane E, pilot | open |
| H2 | Order smart plug (Shelly Gen2/Gen3 or Tasmota); send model + IP when it arrives | ASAP | plug onboarding, video | open |
| H3 | Fix GitHub billing / Actions spending limit | ASAP | green CI | open |
| H4 | Send testnet NEAR to `commonkit-sxflo.testnet` (exact amount below) | ASAP | asset deploys, pilot funding | open — **13 NEAR** (D-028 adds 1): 21-step run ~6.3 + pilot funding 10 + pilot-item asset deploy ~8 (7.05 storage + float) = ~24.3 needed vs 18.2 on root → short ~6.1, plus ~6 buffer for retries |
| H5 | Test member flow once with the pilot wallet (NEP-413 sign → bridge) | before pilot | pilot | open |
| H6 | Provide project name confirmation, lead name, email, team size, mainnet payout account | before G6 | form checklist (kept out of git) | open |
| H7 | Make repo public (checklist provided) | G6 | public CI, submission | later |
| H8 | Publish X post with video (text + file provided) | G6 | demoUrl | later |
| H9 | Submit form on nearhackathon.com (filled checklist provided) | after H7+H8 | done | later |
| H10 | Pick one of three art directions (A/B/C renders sent to chat, D-029) | as soon as renders arrive | landing + app redesign | open |
| H11 | Log in to Vercel once (`npx vercel login`) or give a deploy token in .env (VERCEL_TOKEN) | ASAP | hosted preview (Lane C/G) | open |

## Gates

| Gate | Content | State |
| :--- | :--- | :--- |
| G1 Core live | ◐ verifier: pass — contracts, keyless, verify.sh, bridge + agent on testnet proven. **Human-blocked:** hosted app (H11) | evidence/verify-step21.txt |
| G2 Proof complete | ◐ verifier: pass with fixes (fixes in progress: check [11] on-chain, landing hero override label, minors). Lead-side done: 21/21 steps, simulate 12/12, pilot kit, landing 1–13. **Human-blocked:** plug clips (H2) | evidence/ |
| G3 Real world | pilot run; plug clips; evidence + consents (or plainly skipped) | ☐ |
| G4 Feature freeze | after G3 (or G2 if no pilot) | ☐ |
| G5 Ship-ready | landing 1–13 + quality bar; README final; video; fresh-clone audit | ☐ |
| G6 Handover | ◐ drafts ready (docs/SUBMISSION_PACKAGE.md, docs/PITCH.md; X post 279/280, idea 1508/2000, tracks ["social"]); personal fields wait on H6; final pass after G5 | cfb1245 |
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
| M7 web on testnet + hosting | ◐ app under /app on testnet RPC + evidence (71 tests), landing at / (31 tests), `pnpm build:site` ✅; hosting waits on H11 | web/screenshots, landing/screenshots |
| M8 emulators + simulated e2e + real-world layer (D-022/D-024) | ◐ emulators ✅, simulate.sh 12/12 ✅ (D-420); real plug waits on H2, pilot on H1 | evidence/simulate-all-2026-11-10.txt |
| M9 README + submission prep | ☐ | |

## Blockers / questions for the human

- All open human items are in the HUMAN TODO table at the top (H1–H11). Hardware for judges stays optional (D-022); a real plug stand-in (H2) and a real-users manual_qr pilot (H1) are planned (D-024).
- GitHub Actions do not start on the private repo (account billing, H3); CI runs locally at each gate (D-027, evidence/ci-local/).
- Testnet NEAR: root ~9.9 NEAR after the 21-step run; pilot funding (10) + pilot-item asset (~9, D-028) need H4.

## Log

<!-- YYYY-MM-DD HH:MM UTC — what changed, what was verified (tx hashes / test names), what is next -->

- 2026-11-10 ~09:45 UTC — M6 ✅: 21/21 judge steps passed on testnet (evidence/steps.json, EVIDENCE.md; step 21 verify.sh with checks 1–11 exit 0 → evidence/verify-step21.txt; agent limits → evidence/agent-limits.json; demo overrides → evidence/demo-overrides.json). simulate.sh 12/12 on local sandbox (evidence/simulate-all-2026-11-10.txt, D-420). Root ~9.9 NEAR left; pilot funding needs 10 (H4). Next: verifier G1/G2 review, README from evidence, hosting (H11).

- 2026-11-10 ~06:30 UTC — M2 ✅ (6 contract accounts keyless; strict verify.sh 48 ✅, evidence/verify-2026-11-10.txt). Bridge washer loop on testnet (evidence/bridge-washer-loop.json). Judge steps on testnet with evidence (evidence/steps.json): 1, 2, 3, 4, 5, 6, 7, 8, 11, 12 — core steps 2/3 (reserve 3hHS1wra…, session ARRc2y3M…/597JnHej…), 4 (403, no tx by design), 6 (sweep DBTLyXkr…), 7/8 (task AbQSVeSa…, approve Gr7bwqmC…, rights right-3/right-4) passed; 21 runs last. Web on testnet under /app (62 tests), landing 13/13 sections (Lighthouse 100/100/100/100 mobile). Running: remaining judge steps, simulate.sh × 12 (sandbox mode), web review fixes. Blocked on human: H1, H2, H3, H4 (13 NEAR), H10, H11.

- 2026-11-10 ~05:30 UTC — M1c done and independently rerun green (`pnpm test:contracts`: 402 unit + 34 sandbox incl. 20/20 inv_*). Verifier M1a/M1b findings fixed (D-213). No-hardware decision D-022 applied across profiles/docs; X post 276/280 (D-023). sdk/web carry all §10 error codes. Running: chain-ops deploying 4 assets (keyless deletion gated on lead go), bridge emulators + adapters, agent signer wiring, verifier review of M1c tests. Next: M2 keyless + verify.sh, then M6 21 judge steps.

- 2026-11-09 ~14:30 UTC — Spec change D-017 (maintenance → upkeep: kinds × triggers, capped reimbursement, faults, out of service) applied to CONTRACT_SPEC, 12 profiles, and all docs (judge flow now 21 steps, D-801; fridge-01 asset D-018). Research done (D-101…D-108). Bridge wave 1 + D-017 done (102 tests). Web M5 on mock data done (46 tests). Lockfile committed; clean `pnpm install --frozen-lockfile` passes. Rate limit hit once (13:00–13:00 UTC reset at 16:00 TR) — agents now commit after every chunk. Running: asset contract (D-017), chain-ops M2 prep, agent M4 offline. Next: verifier on M1a+M1b, then M1c sandbox + all inv_* tests.

- 2026-11-09 ~11:45 UTC — Step 0 done. Toolchain: rustc 1.98.1 + wasm32, cargo-near 0.23.0, near-cli-rs 0.31.1, Node 24.21.0 (CI 22), pnpm 12.16.1, Docker 29.8.1. Live HACKATHON.md identical to docs/HACKATHON.md. Private repo https://github.com/anilkaracay/commonkit created and pushed. Root testnet account `commonkit-sxflo.testnet` created (faucet, 10 NEAR). Scaffold: pnpm + cargo workspaces, 8 profiles + schema + validator, packages/sdk, CI workflow (red until contracts + lockfile land). Running in parallel: research (C8 first), asset + commons contracts, bridge simulator + NEP-413, web skeleton. Next: integrate Wave 1, M1c sandbox + invariants, then M2 testnet setup.
