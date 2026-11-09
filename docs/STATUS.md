# STATUS

Updated by Claude Code after every milestone. Newest entry on top. Only verified facts.

| Milestone | State | Evidence |
| :--- | :--- | :--- |
| M0 Research + scaffold | ◐ scaffold done, research running | `pnpm validate:profiles` 8/8 ✅; `@commonkit/sdk` 5 tests ✅ |
| M1a asset contract | ◐ in progress | |
| M1b commons contract | ◐ in progress | |
| M1c sandbox + invariants | ☐ | |
| M2 testnet setup | ☐ | |
| M3 bridge + adapters | ◐ simulator + NEP-413 in progress | |
| M4 agent | ☐ | |
| M5 web skeleton | ◐ in progress | |
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

- 2026-11-09 ~11:45 UTC — Step 0 done. Toolchain: rustc 1.98.1 + wasm32, cargo-near 0.23.0, near-cli-rs 0.31.1, Node 24.21.0 (CI 22), pnpm 12.16.1, Docker 29.8.1. Live HACKATHON.md identical to docs/HACKATHON.md. Private repo https://github.com/anilkaracay/commonkit created and pushed. Root testnet account `commonkit-sxflo.testnet` created (faucet, 10 NEAR). Scaffold: pnpm + cargo workspaces, 8 profiles + schema + validator, packages/sdk, CI workflow (red until contracts + lockfile land). Running in parallel: research (C8 first), asset + commons contracts, bridge simulator + NEP-413, web skeleton. Next: integrate Wave 1, M1c sandbox + invariants, then M2 testnet setup.
