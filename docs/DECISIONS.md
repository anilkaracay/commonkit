# DECISIONS (ADR log)

Append-only. Format: `## D-<nnn> — <title>` · Date · Status (accepted / superseded by D-xxx) · Context · Decision · Consequences.

---

## D-001 — Social Money is the primary track; target 1st place
2026-11-09 · accepted
Context: Official Social track asks for shared budgets, programmable rewards, collective ownership, reputation-based access on Sputnik DAO/Trezu. Competing entries focus on cash bounties, budgets and peer points; none control physical assets.
Decision: Primary `social`. Add `nfts` only if cards are verified in wallets; add `agents` only if an earn/spend loop is verified end to end.
Consequences: Narrative centers on "the asset is an economic actor"; tier approvals are secondary.

## D-002 — Two contracts: per-asset `asset`, per-community `commons`
2026-11-09 · accepted
Context: Rights are shared across asset groups and credentials are community-wide; money and device rules are per asset.
Decision: `asset` holds money/rules per asset (same WASM everywhere); `commons` holds roles, credentials and usage-right cards.
Consequences: Cross-contract calls for authorization and minting; roles pushed from commons to assets to keep checks synchronous.

## D-003 — Custody stays in the Sputnik DAO; assets keep a capped float
2026-11-09 · accepted
Context: Track prompt expects custody and approvals in the existing treasury.
Decision: Asset accounts hold deposits (liability), reserved rewards, a free float ≤ `float_cap`, storage reserve. Excess is swept to the DAO; above-cap payments are Sputnik proposals created by the asset.
Consequences: Need research C8 (contract as proposer); fallback defined.

## D-004 — Rewards are mostly usage rights, not cash
2026-11-09 · accepted
Decision: Rights are NEP-171 non-transferable cards in `commons`; cash rewards optional and capped.
Consequences: Little money sits in asset accounts; quota protects capacity.

## D-005 — No retroactive revocation; credentials can be suspended forward-only
2026-11-09 · accepted
Decision: No method removes or downgrades a granted right. DAO may suspend a credential (safety) with a recorded reason; it does not affect issued usage rights.

## D-006 — Testnet NEAR, no NEP-141 token
2026-11-09 · accepted
Decision: Native testnet NEAR for fees, deposits, rewards. Fewer moving parts.

## D-007 — No Trezu integration in v1
2026-11-09 · accepted (pending research D)
Decision: Use unmodified Sputnik; README explains compatibility and why no end-to-end Trezu claim.

## D-008 — Immutable contracts in v1
2026-11-09 · accepted
Decision: No upgrade method. Bug fix = redeploy new account + DAO re-registration. Keeps the "keyless, no one can change the rules except via new deployment approved by the DAO" story simple.

## D-009 — Bridge is trusted; telemetry alone never pays
2026-11-09 · accepted
Decision: Telemetry only opens tasks; rewards need an independent human verifier; DAO can revoke operators.

## D-010 — Agent decisions are deterministic; LLM only rephrases
2026-11-09 · accepted
Decision: Rule engine decides; optional NEAR AI Cloud LLM rephrases rationale with numeric validation; template fallback.

---

<!-- Claude Code: append new decisions below this line -->

## D-011 — Decision-number ranges per workstream
2026-11-09 · accepted
Context: Several agents append to this file in parallel.
Decision: Lead uses D-011–D-099, researcher D-1nn, asset contract D-2nn, commons contract D-3nn, bridge D-4nn, web D-5nn, agent D-6nn, chain-ops D-7nn. Numbers are IDs, not a timeline.

## D-012 — Testnet root account `commonkit-sxflo.testnet`
2026-11-09 · accepted
Context: Human chose a fresh root account (research B8: sub-accounts can only be created by their parent).
Decision: Root `commonkit-sxflo.testnet` (created via faucet, 10 NEAR). Community/contract accounts are its sub-accounts; DAOs live under the Sputnik factory. Key stays in the local NEAR CLI legacy keychain.
Consequences: More testnet NEAR is needed than one faucet drop (DAO creation, floats, deposits); chain-ops reports the exact amount.

