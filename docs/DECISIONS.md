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
Context: BRIDGE §3.1. Implemented from the NEP text and later confirmed by RESEARCH B15 (tag `2^31+413` as u32 LE, then borsh `{message: string, nonce: [u8;32], recipient: string, callbackUrl: Option<string>}`, sha256, ed25519 over the 32-byte hash, signature base64, key `ed25519:<base58>`).
Decision: About 30 lines of serialization in `bridge/src/nep413/payload.ts` and ed25519 verification with `node:crypto`. Tests check every committed vector against borsh-js (`borsh` 2.0.0), noble ed25519, and `near-api-js` 7.4.0 `nep413.verifyMessage` (the official reference, dev-only). Vectors are generated from fixed seeds (`pnpm --filter @commonkit/bridge gen:vectors`) and a test fails if regeneration drifts. Only ed25519 keys are supported (secp256k1 → `UNSUPPORTED_KEY_TYPE`). Full-access and function-call keys are both accepted, as BRIDGE §3.1 says, and the kind is recorded on the session. The NEP says wallets sign with full-access keys, so function-call is the rare case.
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
Decision: Reservations, tasks, escalations and ops use `LookupMap<u64, _>` with dense ids from 0 (records are never removed), so pagination is by id range — cheaper than `IterableMap`. Extra index `holder_reservations: LookupMap<AccountId, Vec<u64>>`. Extra stored fields: `Reservation.{protocol_fee, right_op_id}`, `Escalation.{bond_op_id, bond_settled, bond_lost, submission_time, dao_status}` (plus `submitted_at`, spec §2.6), `OutboundOp.{created_at, updated_at}`. `sync_roles` returns `bool`, drops unknown role names and accepts at most 100 accounts (`E_INVALID_ARGS`). Unknown ids → `E_NOT_FOUND`, malformed args → `E_INVALID_ARGS` (D-303).

## D-210 — Asset side of D-102 (escalation bonds)
2026-11-09 · accepted
Decision: `add_proposal` success → Bond op Succeeded, bond moves to `bonds_outstanding`. Success with an unreadable id → escalation `Failed`, bond written off (`bond_lost`, `total_bonds_lost`). Failure → op Failed, bond back to `float_free`. `sync_escalation` is allowed while a proposal id exists and the bond is unsettled; stored `Approved`/`Rejected`/`Expired` credit the bond back to `float_free` once (`total_bonds_returned`); a failed `get_proposal` (Removed) → `Rejected`, bond lost; lazily expired `InProgress` → `Expired` with the bond still outstanding until a council `Finalize` stores `Expired`. `refresh_dao_policy` caches `proposal_bond` and `proposal_period`.

## D-211 — `#[private]` checks are covered by sandbox tests
2026-11-09 · accepted
Context: near-sdk unit tests call methods directly, bypassing the generated wasm wrapper that enforces `#[private]`.
Decision: Callback privacy is asserted in the M1c sandbox suite; unit tests exercise callback logic with mocked promise results.

