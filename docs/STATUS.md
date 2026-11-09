# STATUS

Updated by Claude Code after every milestone. Newest entry on top. Only verified facts.

| Milestone | State | Evidence |
| :--- | :--- | :--- |
| M0 Research + scaffold | ✅ (verifier pending) | docs/RESEARCH_RESULTS.md (C8 contract-as-proposer proven on testnet, D-101); `pnpm validate:profiles` 12/12 ✅ |
| M1a asset contract | ◐ in progress (incl. D-017 upkeep) | unit tests landing in contracts/asset |
| M1b commons contract | ✅ implemented, verifier pending | 120 unit tests (`cargo test -p commonkit-commons`), wasm 337 044 B |
| M1c sandbox + invariants | ☐ | |
| M2 testnet setup | ◐ scripts in preparation | |
| M3 bridge + adapters | ◐ wave 1 ✅ (simulator, NEP-413, sessions, gauges, out-of-service); hardware adapters pending | `pnpm --filter @commonkit/bridge test` 102 ✅ |
| M4 agent | ◐ offline part in progress | |
| M5 web skeleton | ✅ on mock data, verifier pending | `pnpm --filter @commonkit/web test` 46 ✅; screenshots web/screenshots |
| M6 e2e + evidence | ☐ | |
| M7 web on testnet + hosting | ☐ | |
| M8 hardware + pilot | ☐ | |
| M9 README + submission prep | ☐ | |

## Blockers / questions for the human

- Hardware: no printer and no smart plug confirmed yet (D-013) → simulator everywhere; M8 blocked until hardware is chosen.
- Pilot community name/date, team size and names for README: not yet given.
- Testnet NEAR: root `commonkit-sxflo.testnet` has 10 NEAR; setup needs more (amount reported by chain-ops in M2).

## Log

<!-- YYYY-MM-DD HH:MM UTC — what changed, what was verified (tx hashes / test names), what is next -->

- 2026-11-09 ~14:30 UTC — Spec change D-017 (maintenance → upkeep: kinds × triggers, capped reimbursement, faults, out of service) applied to CONTRACT_SPEC, 12 profiles, and all docs (judge flow now 21 steps, D-801; fridge-01 asset D-018). Research done (D-101…D-108). Bridge wave 1 + D-017 done (102 tests). Web M5 on mock data done (46 tests). Lockfile committed; clean `pnpm install --frozen-lockfile` passes. Rate limit hit once (13:00–13:00 UTC reset at 16:00 TR) — agents now commit after every chunk. Running: asset contract (D-017), chain-ops M2 prep, agent M4 offline. Next: verifier on M1a+M1b, then M1c sandbox + all inv_* tests.

- 2026-11-09 ~11:45 UTC — Step 0 done. Toolchain: rustc 1.98.1 + wasm32, cargo-near 0.23.0, near-cli-rs 0.31.1, Node 24.21.0 (CI 22), pnpm 12.16.1, Docker 29.8.1. Live HACKATHON.md identical to docs/HACKATHON.md. Private repo https://github.com/anilkaracay/commonkit created and pushed. Root testnet account `commonkit-sxflo.testnet` created (faucet, 10 NEAR). Scaffold: pnpm + cargo workspaces, 8 profiles + schema + validator, packages/sdk, CI workflow (red until contracts + lockfile land). Running in parallel: research (C8 first), asset + commons contracts, bridge simulator + NEP-413, web skeleton. Next: integrate Wave 1, M1c sandbox + invariants, then M2 testnet setup.