## D-013 — No hardware yet: simulator first
2026-11-09 · accepted
Context: Human has no 3D printer or smart plug confirmed yet (E10).
Decision: Build and demo every flow on the simulator adapter; moonraker/octoprint/smart_plug adapters are built and tested against fake devices so hardware is plug-and-play once known. Scenario status stays "simulation" until real hardware runs; README must not claim otherwise.

## D-014 — Private GitHub repo, regular pushes authorized
2026-11-09 · accepted
Context: HACKATHON.md requires the human's confirmation to push.
Decision: Human confirmed: private repo `anilkaracay/commonkit`, regular non-force pushes. Making it public, force-pushing, posting and submitting remain hard stops.

## D-015 — AI-tool files are not committed
2026-11-09 · accepted
Context: The owner's standing rule: no AI attribution in commits/PRs and no AI-tool files (CLAUDE.md, .claude/) added to repositories.
Decision: CLAUDE.md and .claude/ are gitignored; commit messages carry no AI trailers. AI usage is disclosed in the README "Built with" section as HACKATHON.md Q-005 asks.

## D-016 — Node 24 locally, Node 22 in CI
2026-11-09 · accepted
Decision: engines `>=22`; CI pins Node 22 (spec); local machine runs Node 24.21.0. pnpm 12.16.1, Docker 29.8.1 available for reproducible cargo-near builds.

## D-301 — commons↔asset interface details (`commonkit_types::commons_iface`)
2026-11-09 · accepted
Context: Spec §5 lists commons methods but not all arguments the asset needs; §7 requires `slots <= card.max_slots` for a right, which only commons can check synchronously.
Decision: `authorize_reservation` takes an extra `slots: u32` and returns `AuthResult { ok, reason, credential_token_id, locked_right_id }`; a deactivated asset gets `ok=false` (not a panic). `mint_rights` derives the group from the registry (no `group` arg) and accepts `1..=10` cards per call. `release_right`/`finalize_right` return `bool` and are retry-safe (no-op when already in the target state). Shared NEP-297 helper `emit_event` uses `data: [<object>]`.
Consequences: Asset builds calls from the `*Args` structs; gas constants `GAS_AUTHORIZE/GAS_MINT/...` live next to them until measured.

## D-302 — Role pushes carry the full role snapshot
2026-11-09 · accepted
Context: Asset `sync_roles` ignores `version <= roles_version`. With per-account incremental pushes, a failed or reordered push would be silently skipped by a later version, leaving the asset with stale roles.
Decision: Every push (`register_asset`, `set_roles`, `resync_roles`) sends the full snapshot of all accounts that ever held a role; removed accounts stay as tombstones with `[]`. Total role accounts are capped (`MAX_ROLE_ACCOUNTS = 100`).
Consequences: Latest version always fully determines asset roles; payload grows with the community, bounded by the cap.

## D-101 — Asset contract opens Sputnik proposals itself (C8 proven); no fallback
2026-11-09 · accepted
Context: RESEARCH C8. On testnet a contract (`ck-r-1nkreg-b.testnet`) called `ck-r-1nkreg.sputnikv2.testnet.add_proposal` with 1 NEAR bond from its own balance (tx `4H1F9AVhVfzwHrSJriuoMVCB8tRKBycSW1CGGre1C6ke`); the callback received the u64 id; `proposer` is the contract; approval paid the receiver and returned the bond to the contract (tx `6Jc9MfR2YK9AiJKi1twW9zUGTGMbP4keNWnELPw2t9Mu`). Default policy role `all` (Everyone) has `*:AddProposal`, so no extra `assets` role is needed.
Decision: Keep CONTRACT_SPEC §3.5 as designed (asset calls `add_proposal` directly). The "Fallback if C8 fails" (`link_escalation`) is not implemented.
Consequences: Bond must equal `proposal_bond` exactly (cached by `refresh_dao_policy`, which must also cache `proposal_period`).

