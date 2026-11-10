# TEST_PLAN

Three layers. Each layer must be runnable by a judge from a clean clone with one command.

| Layer | Tool | Command | Where |
| :--- | :--- | :--- | :--- |
| Contract unit | `cargo test` | `pnpm test:contracts:unit` | `contracts/*/src/**` |
| Contract integration | `near-workspaces` sandbox | `pnpm test:contracts:int` | `contracts/tests/` |
| TS unit | vitest | `pnpm test` | `packages/sdk`, `bridge`, `agent`, `web` |
| Testnet e2e | scripts | `pnpm demo:all` then `./scripts/verify.sh` | `scripts/` |
| Simulation e2e | bridge simulator + agent + testnet | `./scripts/simulate.sh washer` (any of the 12 `asset_type`s, PROFILES.md) | `scripts/`, `scenarios/` |

## 1. Sandbox setup

- Deploy `commons`, 2–3 `asset` instances, and a **real Sputnik DAO v2 WASM** if obtainable (download the released `sputnikdao2.wasm` from the sputnik-dao-contract repo or fetch the code from testnet via RPC `view_code`). If not obtainable, a `mock_dao` contract implementing `add_proposal`, `get_proposal`, `get_policy`, and `act_proposal` with identical JSON shapes. Log which one in DECISIONS. Testnet e2e always uses the real DAO.

## 2. Invariant tests (must exist, names fixed)

| Test | Proves |
| :--- | :--- |
| `inv_custody_float_cap_sweeps_excess` | float never exceeds cap after inflows; excess reaches DAO |
| `inv_custody_deposits_never_swept` | sweeps, rewards, bonds never touch deposits_held |
| `inv_no_retroactive_revocation` | no method (DAO, council, commons, asset) can delete/downgrade an Active right; profile/kind changes leave issued cards intact |
| `inv_no_self_verification_task` | claimer, agent, bridge cannot approve; verifier ≠ council approver |
| `inv_no_self_verification_training` | trainer/trainee cannot approve |
| `inv_exactly_once_reward_retry` | approve → mint fails → retry → succeeds once; second retry no-op; commons idempotency returns same ids |
| `inv_failed_refund_keeps_claim` | refund transfer failure (to deleted account) → op Failed, deposit liability restored, retry works |
| `inv_no_double_booking_concurrent` | two reserves for overlapping slots in the same block: one wins; loser refunded |
| `inv_slots_released_on_rejection` | authorization failure releases slots |
| `inv_agent_bounded_rule_not_due` | E_RULE_NOT_DUE |
| `inv_agent_bounded_quota` | E_QUOTA_EXCEEDED |
| `inv_agent_revoked` | after set_operators(None) → E_NOT_AGENT |
| `inv_ledger_balance_covers_obligations` | after every scenario step, `get_ledger().invariant_ok == true` |
| `inv_rights_group_scope` | right from group A rejected on asset in group B |
| `inv_non_transferable` | nft_transfer / nft_transfer_call / nft_approve panic |
| `inv_credential_required` | reservation on laser without credential → Rejected + refund |
| `inv_restock_expense_capped_and_not_from_deposits` | `submit_task` with `expense > reimbursable_max` → `E_EXPENSE_CAP`; `expense > 0` on a non-Restock/Repair rule → `E_NOT_REIMBURSABLE`; expense without `receipt_hash` rejected; an accepted expense is reserved from `float_free` only (above `council_threshold_cash` or when the float is short → council approval; above `auto_reward_cash_cap` → `NeedsEscalation`, paid only via `escalate(kind="reimbursement")`); with `float_free` short and deposits held, `deposits_held` is unchanged before and after the Reimbursement op; the Reimbursement op is created once even with `retry_reward` / `retry_op` |
| `inv_out_of_service_blocks_access_and_refunds` | after `set_out_of_service(true)`: `reserve` and `mark_session_started` → `E_OUT_OF_SERVICE`, `can_access` → `ok=false, reason="out_of_service"`; a future `Confirmed` reservation cancels with full fee + deposit refund and right release; only a council call or a Rewarded Repair task restores service (a steward `out=false` → access error; a Rewarded non-Repair task leaves it out of service); each period is recorded in `get_service_log` with `ended_by` |
| `inv_fault_report_requires_recent_session` | `report_fault` from an account without a session in the last 14 days → `E_NO_RECENT_SESSION` (also after 14 days pass); a second active report by the same account for the same rule → `E_ALREADY_REPORTED`; agent and bridge cannot report; a Report rule becomes due only at `min_reports` distinct reporters; reports clear when the rule's task is Rewarded |
| `inv_schedule_rule_due_only_after_interval` | a Schedule rule opened before `every_hours` since the last reward (or since `new` for the first time) → `E_RULE_NOT_DUE` for the agent; due after the interval (sandbox fast-forward); the baseline resets to the reward time; the agent can never pass `manual=true`, and a council `manual=true` task is recorded as manual |

