# TASKS — build plan (target: core done in ~36 hours, polish after)

Work in parallel wherever the graph allows. Each milestone ends with: tests green, `docs/STATUS.md` updated, commit, short note to the human.

```mermaid
flowchart LR
    M0[M0 Research + scaffold] --> M1A[M1a asset contract]
    M0 --> M1B[M1b commons contract]
    M0 --> M3[M3 bridge + adapters + simulator]
    M0 --> M5[M5 web skeleton + design]
    M1A --> M1C[M1c sandbox integration + invariants]
    M1B --> M1C
    M1C --> M2[M2 testnet setup: DAOs, deploy, keyless, seed]
    M2 --> M4[M4 agent]
    M3 --> M6[M6 e2e on testnet + evidence]
    M4 --> M6
    M2 --> M6
    M5 --> M7[M7 web wired to testnet]
    M6 --> M7
    M6 --> M8[M8 emulators + simulated e2e]
    M7 --> M9[M9 README, verify.sh, video assets, submission prep]
    M8 --> M9
```

Suggested subagent assignment (see `.claude/agents/`): `researcher` (M0), `contract-engineer` (M1a, M1b, M1c), `chain-ops` (M2, M6), `bridge-engineer` (M3), `agent-engineer` (M4), `frontend-engineer` (M5, M7), `verifier` (reviews every milestone), `docs-writer` (M9).

---

## M0 — Research + scaffold (≤ 2 h)

- [ ] Complete `docs/RESEARCH_CHECKLIST.md`; write `docs/RESEARCH_RESULTS.md`; log decisions.
- [ ] ~~Ask the human for hardware facts (E10) and pilot community name~~ — resolved by D-022: no hardware, no pilot.
- [ ] Monorepo scaffold: pnpm workspaces, `contracts/` cargo workspace, `packages/sdk`, `bridge`, `agent`, `web`, `scripts`, `profiles`, `scenarios`, `deployments`, `evidence`.
- [ ] Tooling: rustfmt, clippy, eslint, prettier, vitest, GitHub Actions CI.
- [ ] `.gitignore` covers `.env*`, keys, `target/`, `node_modules/`, `bridge/state/`.
- [ ] `LICENSE` (MIT), `docs/STATUS.md`, `docs/DECISIONS.md` initialized.
- [ ] 12 profile JSONs in `profiles/` (printer_3d, laser_cutter, washer, ev_charger, cargo_bike, gpu_server, tractor, microscope, community_fridge, emergency_generator, rehearsal_room, tool_library_ladder; D-017) validated by a JSON schema shared with the contract's `validate_profile` rules.

**Accept:** CI green on an empty build; research results committed.

## M1a — asset contract (parallel with M1b)

- [ ] State, profile validation, governance methods.
- [ ] Reservations (incl. async authorize + callback), cancel, sessions, no-show, return, dispute.
- [ ] Ledger, ops, sweep, retry.
- [ ] Telemetry, rules, tasks, reward procedure, quota/period.
- [ ] Upkeep (D-017): `UpkeepRule {kind, trigger, reimbursable_max}` validation; `open_upkeep_task` with due check per trigger (Metric / Schedule / Report) and council-only `manual`; baseline reset per trigger on reward.
- [ ] Reimbursement: `submit_task` expense + receipt hash (`E_NOT_REIMBURSABLE`, `E_EXPENSE_CAP`); reserve from `float_free` only; council above `council_threshold_cash`; `NeedsEscalation` above `auto_reward_cash_cap` → `escalate(kind="reimbursement")`; Reimbursement op.
- [ ] Faults and service: `report_fault` (14-day session check, one active report per account per rule), `set_out_of_service`, full-refund cancellation, restore by Rewarded Repair or council; views `get_faults`, `get_service_status`, `get_service_log`; reputation `upkeeps`, `fault_reports`.
- [ ] Escalations (with research C8 result or fallback).
- [ ] Reputation + log.
- [ ] Events, views, error codes.
- [ ] Unit tests per method.

## M1b — commons contract

- [ ] Asset registry, groups, roles + push sync, credential kinds.
- [ ] Authorize/release/finalize rights, idempotent mint.
- [ ] Trainings and credentials.
- [ ] NEP-171/177/181 views, non-transferable guards, metadata + inline SVG media.
- [ ] Unit tests.

## M1c — sandbox integration + invariants

- [ ] Sandbox harness with real Sputnik WASM (or mock + log).
- [ ] All `inv_*` tests from TEST_PLAN §2 (incl. the four D-017 tests: `inv_restock_expense_capped_and_not_from_deposits`, `inv_out_of_service_blocks_access_and_refunds`, `inv_fault_report_requires_recent_session`, `inv_schedule_rule_due_only_after_interval`).
- [ ] Coverage map `contracts/tests/COVERAGE.md`.
- [ ] Gas measurements → constants → DECISIONS.

**Accept:** `pnpm test:contracts` green; reproducible build hashes printed.

## M2 — testnet setup (scripts, idempotent)