## D-102 — Escalation sync handles lazy expiry, deleted (Removed) proposals and returned bonds
2026-11-09 · accepted
Context: Sputnik source (`proposals.rs`, `policy.rs`): status `Expired` is only stored after `act_proposal(id,"Finalize")` (council-only permission); before that an expired proposal still reads `InProgress`. A `Removed` proposal is deleted, so `get_proposal` panics `ERR_NO_PROPOSAL`. The bond comes back to the proposer as a plain transfer receipt (no method call) on Approved, Rejected and Expired-finalized; it is lost on Removed.
Decision (CONTRACT_SPEC §2.6, §3.5 changes):
1. `refresh_dao_policy` caches `proposal_bond` **and** `proposal_period`.
2. `on_escalation_synced`: `InProgress` with `submission_time + proposal_period < block_timestamp` → `Expired`; a failed `get_proposal` promise on a `Submitted` escalation whose id exists → `Rejected` (record `bond_lost = true`); `Moved` → `Failed`.
3. Add ledger bucket `bonds_outstanding` (bond leaves `float_free` into it when sent). When sync first reaches `Approved`/`Rejected`/`Expired`, move `bond_paid` from `bonds_outstanding` back to `float_free` exactly once (flag `bond_settled`); on `Removed` drop it from `bonds_outstanding` (it was spent). `invariant_ok` stays `balance >= obligations`; Sputnik writes `Approved`/`Rejected` and creates the bond-refund receipt in the same receipt, so a sync can at most see a 1–2 block window where the refund is still in flight (documented, not a bug).
4. Note for the demo: Expired bonds only return after a council `Finalize`; scripts should call it.
Consequences: Exactly-once bond accounting; no silent untracked balance.

## D-103 — Council vote threshold for 2-of-3 is `[1,2]`
2026-11-09 · accepted
Context: `WeightOrRatio::Ratio(n,d).to_weight(total) = min(total*n/d + 1, total)`. For 3 members `[2,3]` → 3 votes, `[1,2]` → 2 votes.
Decision: Use the factory default policy (`policy: [council...]`) unchanged; its `[1,2]` gives 2-of-3. DAO_INTEGRATION §2 "2/3 threshold" means 2-of-3 → keep `[1,2]`.
Consequences: Single-member throwaway DAOs approve with one vote; execution happens inside that vote tx (vote tx needs 300 Tgas).

## D-104 — Never use `signer_account_id` for DAO-originated calls
2026-11-09 · accepted
Context: C9 testnet tx `5gBzMAGQHmA41TUr3g43PKARdY5YEuvPaRwMsGjQu5ZG`: when a FunctionCall proposal executes, `predecessor == DAO` but `signer == the council member who cast the final vote`.
Decision: DAO access checks use only `predecessor_account_id() == dao_id`. Multi-action FunctionCall proposals are allowed (they run in one atomic receipt).

## D-303 — commons surface details beyond the spec
2026-11-09 · accepted
Context: Implementing §4–§5 needed a few choices the spec left open.
Decision: (1) New error codes `E_INVALID_ARGS` and `E_NOT_FOUND`. (2) `unsuspend_credential` also takes a `reason` (audit trail both ways). (3) Extra views `get_wiring`, `get_asset`, `get_groups`, `get_card`; extra payable `fund_storage` event `storage_funded`. (4) `tokens_by_owner` is `LookupMap<AccountId, Vec<TokenId>>` (cards never move or burn; avoids nested collections). (5) Transfer/approval methods take no args and always panic `E_NON_TRANSFERABLE`; `nft_revoke`/`nft_revoke_all` refused too, `nft_is_approved` false. (6) Token metadata is computed at view time (title from group id / kind id, not from mutable config) so config changes never alter issued cards. (7) `register_asset` on an existing asset re-activates and may move it between groups; issued cards keep their group. (8) Ids/tokens start at 1. (9) Role pushes that do not fit in the remaining gas are not scheduled and emit `role_sync_failed {reason: insufficient_gas}`; push = 20 Tgas + 5 Tgas callback, so a DAO `set_roles` action needs about `10 + 25 × active_assets` Tgas (≤ 250 Tgas per proposal → ~9 assets per push; more → `resync_roles`).
Consequences: Spec §4, §5, §5.1, §5.2, §9, §10 updated. Gas values are start values until measured in M1c.