## D-017 — Generalize "maintenance" to "upkeep" (kinds × triggers, reimbursement, faults, out of service)
2026-11-09 · accepted (human product decision)
Context: Keep the hero (printer maintenance) and the same loop, but cover more real commons: "Fix it, refill it, clean it, check it, teach it — every kind of care that keeps a shared thing alive earns access to it." (The human's change request named this D-011; that number was already taken by D-011 ranges, so it is logged as D-017.)
Decision: `MaintenanceRule` → `UpkeepRule { kind: UpkeepKind, trigger: Trigger {Metric | Schedule | Report}, reimbursable_max, … }`; `open_maintenance_task` → `open_upkeep_task` (due evaluated per trigger, council `manual` bypass recorded); Restock/Repair expenses claimed at `submit_task` with a receipt hash, capped by `reimbursable_max`, paid from `float_free` only (council above `council_threshold_cash` or when float is short; above `auto_reward_cash_cap` only through `escalate(kind="reimbursement")`); `report_fault` limited to accounts with a session in the last 14 days, one active report per account per rule; `set_out_of_service` (steward/council in, council or a Rewarded Repair task out) blocks reserve/access and allows full-refund cancellation; reputation `maintenances` → `upkeeps` + `fault_reports`. New views `get_faults`, `get_service_status`, `get_service_log`. New codes `E_OUT_OF_SERVICE`, `E_NO_RECENT_SESSION`, `E_ALREADY_REPORTED`, `E_NOT_REIMBURSABLE`, `E_EXPENSE_CAP`. New op kind `Reimbursement`. New invariant tests: `inv_restock_expense_capped_and_not_from_deposits`, `inv_out_of_service_blocks_access_and_refunds`, `inv_fault_report_requires_recent_session`, `inv_schedule_rule_due_only_after_interval`.
Consequences: Profiles grow to 12 (4 new "profile example only" + simulator scenarios); judge flow grows to 21 steps; verify.sh checks reimbursement caps and that every out-of-service period ended by a Rewarded repair or a council call. Moderate extra contract work in M1a (~3–4 h incl. tests); no change to commons.

## D-410 — Gauges (temperature, fuel level) become monotonic counters in the bridge; out of service handled
2026-11-09 · accepted
Context: D-017 brings metrics such as `temperature_c` (community fridge) and `fuel_level`. These are levels that go up and down, but `report_telemetry` accepts only monotonic counters (`E_TELEMETRY_NOT_MONOTONIC`, CONTRACT_SPEC §2.4).
Decision: Adapters may expose `readGauges()` next to `readMetrics()`. A gauge is never sent to the chain raw. Per asset, the bridge config `gauges` derives counters on every telemetry tick: `samples_above` / `samples_below` a limit (× `telemetry_interval_sec` ≈ time out of range), `decrease_sum` (× `scale`, e.g. fuel used) and `increase_count` (rises ≥ `min_step`, e.g. refills). State lives in `bridge/state/<asset>.gauges.json`, and the counters then get the usual monotonic protection (D-406). Live gauge values appear in `telemetry_reported` events and `/assets`. Simulator scenarios add `type: gauge` metrics, `gauge_set` failures, and `verification.sets` (a passed check finds the gauge restored). Profiles use the derived counter names in `Metric` triggers (e.g. `temp_high_samples >= 6`, `fuel_used_dl >= 300`).
Out of service: `can_access` reason `out_of_service` and `E_OUT_OF_SERVICE` from `mark_session_started` both return 403 `OUT_OF_SERVICE`, and the device stays locked (D-404 order). Contract panics with an `E_*` code are no longer retried (they are deterministic); RPC failures still are. The NEAR client keeps `E_*` codes the sdk does not list yet.
Consequences: Profile authors pick derived counter names; for a live temperature display the web reads the bridge, not the chain.

## D-501 — Web stack and pinned versions
2026-11-09 · accepted
Context: M5 web skeleton; pnpm's `minimumReleaseAge` policy rejects packages published in the last 24 h.
Decision: Vite 8.3.5 and `@vitejs/plugin-react` 6.2.1 pinned exactly (newer releases were hours old); React 19, React Router 7 (data router, `createMemoryRouter` in tests), TanStack Query 5, Tailwind 4 (`@tailwindcss/vite`, tokens via `@theme inline` over CSS variables), vitest 5 + Testing Library + jsdom. TypeScript `~6.0` in `web/` because typescript-eslint supports `< 6.1`. Fonts self-hosted with Fontsource (Bricolage Grotesque, Instrument Sans, JetBrains Mono). The web reuses `@commonkit/sdk` for `yoctoToNear`/`nearToYocto` and `ERROR_CODES`.
Consequences: Bundle is ~515 kB (zod via the sdk); code-split in M7 if Lighthouse needs it.

## D-502 — Design direction "equipment tag"
2026-11-09 · accepted
Decision: Assets are drawn as workshop nameplates: warm paper + ink, moss for alive, safety amber for due, vermilion for faults/credentials, slate hatching for deposits (liability), blueprint blue + hatching for simulation. Upkeep dial, kasa bar (float vs cap with the above-cap zone hatched as "goes to the DAO"; deposits on the same scale as a separate liability bar), "who keeps me alive" list. Documented in `web/DESIGN.md`.

## D-503 — Web data layer behind `DataSource`; view JSON assumptions
2026-11-09 · accepted
Context: Contracts and testnet are not ready; the UI must not hard-code where data comes from.
Decision: `web/src/data/source.ts` defines `DataSource { asset(id): AssetViews; commons(id); dao(id); getDaoList; viewAccount; viewAccessKeyList; getDeployment; getProfileCatalog; getProfileMeta; getEvidenceSteps; getAgentLimits; rowTx(key); now() }`; `AssetViews`/`CommonsViews`/`DaoViews` mirror the view names and args in CONTRACT_SPEC §3.6/§5.2 one-to-one. M5 ships `createMockSource()`; M7 adds an RPC source on `@commonkit/sdk`. Assumed JSON shapes that M7 must confirm against the contracts: u128/u64 as strings, except fields the spec shows as numbers (trigger thresholds, `get_rule_status` counters, `due_value_at_open`), typed `string | number` and always read through `BigInt`; `get_availability` → `(U64 | null)[]` (holding reservation id per slot); `get_assets`/`get_all_roles` → arrays of `[key, value]`; `get_wiring` → `{dao_id, commons_id, bridge_id, agent_id, profile_version, roles_version}`; `get_ledger` adds `account_balance, storage_reserve, storage_usage, storage_byte_cost, invariant_ok`. Expected `deployments/testnet.json` shape is `Deployment` in `web/src/data/offchain.ts` (communities, assets with `simulated` + `code_hash`, members with `kind`, `keyless_accounts`, recorded wasm hashes). The scenario matrix reads `profiles/*.json` at build time (real files, not mock).
Consequences: Any shape difference is fixed in one place (the RPC source or the types), not in components.

## D-504 — Mock data is impossible to mistake for testnet
2026-11-09 · accepted
Decision: While the mock source is active a sticky amber "MOCK DATA · not from testnet" banner is shown on every route; mock tx/code hashes start with `mock`, render as `tx·mock` and never link to the explorer. Mock numbers are internally consistent (ledger sums, sweeps, rights ↔ tasks) so the proof checks pass on them and fail when an invariant is broken on purpose (tests).

## D-505 — `/proof` runs verify.sh's checks in the browser
2026-11-09 · accepted
Decision: `web/src/proof/checks.ts` implements TEST_PLAN §6 checks 1–11 in the same order and numbering (keyless, asset code hash, commons code hash, factory DAOs, ledgers incl. storage ≤ 80 % of reserve, swept totals, rights ↔ tasks, escalation proposals, reimbursement caps, out-of-service periods, 21 evidence steps). Differences forced by the browser: check 2/3 compare against the wasm hash recorded in `deployments/testnet.json` (a browser cannot rebuild) and warn when none is recorded; check 6 compares `total_swept` with the asset's own Succeeded Sweep ops (verify.sh additionally uses evidence txs). Rows are ✅/❌ marks drawn as icons with text labels.
Consequences: When verify.sh changes, `checks.ts` and its test change in the same PR.

## D-506 — Web error messages cover the spec, not only the sdk list
2026-11-09 · accepted
Decision: `web/src/lib/errors.ts` maps every `E_*` code in CONTRACT_SPEC §10 (including `E_INVALID_ARGS`, `E_NOT_FOUND` and the five D-017 codes, which `@commonkit/sdk` `ERROR_CODES` does not list yet) to one plain sentence; a test parses §10 of the spec and fails on any unmapped or extra code. Toasts show the sentence with the raw panic behind a details toggle.

## D-507 — Wallet boundary until the connector is chosen (B17)
2026-11-09 · accepted
Decision: `WalletProvider { status, accountId, connect, disconnect, signAndSendTransaction({receiverId, methodName, args, deposit: bigint}), signMessage(NEP-413) }` with an `unavailableWallet` default. Every wallet action renders read-only with the reason; attached deposits are computed from views as bigint. `/me?as=<account>` shows anyone's public cards without a wallet.

## D-801 — Judge flow is 21 steps; `verify.sh` moves to step 21
2026-11-09 · accepted (docs)
Context: D-017 adds three judge-flow steps (printer Restock with capped reimbursement, washer fault → out of service → Repair, fridge Schedule cleaning). `verify.sh` was step 18 and now also checks reimbursement caps and out-of-service periods, which those steps produce.
Decision: Steps 1–17 keep their numbers. The upkeep steps are 18 (Restock), 19 (washer fault, simulation) and 20 (fridge Schedule, simulation). `verify.sh` moves from 18 to 21 so it runs last and checks the evidence of every step. Step 20 runs on a simulated `fridge-01` with a demo interval of 1 h set by a DAO `set_profile` proposal (testnet time cannot be fast-forwarded); the 168 h interval is covered by the sandbox test `inv_schedule_rule_due_only_after_interval`. DEMO_SCRIPT, TEST_PLAN, TASKS, SUBMISSION, FRONTEND_SPEC and the README skeleton use 21.
Consequences: chain-ops needs a fourth testnet asset (`fridge-01`, community_fridge profile, simulator adapter) and a pilot/demo override for `weekly_clean`; web `TOTAL_STEPS` / `EXPECTED_STEPS` (now 18) must become 21.

## D-018 — Judge step 20 uses a fourth testnet asset `fridge-01` in dorm-b
2026-11-09 · accepted
Context: The human asked for a fridge Schedule-cleaning step (D-017); testnet time cannot be fast-forwarded, and the laser's safety check could stand in but would drop the requested scenario.
Decision: Deploy `fridge-01` (community_fridge profile, simulator adapter, labelled simulation) in the existing dorm-b community/DAO — a dorm kitchen fridge — so no third DAO is needed. A DAO `set_profile` proposal lowers `weekly_clean` to 1 h for the demo (pilot override, labelled). The full 168 h interval is proven only by the sandbox test `inv_schedule_rule_due_only_after_interval`.
Consequences: ~+6 testnet NEAR (storage reserve + float); four assets share one code_hash.

## D-019 — Bridge accepts only full-access keys for NEP-413 access requests
2026-11-09 · accepted (supersedes the function-call-key acceptance in D-402 / BRIDGE §3.1)
Context: D-108 (research): NEP-413 messages are meant to be signed with a full-access key; a function-call key handed to some dapp should not be able to open a physical device for the account.
Decision: Bridge check 4 requires the public key to be a FullAccess key on the account. Wallets sign NEP-413 with full-access keys, so members are not affected.
Consequences: Bridge test vectors and BRIDGE_AND_ADAPTERS §3.1 updated in Wave 3.

## D-207 — Reward quota counts rights promised to open tasks
2026-11-09 · accepted
Context: Spec §3.3 pre-checks `rights_minted + reward_rights <= quota` at open time only; two tasks opened before either is rewarded could together exceed the quota at mint time.
Decision: `RewardPeriod.rights_reserved` counts rights of open tasks. Open checks `rights_minted + rights_reserved + reward_rights <= quota` and reserves; mint moves the count from reserved to minted; reject/cancel releases it. A period roll resets only `rights_minted`.
Consequences: Minted rights per period never exceed the quota, even with concurrent tasks.

## D-208 — `cancel_task` for false alarms
2026-11-09 · accepted
Context: Without it, a task opened in error (sensor glitch, council manual task no longer needed) blocks its rule and keeps cash reserved forever; `TaskStatus::Cancelled` had no path.
Decision: `cancel_task(task_id, reason)` — DAO or ROLE(council), only `Open`/`Claimed`; releases reserved cash and rights, unblocks the rule, event `task_cancelled`. `Submitted` tasks go through `reject_task` (the worker's evidence deserves a verifier decision). `TaskStatus::Expired` stays reserved: timed-out claims return to `Open`.

## D-212 — Asset implementation choices for upkeep (D-017)
2026-11-09 · accepted
Decision: (1) Tasks copy `trigger`, `reimbursable_max`, `right_max_slots`, `right_validity_days`, `requires_verification_test`, `claim_timeout_hours` at open time so profile changes never alter an open task (spec §3.1). (2) Schedule baselines default to the contract's `created_at`; a Schedule rule added later by `set_profile` is due immediately if the asset is older than its interval. (3) Only a failed mint sets `RewardState::Failed`; failed CashReward/Reimbursement ops do not block `Rewarded` and are retried with `retry_op` (their amount stays in `rewards_reserved`); `reward_failed` is still emitted for them. (4) A failed `add_proposal` for a reimbursement escalation returns the task to `NeedsEscalation`. (5) `FaultReport.seq` is a global sequence used as the reputation `ref_id`; at most 32 active reports per rule. (6) While out of service any `Confirmed` reservation (even inside its start window) can be cancelled with a full fee + deposit refund, because its session can no longer start. (7) `can_access` checks service state right after the holder check. (8) `get_rule_status` exposes `current`, `baseline`, `due_value` as `U64` (Schedule baselines are ns timestamps) plus `reward_rights`, `reward_cash`, `reimbursable_max`. (9) Extra view `get_last_session_at(account)` for fault-report eligibility in the UI. (10) `set_out_of_service` and `report_fault` hashes must be 64-char hex sha256.

## D-020 — No free, deposit-free reservations (storage-drain guard)
2026-11-09 · accepted
Context: Asset review (M1a report): with price 0 and deposit 0 anyone can create reservations whose storage is paid from the asset's storage reserve.
Decision: Profiles must have `price_per_slot + deposit_trusted > 0` (checked by scripts/validate-profiles.ts now; enforced in `contracts/asset/src/profile.rs` `validate_profile` with `E_INVALID_PROFILE` since M1c). community_fridge gets a 0.1 NEAR refundable deposit.

## D-601 — Agent idempotency: read before write, E_* is final, unknown outcomes are held
2026-11-09 · accepted
Context: AGENT_SPEC §2 requires an idempotent agent; a write whose RPC times out after broadcast may still land, and `escalate(purchase)` has no on-chain duplicate guard.
Decision: Before every write the agent re-reads all state the decision depends on (rule status, profile, period, ledger, tasks, escalations, wiring). A contract panic with an `E_*` code is final (reported as `write_rejected`, never retried). A write with an unknown outcome is recorded in a local hold (`agent/state/*.memory.json`, gitignored) with its tx hash and access-key nonce; the same write is not attempted again until `AgentChain.isWriteSettled` says the transaction is final or can no longer land (a later nonce of the same key landed). The next read then decides. A failure before broadcast is not held. Local memory holds only what the chain cannot tell (holds, annotated task ids, sync throttles, last skip reason per key); chain state stays the source of truth. The agent stops all writes for an asset whose `agent_id` is not its account.
Consequences: No duplicate tasks or escalations from retries; a lost transaction delays the action by at most one settle check.

## D-602 — AgentChain interface and testnet adapter
2026-11-09 · accepted
Decision: Besides the methods named in the M4 brief, `AgentChain` has `getProfile` (rule titles for rationales, quota, cash cap), `getWiring` (agent binding, cached bond, open escalation count), `getChainTime` and `isWriteSettled`. Writes take no `manual` argument; the adapter sends exactly `{rule_id, rationale}`. `agent/src/chain/near.ts` implements every view through sdk `NearRpc` (finality final, zod decoders in `chain/schemas.ts` matching `contracts/asset/src` JSON); writes go through an injected `AgentTxSigner` (function-call key per asset, `AGENT_KEY_<ALIAS>`), wired after M2. Without a signer every write is refused. Initial gas (Tgas): open 30, annotate 10, escalate 150, sync 100, refresh 100 — to be measured on testnet.

## D-603 — Rationale wording, source marker and LLM validation
2026-11-09 · accepted
Decision: One template per `UpkeepKind` built only from `get_rule_status` + the profile rule: Metric rationales use a display table per counter (seconds → h, mm → m, dl → L; values truncated, never rounded up), Schedule says "No <kind> recorded in the last N h" until a task of the rule has been Rewarded (the first baseline is the contract's creation time), Report gives counts only. The rationale stored on chain ends with ` [rationale: template]` or ` [rationale: llm]` (AGENT_SPEC §3.2 `rationale_source`) instead of a separate `annotate_task` transaction. LLM output is accepted only if it is `{rationale}` ≤ 600 chars (zod), every digit sequence in it (canonicalised: thousands separators, trailing zeros) appears in the template or the facts, and it contains no spelled-out number words (uncheckable). The whole request, body included, is bounded by 3 s; the model must be listed by `GET /v1/models` at start (D-107). Any failure → template, with the reason in the `task_opened` event.

## D-604 — Escalation needs: purchase cycles, reimbursements, float notes
2026-11-09 · accepted
Decision: A purchase hint `{rule_id, after_n}` yields one need per completed cycle of `after_n` Rewarded tasks of the rule, anchored on the task that completed the cycle (`task_id` of the escalation); only the latest cycle is considered. Dedupe is by `(kind, task_id)` on chain: any escalation except `Failed` blocks a repeat, so a DAO `Rejected` is final while a failed submission may be retried. Reimbursement needs exist only for tasks at `expense_state = NeedsEscalation` and pay the claimer exactly the expense; only a Submitting/Submitted/Approved escalation for the task blocks a new one, because the contract returns the task to `NeedsEscalation` after an Expired, Failed or Removed proposal and ends a DAO rejection at `Denied`. Before escalating the agent requires a cached bond (else it calls `refresh_dao_policy` and waits a tick), fewer than 3 open escalations and `float_free >= bond`. `sync_escalation` runs at most once per `sync_every_seconds` for Submitted escalations (10× slower for Expired/Failed with an unsettled bond). AGENT_SPEC §2's "asset-level annotate" for a low float is not possible (`annotate_task` needs a task id), so it is an off-chain `agent_waiting {reason: float_low}` event when the float cannot cover a proposal bond.

## D-605 — Agent feed, simulation driver and limits-demo outputs
2026-11-09 · accepted
Decision: The agent's SSE (`GET /events`, port 8788) and JSONL log use the bridge's event shape (`seq, at, chain_time_ns, type, asset_id, simulated, data`); every event about a simulated asset or produced against the fake chain has `simulated: true`. Event types: `task_opened`, `task_annotated`, `escalation_requested`, `escalation_synced`, `dao_policy_refreshed`, `agent_waiting {reason}` (emitted once per change of reason), `write_rejected`, `write_ambiguous`, `write_failed`, `agent_error`, `llm_status`, `agent_started`, and `sim_task_completed` (fake driver only). `config.sim.yaml` runs a fake chain with a usage driver for local feeds; its evidence stays in `agent/state/`. `limits-demo.ts --chain fake` writes `agent/state/agent-limits.fake.json`; only the testnet run writes `evidence/agent-limits.json`. An attempt whose on-chain precondition is missing (e.g. the DAO has not revoked the agent yet) is `skipped` and never counts as passed; expected codes may include protocol refusals of function-call keys (`PROTOCOL:DepositWithFunctionCall`, `PROTOCOL:MethodNameMismatch` for `approve_task` if the key's method list excludes it).

## D-701 — Testnet topology and account names
2026-11-09 · accepted (chain-ops, M2)
Decision: Under root `commonkit-sxflo.testnet`: community roots `makerlab.` and `dorm-b.` (keys kept, no community money, D-105) each create `commons.<community>` , the asset accounts (`printer-01`, `laser-01` / `washer-01`, `fridge-01`) and three DAO council accounts (`elif`, `burak`, `selin` / `nil`, `ozan`, `ece`). DAOs `makerlab-ck.sputnikv2.testnet` and `dorm-b-ck.sputnikv2.testnet` with the factory default policy (2 of 3, D-103). The demo cast (`ali`, `can`, `ayse`, `mehmet`, `zeynep`) and the operators `bridge`, `agent`, `supplier` are direct sub-accounts of the root. All council and cast accounts are team-controlled and recorded as `kind: demo-bot`; `selin` holds the pilot-rep seat until the pilot rep has an account (then a ChangePolicy proposal). Commons roles: makerlab steward+council `elif`, council `burak`, verifier `mehmet`, trainer `ayse`; dorm-b steward `nil`, verifier `ozan`, council `ece`. One bridge and one agent account serve all assets with one function-call key per (operator, asset): receiver = the asset, exact CONTRACT_SPEC method lists, 1 NEAR gas allowance each. Single source: `scripts/lib/topology.ts`.

## D-702 — Contract accounts: create + deploy + init in one tx, keyless "pending" until M1c sign-off
2026-11-09 · accepted (chain-ops, M2)
Decision: The community root signs one transaction per contract account: CreateAccount, Transfer, AddKey (temporary full access, saved in the legacy keychain), DeployContract, FunctionCall `new`. `deployments/testnet.json` marks the account `keyless: "pending"`. `setup-testnet.ts --finalize-keyless` deletes the keys only after every planned account exists (D-105), `get_wiring` matches the plan and the code_hash matches the recorded build, then requires an empty `view_access_key_list` before writing `keyless: true`. DAO accounts are recorded `keyless: true` only after their (factory-created) key list was read empty. `verify.sh` fails on `pending` unless `--allow-pending` is passed.
Consequences: Until the lead confirms M1c, the commons accounts still hold a key; no README/UI claim of keylessness before `--finalize-keyless` ran.

## D-703 — No NEAR global contract (NEP-591) for the asset code
2026-11-09 · accepted (chain-ops, M2)
Context: Lead asked to evaluate deploying the 456 KB asset WASM once as a global contract to save ~4.6 NEAR of storage per asset account.
Decision: Deploy normally. nearcore `near-parameters` 0.38.0 (`res/runtime_configs/77.yaml`) sets `global_contract_storage_amount_per_byte` = 0.0001 NEAR, 10× the regular 10^19 yocto/byte, and that amount is burned: ~45.6 NEAR for one global deploy vs 4 × 4.56 = 18.2 NEAR staked (and still owned by the asset accounts) for four normal deploys. near-cli-rs 0.31.1 has `contract deploy-as-global` and near-api-js 7.4.0 has the actions, but this was not run on testnet, and the code_hash reporting for accounts using a global contract was not checked. Revisit only if the asset count grows past ~10.

## D-704 — Funding: faucet helper accounts swept to the root; council and operator balances
2026-11-09 · accepted (chain-ops, M2)
Decision: `scripts/fund-testnet.ts --target <NEAR>` creates throwaway `ck-fund-<tag>-<n>.testnet` accounts with `near account create-account sponsor-by-faucet-service` (10 NEAR each, research B7) and transfers all but 0.05 NEAR to the root (helpers are kept, not deleted). The faucet refused the 7th account in one burst on 2026-11-09. Council proposers hold 2 NEAR (1 NEAR bond, returned) and voters 1 NEAR: a 300 Tgas vote reserves ~0.3 NEAR of prepaid gas up front, so 0.3 NEAR voters were rejected (`NotEnoughBalance`). `setup-testnet.ts` tops spendable accounts back up to their planned balance on every run. Seed tops a DAO treasury up from the root (plain transfer, research C10) only when a proposal's attached deposit exceeds `get_available_amount`.

## D-705 — Asset `storage_reserve` must be ≥ 7 NEAR for the current WASM
2026-11-09 · proposed (chain-ops → profile owner)
Context: The asset WASM is 455,955 bytes (4.56 NEAR of storage at 10^19 yocto/byte). All profiles use `storage_reserve` = 5 NEAR, so code alone uses 91% of the reserve; CONTRACT_SPEC §8 / verify.sh fail above 80%, and only ~44 kB of state would fit.
Decision: `setup-testnet.ts` refuses to deploy an asset whose profile reserve cannot hold WASM + 100 kB state at ≤ 80% (`recommendedStorageReserve` = 7 NEAR for this WASM) unless `--allow-tight-reserve` is passed. The four testnet profiles (printer_3d, laser_cutter, washer, community_fridge) need `storage_reserve` ≥ 7 NEAR before asset deployment. The funding plan already budgets 7 NEAR per asset.

## D-706 — Seeding scope; printer-01 is left to judge step 1
2026-11-09 · accepted (chain-ops, M2)
Decision: `seed-testnet.ts` passes, each through a DAO proposal voted by the council: `set_roles` (≤ 4 actions per proposal, atomic), `set_credential_kind` (`laser_safety`: 365 days, reward group `makerlab-fab`, 1 trainer right, 2 slots, 60 days), `fund_storage` 0.5 NEAR per commons, and per deployed asset `set_operators`, `register_asset` and `fund_float`. It also calls `refresh_dao_policy` directly (an ANY method, not governance). `printer-01` gets operators and the policy cache, but its registration and float are judge step 1 (DEMO_SCRIPT §2). Planned initial floats: printer 2 NEAR (below its 3 NEAR cap so step 2's fee does not sweep at once; DEMO_SCRIPT step 1 still says 3 — lead to align), laser 1, washer 1, fridge 0.5. A rerun resumes an identical InProgress proposal instead of opening a duplicate.

## D-213 — Asset fixes from the M1a/M1b verifier review
2026-11-09 · accepted (coordinator decisions on verifier findings)
Decision:
1. **Right reservations pay a minimum deposit.** With `right_id` the fee is 0; the deposit is `max(deposit_for(holder), MIN_RESERVATION_STORAGE_DEPOSIT = 0.01 NEAR)`, refunded like any deposit. `reserve` measures the storage its records add (`storage_usage` delta after flushing, × byte cost) into `Reservation.storage_cost`; a **Rejected** reservation keeps that amount in `float_free` and refunds the rest (applies to every rejection; ~0.004 NEAR for a 1–2 slot booking).
2. **Rewards cannot get stuck for lack of gas.** `GAS_ON_OP_RESULT = 25`, `GAS_ON_MINTED = 2×25+20 = 70`, `GAS_ON_AUTHORIZED = 75` Tgas. `approve_task`, `council_approve_task`, `retry_reward` require prepaid gas ≥ `MIN_GAS_REWARD = 125 Tgas` (`E_INVALID_ARGS`). `retry_reward` also restarts a mint still `RightsPending` 10 minutes after it was sent (`Task.reward_started_at`; mint is idempotent and a late first callback is ignored).
3. `escalate(kind="reimbursement")` requires the task `Approved` or `Rewarded`; `reject_task`/`cancel_task`/`close_failed_reward` reset `NeedsEscalation` → `None`.
4. Reimbursement escalation outcomes flow back to the task (only for the escalation the task points to): Approved → `Paid`; Rejected by vote → new terminal `ExpenseState::Denied`; Expired (stored or lazy) / Failed / Moved / Removed → `NeedsEscalation` (can be escalated again). Event `expense_state_changed {task_id, escalation_id, expense_state, dao_status, reason}`.
5. Out of service, `cancel_reservation` and `mark_no_show` always refund the deposit and also the fee; if `float_free` cannot cover the fee it is recorded as `Reservation.fee_refund_owed` (ledger total `fee_refunds_owed`, not part of the invariant because it is owed, not held) and paid by `claim_fee_refund(id)` (ANY) once the float allows. An out-of-service no-show writes no `no_show` reputation record.
6. `cancel_task` (false alarm) clears the rule's fault reports and restarts its baseline (Metric → current value, Schedule → now); `reject_task` keeps them.
7. `set_profile` restarts a rule's baseline when its trigger kind (or Metric metric) changes for the same `rule_id`.
8. `validate_profile` caps `right_validity_days <= 3650`. New DAO-only `close_failed_reward(task_id, reason)`: an `Approved` task whose mint `Failed` and that holds no minted rights → `Cancelled`, releases reserved cash/expense/`rights_reserved`, unblocks the rule, event `reward_closed`. It never touches minted rights.
9. Bonds of proposals that end `Failed`/`Moved` are settled as spent (`bonds_outstanding -= bond`, `total_bonds_lost += bond`); any later refund or bond-policy difference arrives as untracked balance and is reconciled into the float (D-204).
10. DAO-only `force_close_session(id)` after `end_ts + 1 h`: `InSession` → `Finished` without telemetry (deposit/right flows continue when the bridge was cleared mid-session); event `session_finished {forced_by_dao: true}`.
11. `submit_verification_result` only while the task awaits its verifier (`Submitted` and `verifier == None`).
12. v1 limits documented: commons `MAX_ROLE_ACCOUNTS = 100` counts tombstones forever; `holder_reservations` keeps one growing `Vec<u64>` per holder (fine for v1 volumes; views paginate).
13. Error codes used but missing from §10 added: `E_LEDGER` (internal ledger underflow — a bug, aborts), `E_MINT_FAILED`, `E_TRANSFER_FAILED` (reason strings in `reward_failed`).
Consequences: Spec §2.1–§3.6, §8, §9, §10 updated. Unit tests cover every item; sandbox tests cover 1, 2, 4, 5.

## D-707 — One transaction signer for scripts, bridge and agent: `@commonkit/sdk/signer`
2026-11-09 · accepted (chain-ops, lead request)
Decision: `packages/sdk/src/signer.ts` (Node-only subpath export `@commonkit/sdk/signer`, so the browser entry stays free of `node:fs`; near-api-js pinned `7.4.0`). `NearSigner.fromEnv(accountId, envVar)` / `.fromKeychain(accountId, {publicKey?})`; `signAndSend({receiverId, methodName, args, gas, deposit?, allowFailure?})` and `signAndSendActions(receiverId, actions)` → `{txHash, nonce, outcome, logs}`. The tx is built and signed locally (nonce = max(cached, on-chain) + 1, block hash from `view_access_key` at final), so hash and nonce are known before broadcast; one send at a time per key. Errors: `TxPanicError` (executed and failed; `.code` from `parseErrorCode`), `TxRejectedError` (node refused before execution; one automatic retry on InvalidNonce), `AmbiguousTxError` (timeout, transport error or RPC TIMEOUT_ERROR after broadcast; `.ref = {txHash, nonce, accountId, publicKey}`). `isSettled({txHash?, nonce?})` is true once the tx is FINAL, or when it is unknown and a final block has already used its nonce. `send_tx` goes to the first RPC only: after a transport failure a second node could answer InvalidNonce for our own landed tx and invite a double send. scripts/lib uses it for every write.

## D-021 — storage_reserve 7 NEAR in every profile; printer demo float 2 NEAR
2026-11-09 · accepted (resolves chain-ops D-705, D-706)
Context: The asset WASM (~456 KB) alone stakes ~4.6 NEAR; the spec/verify.sh fail when storage usage exceeds 80 % of `storage_reserve`, so 5 NEAR fails before any state is stored. A 3 NEAR initial float equals the printer's cap, so the first fee would sweep immediately.
Decision: `storage_reserve = 7 NEAR` in all 12 profiles (one WASM for all). Demo step 1 funds the printer float with 2 NEAR (cap 3).
Consequences: ~+2 NEAR per deployed asset; four assets ≈ 28 NEAR staked + floats.

## D-214 — Gas constants measured in the sandbox; recommended attached gas
2026-11-09 · accepted
Context: Spec §8 asked to measure the heavy paths. `contracts/tests/tests/gas.rs` runs them against the real Sputnik WASM (near-workspaces 0.24.0, sandbox 2.14) and prints every receipt.
Measured total burn: reserve → authorize → on_authorized → sweep **11 Tgas** (asset 3.5 + commons 1.7 + callback 3.3 + op callback 2.1); rejected reserve + refund op 11; approve → mint(1) → on_rights_minted → CashReward + Reimbursement → 2 × on_op_result **17 Tgas** (largest receipt: on_rights_minted 4.1); approve → mint(2) 9; escalate → add_proposal → callback 8; sync_escalation 7; refresh_dao_policy 7; DAO vote executing `set_roles` pushed to 3 assets 26 (commons 5.6, each push 3.0 + callback 1.5); cancel with refund + release_right 11.
Decision: Keep the static constants (spec §8 table) — each has ≥ 5× headroom over its measured burn and unburnt static gas is refunded; the callback constants are sized for the ops they may create (D-213 #2). Callers attach: `reserve` 120 Tgas; refund/op-creating methods 60; reward-starting methods ≥ 125 (enforced); `escalate` 60; DAO views 50; others 30.
Consequences: SDK/bridge/agent/web use these gas values. Re-measure on testnet in M2 and append if they differ by more than 2×.

## D-215 — Sandbox suite design (M1c)
2026-11-09 · accepted
Decision: (1) Every sandbox test runs against the **real** Sputnik DAO v2 WASM (`contracts/tests/res/sputnikdao2.wasm`, testnet factory default code) with the default policy for 3 council members (2 votes, D-103); all wiring goes through FunctionCall proposals (`propose_and_pass`), so C9 (predecessor == DAO) is exercised on every setup. No mock DAO. (2) Asset accounts start with `storage_reserve + 0.05 NEAR`, as on testnet. (3) `inv_exactly_once_reward_retry` forces the mint failure by DAO-deactivating the asset in commons (`mint_rights` panics `E_ASSET_NOT_REGISTERED`), re-registers it, then `retry_reward`; commons idempotency is checked by calling `mint_rights` again as the asset account. (4) `inv_failed_refund_keeps_claim` deletes the holder account before `confirm_return`, then recreates it and `retry_op`. (5) `inv_no_double_booking_concurrent` submits two overlapping `reserve` txs concurrently (`tokio::join!`); exactly one succeeds, the other fails synchronously with `E_SLOT_TAKEN` and its deposit is returned by the protocol. (6) Sandbox `fast_forward` is slow in wall time (minutes per thousands of blocks), so the harness caps every asset's `slot_minutes` at 15 (= the start window) and books the current slot for sessions; `inv_schedule_rule_due_only_after_interval` shortens the laser's 720 h `monthly_safety_check` to 1 h in that test only; time travel uses `fast_forward` with an adaptive chain-time-per-block estimate so short start windows are not overshot. (7) Balance assertions allow 0.1 NEAR for gas and wait two blocks for gas-refund receipts; exact amounts are asserted through ledger views and events. (8) `contracts/tests/tests/coverage.rs` fails when a method in the cargo-near ABI has no COVERAGE.md row with unit tests.

## D-022 — No hardware: every asset is simulated, through real adapters and API-faithful device emulators
2026-11-09 · accepted (human decision; supersedes D-013 and the "real hardware" plans in PILOT.md / DEMO_SCRIPT §1 / M8)
Context: The human will not buy a printer, smart plug or any device. The product claim must stay honest (CLAUDE.md §4.11) and the simulation must still exercise the real code paths.
Decision: (1) All scenarios are "simulation"; nothing is called real hardware anywhere. The four testnet assets (printer-01, laser-01, washer-01, fridge-01) are "simulation" on testnet; the other 8 profiles are "profile example only" with a runnable simulator scenario. (2) The production adapters (moonraker, octoprint, smart_plug: Shelly Gen2/Gen1/Tasmota, manual_qr) are implemented and run against device emulators — local HTTP servers that implement the documented API subset we use (state machine, counters, auth, failure modes) — so the demo path is "bridge → real moonraker adapter → emulated Moonraker". Every event, log, UI badge and README row says SIMULATED / emulated device. (3) No M8 hardware work; the video is screen-only (web app + bridge/emulator console + explorer).
Consequences: The "real physical asset" differentiator is replaced by a faithful, reproducible emulation any judge can run (`./scripts/simulate.sh <profile>`); honest limits say no physical device was tested.

## D-023 — X demo post fits 280 characters
2026-11-09 · accepted
Context: The human's X account is not premium.
Decision: The demo post draft is ≤ 280 characters (URLs count as 23 each) with the video attached; extra detail goes into the README, not a thread, unless the human asks for one.

## D-411 — Bridge follows the final asset contract (M1c): reasons, re-verification, hashes
2026-11-10 · accepted
Decision: (1) D-019 is applied: NEP-413 check 4 requires a FullAccess key; a function-call key gets 403 `KEY_NOT_FULL_ACCESS`. The fixed vector `function_call_key` was added (it replaces the D-402 acceptance of function-call keys). (2) The fake chain mirrors `can_access` exactly (`unknown_reservation`, `not_holder`, `out_of_service`, `session_active`, `pending_authorization`, `not_active`, `too_early`, `start_window_closed`, `ok`) and `submit_verification_result` (only `Submitted` with no verifier; `details_hash` must be 64-char hex). (3) The contract accepts a new verification result until a verifier decides, so the bridge allows a re-run after a failed result and refuses one after a passing result (`ALREADY_VERIFIED`) or once a verifier exists. (4) `TaskView.requiresVerificationTest` is read and shown in the `NO_VERIFICATION_TEST` reason. Argument names were checked against `commonkit_asset_abi.json`.

## D-412 — Bridge writes through `@commonkit/sdk/signer`, one function-call key per asset
2026-11-10 · accepted
Decision: `NearChainClient` takes a per-asset `TxSigner` lookup. `NearSignerTxSigner` wraps `NearSigner.signAndSend` (gas in Tgas × `TGAS`) and maps errors to `ChainError.kind`: `TxPanicError` → `panic` (its code, never retried), `TxRejectedError` → `rejected` (not applied, retried), `AmbiguousTxError` → wait until `isSettled` (≤ 60 s), then `ambiguous_settled` (retried after the usual view check) or `ambiguous` (not resent blindly; the watcher's next pass re-reads state). An asset with no key fails as `config`, which is not retried. Key resolution per asset: `signer_env` → keychain key from `deployments/testnet.json` `function_call_keys` for (bridge, asset) → none, with a warning in the startup log. A missing deployments file is fine (nothing deployed). Tested with a mocked NearSigner; nothing has been sent to testnet.
Consequences: Recovery after an ambiguous `mark_session_started`: if it landed, the member's retry sees `session_active` and the bridge skips the start call and unlocks.