## 3. Method matrix

For every public method in CONTRACT_SPEC: happy path, each access failure, each state failure, each amount failure. Generate a checklist file `contracts/tests/COVERAGE.md` mapping method → test names; CI fails if a method has no test (simple script).

## 4. TS tests

- `sdk`: view wrappers (mock RPC), event decoding with real log samples from testnet.
- `bridge`: NEP-413 verification with fixed test vectors (valid, wrong recipient, reused nonce, expired, key not on account); each adapter against a fake HTTP server; session lifecycle; cycle detection for smart plug from recorded power traces.
- `agent`: rule evaluation, idempotency, LLM output validation (numbers must match facts).
- `web`: smoke render of each route with mocked sdk; formatter tests for yocto → NEAR.

## 5. Testnet e2e (`scripts/demo/`)

One script per judge-flow step (DEMO_SCRIPT §2), each:
1. Prints what it does in one line.
2. Executes, waits for finality.
3. Asserts expected state via views (and expected failure code for negative steps).
4. Appends `{step, title, txHashes, explorerLinks, assertions, timestamp}` to `evidence/steps.json` and regenerates `evidence/EVIDENCE.md`.

`pnpm demo:all` runs steps 1–21 in order (step 21 is `verify.sh`, DEMO_SCRIPT §2) (device steps run through the bridge against the device emulators or the simulator; no hardware, D-022).

## 6. `scripts/verify.sh` (read-only, no keys)

Checks, each printing ✅/❌ with the evidence:
1. Every account in `deployments/testnet.json` with `keyless: true` has an empty access key list.
2. All asset accounts share the same `code_hash`; it matches `sha256` of `contracts/target/near/asset.wasm` built reproducibly (if reproducible build not available, print the hash and say so).
3. Same for commons.
4. Each asset's `get_wiring().dao_id` is a Sputnik DAO created by the factory (check `sputnikv2.testnet` `get_dao_list` contains it).
5. Each asset's `get_ledger().invariant_ok` and `float_free <= float_cap`.
6. Sum of `total_swept` per asset equals the sum of sweep transfers seen in evidence (best effort; warn if explorer unavailable).
7. Every right card's source task exists and is `Rewarded`; every Rewarded task's `minted_right_ids` exist in commons with the right owner (no orphan, no duplicate).
8. Every escalation with a proposal id resolves via `get_proposal`.
9. No `Reimbursement` op on any asset has an `amount` above its task's rule `reimbursable_max` (rule read from `get_profile`; task via `ref_id`), and every Reimbursement op belongs to a Restock or Repair task with a `receipt_hash`.
10. Every closed out-of-service period in `get_service_log` has `ended_by` = `RepairRewarded{task_id}` where that task is a `Rewarded` task of kind `Repair`, or `Council{account}` where the account held the council role (or the call came from the DAO). A period still open is printed as "open since <time>" (not a failure) and matches `get_service_status().in_service == false`.
11. `evidence/steps.json` has 21 steps with tx hashes.

Exit code non-zero on any ❌.

## 7. CI

GitHub Actions: build contracts, run unit + sandbox tests, TS tests, lint. (Testnet e2e is manual; evidence committed.)