## D-401 — Simulator scenario format; simulated data is labelled down to the chain
2026-11-09 · accepted
Context: BRIDGE §4.5 asks for metric curves, cycle durations, failure injections and a speed multiplier, deterministic with a seed, labelled simulated.
Decision: YAML/JSON scenario validated with zod (`bridge/src/adapters/simulator/scenario.ts`, documented in `bridge/README.md`): `simulated: true` (required literal), `seed`, `speed`, per-metric `{initial, per_session, curve: linear|step, idle_per_hour}`, `session {duration_sec, jitter_pct}`, `verification {duration_sec, default}`, `failures: session_error | verification_fail | offline`. Simulator state (committed counters, session and run indexes, simulated epoch) persists in `bridge/state/<asset>.simulator.json`. Every simulated report also includes the metric `simulated = 1`, so on-chain telemetry and `telemetry_reported` events say it themselves. One metric slot (of 16) is spent on it. Examples for the three demo assets: `bridge/test/fixtures/scenarios/`.
Consequences: Agent rules must not use the metric name `simulated`. The web can show the label from chain data alone.

## D-402 — NEP-413: own borsh plus node:crypto ed25519, cross-checked by independent libraries
2026-11-09 · accepted
Context: BRIDGE §3.1. RESEARCH B15 results were not available yet; the implementation follows the NEP text (tag `2^31+413` as u32 LE, then borsh `{message: string, nonce: [u8;32], recipient: string, callbackUrl: Option<string>}`, sha256, ed25519 over the 32-byte hash, signature base64, key `ed25519:<base58>`).
Decision: About 30 lines of serialization in `bridge/src/nep413/payload.ts` and ed25519 verification with `node:crypto`. Tests check every committed vector against borsh-js (`borsh` 2.0.0) and noble ed25519. Vectors are generated from fixed seeds (`pnpm --filter @commonkit/bridge gen:vectors`) and a test fails if regeneration drifts. Only ed25519 keys are supported (secp256k1 → `UNSUPPORTED_KEY_TYPE`). Full-access and function-call keys are both accepted, as BRIDGE §3.1 says, and the kind is recorded on the session. The NEP says wallets sign with full-access keys, so function-call is the rare case.
Consequences: If B15 finds a wallet that deviates (for example base58 signatures), we add it as a new vector rather than relaxing the check.

## D-403 — Challenges are action-bound, in memory, consumed on first use, expire in chain time
2026-11-09 · accepted
Decision: `/access/challenge` takes `action: access|finish|verify` (default `access`) plus `reservation_id` or `task_id`. The signed human-readable message lists action, asset, account, ids, nonce and expiry. A nonce is marked used on its first submission, even if later checks fail, so a failed attempt cannot be replayed. Expiry (300 s) is measured in chain time. Outstanding nonces live in memory only, so a restart invalidates them (fail closed). Signed requests may carry the optional `recipient` the wallet signed for, so a wrong recipient is reported as `RECIPIENT_MISMATCH` instead of only `BAD_SIGNATURE`. Every rejection emits an `access_rejected` event, which is demo evidence.

## D-404 — The chain records the session start before the device unlocks
2026-11-09 · accepted (deviates from the ARCHITECTURE §4.3 diagram, which unlocks first)
Decision: `mark_session_started` (idempotent: a view check before every attempt, never re-sent when the reservation is already `InSession`) runs first, then `unlock`. If the chain write fails, the device was never unlocked. If unlock fails, the reservation stays `InSession`; the member can retry `/access` (resumption is allowed by `can_access`), and the chain-time deadline otherwise closes the session. Device occupancy is claimed synchronously, so two concurrent requests cannot both start, and an asset runs one session or verification at a time (`DEVICE_BUSY`).
Consequences: Fail-closed device; ARCHITECTURE §4.3 should be read with this order.