- [ ] `scripts/setup-testnet.ts`: root + community accounts, member accounts (team/demo-bot), bridge & agent accounts, DAOs via factory, deploy commons + 4 assets (printer-01, laser-01, washer-01, fridge-01; D-018), delete full-access keys, add function-call keys for bridge/agent per asset, write `deployments/testnet.json`.
- [ ] `scripts/seed-testnet.ts`: via DAO proposals (`proposeAndPass`): register assets, roles, credential kinds, fund storage & floats, set operators. Evidence logged.
- [ ] `scripts/verify.sh` first version (keyless, code hashes, wiring).

**Accept:** verify.sh green for wiring; DAO proposals visible with links.

## M3 — bridge + adapters + simulator (parallel from M0)

- [ ] Fastify server, config, NEP-413 challenge/verify with test vectors.
- [ ] Adapter interface + `simulator`, `smart_plug` (shelly_gen2/gen1/tasmota), `moonraker`, `octoprint`, `manual_qr`.
- [ ] Session manager, telemetry loop, verification runner, SSE events, evidence log.
- [ ] Unit tests with fake devices; recorded power traces for cycle detection.

## M4 — agent

- [ ] Loop, rule evaluation, template rationale, optional NEAR AI Cloud polish with validation.
- [ ] Upkeep: all trigger types via `get_rule_status`, `open_upkeep_task` (never `manual`), one rationale template per `UpkeepKind` (AGENT_SPEC §3).
- [ ] Escalation hints, sync, reimbursement escalation for `NeedsEscalation` tasks, limits demo script (incl. `E_RULE_NOT_DUE` on a Schedule rule).
- [ ] Tests.

## M5 — web skeleton + design (parallel from M0)

- [ ] Design direction, tokens, components (asset card, gauge, ledger bar, task row, card tile, proof row, SIMULATED badge).
- [ ] Routes with mocked sdk data.
- [ ] Upkeep UI (FRONTEND_SPEC): kind icon + label on tasks, board tasks grouped by kind, expense + receipt hash on Restock/Repair, "Report a fault" button, OUT OF SERVICE state, scenario matrix by kind with Status column.

## M6 — testnet e2e + evidence

- [ ] `scripts/demo/step-01..21.ts` per DEMO_SCRIPT; device steps run through the bridge against the emulators or the simulator (step 21 = `verify.sh`).
- [ ] Upkeep steps 18–20: printer Restock with capped reimbursement (+ `E_EXPENSE_CAP`), washer fault → out of service → refund → Repair → back in service (+ `E_NO_RECENT_SESSION`), fridge Schedule cleaning (+ `E_RULE_NOT_DUE`).
- [ ] `pnpm demo:all` green; `evidence/steps.json` + `EVIDENCE.md`.
- [ ] `scripts/simulate.sh <asset_type>` for all 12 profiles with `scenarios/<asset_type>.yaml`, labelled simulation.
- [ ] verify.sh full version green (incl. reimbursement caps and out-of-service periods, TEST_PLAN §6).

**Accept:** all 21 steps with tx hashes; verify.sh green.

## M7 — web wired to testnet + hosting

- [ ] Real data on all routes; wallet actions; bridge SSE when on LAN.
- [ ] `/proof` page mirrors verify.sh.
- [ ] Deploy (Vercel/GitHub Pages); URL in README; keep alive until at least 2026-11-25.

## M8 — emulators + simulated end-to-end (no hardware, D-022)

- [ ] Device emulators: local HTTP servers implementing the documented API subset the adapters use — Moonraker (and OctoPrint), Shelly Gen2/Gen1, Tasmota — with state machine, counters, auth and failure modes (BRIDGE_AND_ADAPTERS §4.7).
- [ ] Real adapters against the emulators: printer-01 via `moonraker` (reserve → access → print → finish → telemetry incl. `filament_used_mm`), laser-01 via `smart_plug` (switch on/off, energy, run seconds); everything labelled SIMULATED / emulated device.
- [ ] Simulated end-to-end on testnet: all four testnet assets (printer-01, laser-01, washer-01, fridge-01) through the bridge and agent; `simulate.sh` for all 12 profiles.
- [ ] Screen-only video footage per DEMO_SCRIPT §1 (no camera shots).

## M9 — README, submission prep

- [ ] README per `docs/SUBMISSION.md` (only verified claims; status column for scenarios).
- [ ] Track compliance table, Trezu paragraph, honest limits (no physical device tested; adapters tested against emulators), "Simulation and emulators" section with links.
- [ ] X post draft + submission payload draft (do **not** post/submit — hard stop).
- [ ] Final verifier pass: fresh clone → install → tests → verify.sh → simulate.sh.

## Final acceptance (all must be ✅)

- [ ] All CLAUDE.md §4 invariants have passing tests.
- [ ] `pnpm test:contracts && pnpm test` green on a clean clone.
- [ ] verify.sh green on testnet.
- [ ] 21/21 evidence steps with tx hashes.
- [ ] Four testnet assets live on the hosted web app; every one carries the SIMULATED badge.
- [ ] Emulated stack runs end to end: bridge with the real moonraker / smart_plug adapters against the device emulators, agent and contracts on testnet, from a clean clone.
- [ ] README reviewed by `verifier` agent: every claim has a link or test name.
- [ ] Submission payload and X post text ready for the human.
