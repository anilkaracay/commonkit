# STATUS

Updated by Claude Code after every milestone. Newest entry on top. Only verified facts.

## HUMAN TODO (kept current by the lead; open items listed in every update)

| # | Task | When | Unblocks | State |
| :--- | :--- | :--- | :--- | :--- |
| H1 | Pick pilot item, 4–5 people, place, time | ASAP | Lane E, pilot | open |
| H2 | Order smart plug (Shelly Gen2/Gen3 or Tasmota); send model + IP when it arrives | ASAP | plug onboarding, video | open |
| H3 | Fix GitHub billing / Actions spending limit | ASAP | green CI | open |
| H4 | Send testnet NEAR to `commonkit-sxflo.testnet` (exact amount below) | ASAP | asset deploys, pilot funding | open — amount: see latest log entry |
| H5 | Test member flow once with the pilot wallet (NEP-413 sign → bridge) | before pilot | pilot | open |
| H6 | Provide project name confirmation, lead name, email, team size, mainnet payout account | before G6 | form checklist (kept out of git) | open |
| H7 | Make repo public (checklist provided) | G6 | public CI, submission | later |
| H8 | Publish X post with video (text + file provided) | G6 | demoUrl | later |
| H9 | Submit form on nearhackathon.com (filled checklist provided) | after H7+H8 | done | later |
| H10 | Approve landing hero direction (2 screenshots sent to chat) | Lane G step 3 | landing build | later |
| H11 | Log in to Vercel once (`npx vercel login`) or give a deploy token in .env (VERCEL_TOKEN) | ASAP | hosted preview (Lane C/G) | open |

## Gates

| Gate | Content | State |
| :--- | :--- | :--- |
| G1 Core live | M1c verified; 4 assets live + keyless; verify.sh green; bridge + agent on testnet; hosted app with real data | ◐ |
| G2 Proof complete | 21/21 judge steps with evidence; simulate.sh × 12; pilot kit + runbook; plug onboarded if delivered; landing §1–9 | ☐ |
| G3 Real world | pilot run; plug clips; evidence + consents (or plainly skipped) | ☐ |
| G4 Feature freeze | after G3 (or G2 if no pilot) | ☐ |
| G5 Ship-ready | landing 1–13 + quality bar; README final; video; fresh-clone audit | ☐ |
| G6 Handover | SUBMISSION_PACKAGE.md: repo-public checklist, X post, form checklist, idea | ☐ |
| G7 After "repo public" | CI green; tag `hackathon-submission` | ☐ |
| G8 After "submitted" | record time; code freeze; keep demo up to 2026-11-25; PITCH.md | ☐ |

## Milestones

| Milestone | State | Evidence |
| :--- | :--- | :--- |
| M0 Research + scaffold | ✅ (verifier pending) | docs/RESEARCH_RESULTS.md (C8 contract-as-proposer proven on testnet, D-101); `pnpm validate:profiles` 12/12 ✅ |
| M1a asset contract | ✅ (verifier: pass with fixes → fixed, D-213) | 279 unit tests (`cargo test -p commonkit-asset`), wasm sha256 24132b0a…ec8e, code_hash 3RpdWfB6MRHyL5wb5ZVFGoKWFLo3uXyDpp592Xdp9g2h |
| M1b commons contract | ✅ (verifier: pass with fixes → fixed) | 120 unit tests, code_hash J7Ve4BDdn1tsxvwwXM5cRhuf6iMbaeMqFSNzdgcxgQvn |
| M1c sandbox + invariants | ✅ tests green (lead rerun 2026-11-10), verifier review running | `pnpm test:contracts` exit 0: 34 sandbox tests incl. 20/20 inv_* against real Sputnik v2 WASM; reproducible build not achieved (D-216) |
| M2 testnet setup | ◐ 2 DAOs + 2 commons + seed done; 4 assets deploying | evidence/setup.json, evidence/seed.json |
| M3 bridge + adapters | ◐ simulator, NEP-413 (full-access only, D-019), signer wiring done; emulators + real adapters in progress | `pnpm --filter @commonkit/bridge test` |
| M4 agent | ◐ offline ✅ (68 tests); signer wiring in progress | `pnpm --filter @commonkit/agent test` |
| M5 web skeleton | ✅ on mock data, verifier pending | `pnpm --filter @commonkit/web test` 46 ✅; screenshots web/screenshots |
| M6 e2e + evidence | ☐ | |
| M7 web on testnet + hosting | ☐ | |
| M8 emulators (no hardware, D-022) | ◐ in progress | |
| M9 README + submission prep | ☐ | |

## Blockers / questions for the human

- No hardware will be bought (D-022): everything simulated via real adapters + device emulators. Pilot: not planned unless the human asks.
- GitHub Actions do not start on the private repo: "recent account payments have failed or your spending limit needs to be increased" (account billing). Public repos run free.
- Before submission the human provides: lead name, email, team size, mainnet payout account, consent; posts on X; makes the repo public.
- Testnet NEAR: root `commonkit-sxflo.testnet` has 10 NEAR; setup needs more (amount reported by chain-ops in M2).

## Log

<!-- YYYY-MM-DD HH:MM UTC — what changed, what was verified (tx hashes / test names), what is next -->

- 2026-11-10 ~05:30 UTC — M1c done and independently rerun green (`pnpm test:contracts`: 402 unit + 34 sandbox incl. 20/20 inv_*). Verifier M1a/M1b findings fixed (D-213). No-hardware decision D-022 applied across profiles/docs; X post 276/280 (D-023). sdk/web carry all §10 error codes. Running: chain-ops deploying 4 assets (keyless deletion gated on lead go), bridge emulators + adapters, agent signer wiring, verifier review of M1c tests. Next: M2 keyless + verify.sh, then M6 21 judge steps.

- 2026-11-09 ~14:30 UTC — Spec change D-017 (maintenance → upkeep: kinds × triggers, capped reimbursement, faults, out of service) applied to CONTRACT_SPEC, 12 profiles, and all docs (judge flow now 21 steps, D-801; fridge-01 asset D-018). Research done (D-101…D-108). Bridge wave 1 + D-017 done (102 tests). Web M5 on mock data done (46 tests). Lockfile committed; clean `pnpm install --frozen-lockfile` passes. Rate limit hit once (13:00–13:00 UTC reset at 16:00 TR) — agents now commit after every chunk. Running: asset contract (D-017), chain-ops M2 prep, agent M4 offline. Next: verifier on M1a+M1b, then M1c sandbox + all inv_* tests.

- 2026-11-09 ~11:45 UTC — Step 0 done. Toolchain: rustc 1.98.1 + wasm32, cargo-near 0.23.0, near-cli-rs 0.31.1, Node 24.21.0 (CI 22), pnpm 12.16.1, Docker 29.8.1. Live HACKATHON.md identical to docs/HACKATHON.md. Private repo https://github.com/anilkaracay/commonkit created and pushed. Root testnet account `commonkit-sxflo.testnet` created (faucet, 10 NEAR). Scaffold: pnpm + cargo workspaces, 8 profiles + schema + validator, packages/sdk, CI workflow (red until contracts + lockfile land). Running in parallel: research (C8 first), asset + commons contracts, bridge simulator + NEP-413, web skeleton. Next: integrate Wave 1, M1c sandbox + invariants, then M2 testnet setup.