## D-405 — Chain time, deadlines and retries in the bridge
2026-11-09 · accepted
Decision: `ChainClock` uses the final block's `timestamp_nanosec`, cached for at most 5 s and extrapolated with the local clock. Challenge expiry and the session deadline (`start + session_timeout_min`) use it; the local clock only schedules polls. Chain writes for one asset are serialized (keyed mutex), so `report_telemetry` and `mark_session_finished` never reach the chain out of order. Writes retry with exponential backoff. `mark_session_finished` retries on later watcher passes until it lands, again with a view check so it is sent exactly once.

## D-406 — Monotonic counters: offsets, persistence and the chain as floor
2026-11-09 · accepted
Decision: `CounterStore` (`bridge/state/<asset>.counters.json`, atomic writes) keeps the highest value per metric. If a device counter goes backwards (reset, lost simulator state), it raises a per-metric offset and emits `counter_offset_applied`. At startup it seeds the floor from `get_telemetry`. On `E_TELEMETRY_NOT_MONOTONIC` it adopts the chain's values. Adapter metrics pass a zod check (snake_case, ≤ 32 chars, ≤ 16 metrics, 0 ≤ v ≤ 2^53) before reaching the chain. Telemetry is only sent when a value changed.

## D-407 — Verification runs are asynchronous and configured per rule in the bridge
2026-11-09 · accepted
Decision: `POST /verification/:asset/:task_id/run` (NEP-413 signed by the claimer, action `verify`) checks on chain that the task is `Submitted`, the signer is the claimer, and no result exists yet. It then returns 202 with a `run_id`; progress arrives over SSE and `GET /verification/runs/:id`. The test comes from the asset's `verification_tests[rule_id]` in the bridge config; simulated assets default to `{type: simulated}`. `details_hash` = sha256 of the canonical JSON of the run details. An adapter error reports nothing on chain (the run can be retried). A reported failure is a real failed test.

## D-408 — Safety gate for dangerous devices lives in the bridge config
2026-11-09 · accepted
Decision: `safety: {dangerous, stand_in?, human_present_confirmed}` per asset. A dangerous asset on a real adapter fails config validation unless it has a labelled `stand_in` (copied into unlock events) or `human_present_confirmed: true`. An operator sets that flag only while a person is at the device, and it is never committed. Simulator assets are exempt because nothing is energized.

## D-409 — Fake-chain mode and the NEAR client
2026-11-09 · accepted
Decision: `chain: fake` runs an in-memory model of the asset contract rules (windows, states, monotonic telemetry; tx hashes `fake-tx-n`). It labels everything simulated, including HTTP log lines, and its evidence goes to `bridge/state/sim/evidence/`, never `evidence/`. `chain: near` reads through `@commonkit/sdk` `NearRpc` (final finality: `block`, `view_access_key`, `can_access`, `get_reservation`, `get_task`, `get_telemetry`). Writes go through an injected `TxSigner` (function-call key per asset, research B5), and a client without a signer refuses writes. Bridge write gas starts at 30 Tgas (100 for `mark_session_finished`) until measured.

## D-105 — Account naming: keep a key-holding community root; create sub-accounts before deleting keys
2026-11-09 · accepted (proposal for chain-ops; root account name still undecided by the human)
Context: RESEARCH B8 — only the parent can create `x.parent` (verified on testnet). A keyless account can never create sub-accounts again.
Decision: Per community, a team-held root (e.g. `makerlab-ck.testnet`, keys kept, never holds community money) creates `commons.<root>` and `printer-01.<root>`, `laser-01.<root>`, … Contracts are deployed and their keys deleted only after all sibling/child accounts exist. Do not make an asset a sub-account of the keyless commons account. Names ≤ 64 chars.
Consequences: Adding an asset later needs the root key (team) — acceptable; the asset itself is still keyless and DAO-wired.

## D-106 — Pins: near-sdk 5.30.1, near-workspaces 0.24.0, cargo-near 0.23.0, near-api-js 7.4.0, near-connect 0.12.0
2026-11-09 · accepted
Context: RESEARCH §1. All were exercised (testnet deploy + cross-contract, sandbox with real Sputnik WASM, script tx, NEP-413). Testnet protocol 88 allows 1,000 Tgas per tx; we still budget ≤ 300 Tgas per tx.
Decision: Workspace `near-sdk = "=5.30.1"`; dev-deps `near-workspaces = "0.24.0"`. Rust toolchain pin `1.98.1` recommended for `contracts/rust-toolchain.toml` (owner: contract-engineer). Release WASM built with `cargo near build reproducible-wasm` using image `sourcescan/cargo-near:0.22.0-rust-1.99.1@sha256:c9655eaf…43b5bb`; if that fails for workspace members, ship `non-reproducible-wasm` and do not claim reproducibility in README. JS: `near-api-js@7.4.0` (not `@near-js/*` 2.5.1), wallet `@hot-labs/near-connect@0.12.0`. RPC: FastNEAR testnet primary, `rpc.testnet.near.org` fallback.

## D-107 — NEAR AI Cloud: model id from `/v1/models`, template rationale is the default
2026-11-09 · accepted
Context: RESEARCH F1. API = `https://cloud-api.near.ai/v1` (OpenAI-compatible, Bearer key). The docs' example model `zai-org/GLM-5.1-FP8` is not in the live public `/v1/models` list. No API key exists in the repo (`.env.example` only), so no live completion was run.
Decision: `NEARAI_MODEL` must be a live id (suggest `z-ai/glm-5.3-flash`); agent checks `/v1/models` at start and falls back to the template rationale on any error or missing key. Never claim LLM rationale in README unless a logged completion exists.

## D-108 — Bridge NEP-413 check requires a FullAccess key of the account
2026-11-09 · accepted
Context: RESEARCH B15. `near-api-js/nep413.verifyMessage` rejects keys that are not FullAccess keys of the claimed account (`view_access_key`). Wallet `signMessage` signs with a full-access key.
Decision: Bridge verifies signature over the NEP-413 hash, `recipient == bridge id`, unused nonce, fresh timestamp in `message`, and `view_access_key(account, pk).permission == "FullAccess"`; then `can_access` on the asset.

## D-201 — Ledger invariant excludes in-flight money
2026-11-09 · accepted
Context: Spec §2.2 puts `pending_out` on the right-hand side of the invariant. NEAR debits a transfer (or a function-call deposit) from the account balance when the outgoing receipt is created, so with the spec formula every in-flight refund or sweep would make `invariant_ok` false.
Decision: `invariant_ok = balance >= storage_reserve + float_free + deposits_held + rewards_reserved + pending_in + protocol_fees_owed`. `pending_out` (already debited) and `bonds_outstanding` (money held by the DAO, D-102) are excluded. A failed transfer's refund receipt and our `on_op_result` callback can land in either order; if the callback runs first, `invariant_ok` is false for that one block (documented, not a bug).
Consequences: Tests and verify.sh check the invariant after receipts settle.

## D-202 — Extra ledger buckets `pending_in` and `protocol_fees_owed`; source bucket per op kind
2026-11-09 · accepted
Context: Money attached to a reservation awaiting authorization belonged to no bucket; a failed protocol-fee payout had no bucket that is neither sweepable nor a user liability.
Decision: `pending_in` holds attached amounts while `PendingAuthorization`; `protocol_fees_owed` holds failed protocol fees. A failed op's amount returns to: Refund → `deposits_held` (also for a failed fee refund, it is the user's money), CashReward → `rewards_reserved`, Sweep/Bond → `float_free`, ProtocolFee → `protocol_fees_owed`. `retry_op` takes it out again; a Sweep retry needs `float_free >= amount`. Bond ops are not retryable (a new escalation is the retry). Fee refunds on cancel are net of the protocol fee already paid out and require `float_free >= refund` (`E_INSUFFICIENT_FLOAT`).
Consequences: Ledger and LedgerView gain these fields plus `bonds_outstanding`, `total_bonds_returned`, `total_bonds_lost`.

## D-203 — Right release/finalize calls are OutboundOps
2026-11-09 · accepted
Context: `release_right`/`finalize_right` are cross-contract calls that can fail; a stuck `Locked` right would hurt its holder.
Decision: Two op kinds `RightRelease`/`RightFinalize` (amount 0, `to = commons`, `ref_id = reservation`), tracked Pending/Succeeded/Failed and retried by `retry_op` like transfers. `Reservation.right_op_id` points to the latest one. If `authorize_reservation` succeeded but its result is unreadable, the asset rejects, refunds and also sends `release_right` (commons treats releasing an already-Active right as a no-op, D-301).
Consequences: One retry path for every outbound effect.

## D-204 — Unaccounted balance is reconciled into the float
2026-11-09 · accepted
Context: The account receives NEAR without a method call (direct transfers, gas rewards) and `fund_float` must also top up the storage reserve (DAO_INTEGRATION §3 funds "initial float + storage reserve" in one deposit).
Decision: `reconcile()` (run by `fund_float` and every `maybe_sweep`) moves `balance − held buckets − storage_reserve − pending_out − bonds_outstanding` (if positive) into `float_free`; anything above `float_cap` is then swept to the DAO. `fund_float` reports `to_float` / `to_storage_reserve`. In-flight amounts and outstanding bonds are subtracted so a bounced transfer or returned bond is never counted twice.
Consequences: The asset never accumulates untracked money above its storage reserve.

## D-205 — Reservation policy details
2026-11-09 · accepted
Decision: (1) Cancel: only `Confirmed` and before the start slot; full fee refund iff `now + slot_length <= start`. (2) `resolve_dispute` records a `damage` only when `deduct > 0`. (3) `mark_no_show` writes a `no_show` reputation log record (no counter; §2.8 counters unchanged). (4) Damage `note_hash`, evidence and verification hashes must be 64-char hex sha256 (`E_INVALID_ARGS`). (5) `can_access` for `InSession` is ok until the reservation's last slot ends. (6) `authorize_reservation` is called with `slots` (D-301).

## D-206 — Telemetry epoch reset semantics
2026-11-09 · accepted
Decision: `set_telemetry_epoch(epoch)` (DAO, strictly increasing, else `E_INVALID_ARGS`) allows exactly the next report (from `report_telemetry` or `mark_session_finished`) to decrease counters; baselines of rules on decreased metrics restart at 0. `Telemetry` gains `epoch` and `reset_pending`.

## D-209 — Asset storage layout and extra stored fields
2026-11-09 · accepted
Decision: Reservations, tasks, escalations and ops use `LookupMap<u64, _>` with dense ids from 0 (records are never removed), so pagination is by id range — cheaper than `IterableMap`. Extra index `holder_reservations: LookupMap<AccountId, Vec<u64>>`. Extra stored fields: `Reservation.{protocol_fee, right_op_id}`, `Escalation.{bond_op_id, bond_settled, bond_lost, submission_time, dao_status, created_at}`, `OutboundOp.{created_at, updated_at}`. `sync_roles` returns `bool`, drops unknown role names and accepts at most 100 accounts (`E_INVALID_ARGS`). Unknown ids → `E_NOT_FOUND`, malformed args → `E_INVALID_ARGS` (D-303).

## D-210 — Asset side of D-102 (escalation bonds)
2026-11-09 · accepted
Decision: `add_proposal` success → Bond op Succeeded, bond moves to `bonds_outstanding`. Success with an unreadable id → escalation `Failed`, bond written off (`bond_lost`, `total_bonds_lost`). Failure → op Failed, bond back to `float_free`. `sync_escalation` is allowed while a proposal id exists and the bond is unsettled; stored `Approved`/`Rejected`/`Expired` credit the bond back to `float_free` once (`total_bonds_returned`); a failed `get_proposal` (Removed) → `Rejected`, bond lost; lazily expired `InProgress` → `Expired` with the bond still outstanding until a council `Finalize` stores `Expired`. `refresh_dao_policy` caches `proposal_bond` and `proposal_period`.

## D-211 — `#[private]` checks are covered by sandbox tests
2026-11-09 · accepted
Context: near-sdk unit tests call methods directly, bypassing the generated wasm wrapper that enforces `#[private]`.
Decision: Callback privacy is asserted in the M1c sandbox suite; unit tests exercise callback logic with mocked promise results.
