# CONTRACT_SPEC

Two Rust contracts in one cargo workspace: **`asset`** (one deployment per asset, identical WASM) and **`commons`** (one deployment per community).

Conventions:
- Amounts: `U128` (yoctoNEAR). Timestamps: `u64` nanoseconds (`env::block_timestamp()`), exposed as `U64` in JSON.
- IDs: `u64` counters exposed as `U64` strings.
- Errors: `require!(cond, "E_CODE: human message")` — codes in §10.
- Events: NEP-297, `standard = "commonkit"`, `version = "1.0.0"` — catalogue in §9.
- All callbacks `#[private]`, handle success **and** failure.
- Gas constants are named and documented; tune after measuring on testnet.
- This spec is the contract of record. If implementation needs to diverge, update this file and `DECISIONS.md` in the same commit.

---

## 1. Shared types (`packages` crate `commonkit-types` or a module copied into both)

```rust
pub type AssetId = AccountId;       // the asset contract's own account
pub type GroupId = String;          // e.g. "makerlab-fab"
pub type CredentialKind = String;   // e.g. "laser_safety"
pub type Role = String;             // "steward" | "verifier" | "trainer" | "council"

pub enum OpStatus { Pending, Succeeded, Failed }   // for every outbound transfer/call
```

---

## 2. `asset` contract — state

```rust
pub struct AssetContract {
    // identity & wiring
    dao_id: AccountId,               // Sputnik DAO account; governance calls must come from it
    commons_id: AccountId,           // community registry
    profile: Profile,
    profile_version: u32,

    // operators (set by DAO)
    bridge_id: Option<AccountId>,
    agent_id: Option<AccountId>,

    // roles pushed from commons
    roles: LookupMap<AccountId, Vec<Role>>,
    roles_version: u64,

    // money ledger (all yocto)
    ledger: Ledger,

    // reservations
    next_reservation_id: u64,
    reservations: IterableMap<u64, Reservation>,
    slot_index: LookupMap<u64 /*slot number*/, u64 /*reservation id*/>,

    // telemetry
    telemetry: Telemetry,

    // maintenance
    next_task_id: u64,
    tasks: IterableMap<u64, Task>,
    rule_baselines: LookupMap<String /*rule_id*/, u64 /*metric value at last approved maintenance*/>,
    open_task_by_rule: LookupMap<String, u64>,
    period: RewardPeriod,

    // escalations
    next_escalation_id: u64,
    escalations: IterableMap<u64, Escalation>,

    // outbound operations (refunds, sweeps, cash rewards, bonds)
    next_op_id: u64,
    ops: IterableMap<u64, OutboundOp>,

    // reputation (per asset)
    reputation: LookupMap<AccountId, Reputation>,
    reputation_log: Vector<ReputationRecord>,
}
```

### 2.1 Profile

```rust
pub struct Profile {
    pub asset_type: String,            // "printer_3d" | "laser_cutter" | "washer" | ...
    pub display_name: String,
    pub group_id: GroupId,
    pub adapter: String,               // informational: "moonraker" | "smart_plug" | "simulator" | ...
    pub usage_unit_label: String,      // "job" | "cycle" | "session_minutes" | ...
    pub slot_minutes: u32,             // reservation granularity
    pub max_slots_per_reservation: u32,
    pub booking_horizon_days: u32,
    pub price_per_slot: U128,
    pub deposit: U128,
    pub deposit_trusted: U128,         // reduced deposit after `trusted_after` clean returns
    pub trusted_after: u32,
    pub required_credential: Option<CredentialKind>,
    pub float_cap: U128,
    pub storage_reserve: U128,         // never swept, never spent
    pub auto_reward_cash_cap: U128,    // tier-1/2 max cash per task
    pub council_threshold_cash: U128,  // above this (but <= cap) needs council approval too
    pub period_days: u32,
    pub period_reward_quota: u32,      // max usage-right cards minted by this asset per period
    pub right_max_slots: u32,          // how many slots one right card covers
    pub right_validity_days: u32,
    pub first_task_needs_council: bool,
    pub start_window_minutes: u32,     // session must start within this window after slot start
    pub rules: Vec<MaintenanceRule>,
    pub protocol_fee_bps: u16,         // must be <= PROTOCOL_FEE_MAX_BPS (e.g. 200); 0 in pilot
    pub protocol_fee_receiver: Option<AccountId>,
}

pub struct MaintenanceRule {
    pub rule_id: String,               // "nozzle_clean"
    pub metric: String,                // "nozzle_seconds"
    pub threshold: u64,                // delta since baseline
    pub title: String,
    pub reward_rights: u32,            // usage-right cards for the worker
    pub reward_cash: U128,             // optional cash from free float (<= auto_reward_cash_cap)
    pub requires_verification_test: bool,
    pub claim_timeout_hours: u32,
}
```

Profile validation (`validate_profile`): rules unique ids, `reward_cash <= auto_reward_cash_cap`, `deposit_trusted <= deposit`, `protocol_fee_bps <= MAX`, `slot_minutes > 0`, `float_cap > 0`, non-empty strings bounded (≤ 64 chars ids, ≤ 200 titles).

### 2.2 Ledger

```rust
pub struct Ledger {
    pub float_free: u128,          // available operating money
    pub deposits_held: u128,       // liability to users
    pub rewards_reserved: u128,    // cash reserved for open tasks
    pub pending_out: u128,         // amounts in flight (refunds, sweeps, cash rewards, bonds, fee payouts)
    pub total_fees_in: u128,
    pub total_swept: u128,
    pub total_refunded: u128,
    pub total_rewards_paid: u128,
    pub total_bonds_paid: u128,
    pub total_protocol_fees: u128,
}
```

**Ledger invariant (checked in tests after every operation, exposed via `get_ledger`):**

```
env::account_balance() >= storage_reserve + float_free + deposits_held + rewards_reserved + pending_out
```

(`account_balance` includes storage-staked tokens on NEAR; the `storage_reserve` profile value must be ≥ actual storage usage cost + margin. `get_ledger` also returns `storage_usage` and `env::storage_byte_cost()` so verify.sh can check it.)

### 2.3 Reservation

```rust
pub struct Reservation {
    pub id: u64,
    pub holder: AccountId,
    pub start_slot: u64,               // slot number = floor(ts / slot_minutes)
    pub slots: u32,
    pub fee_paid: u128,
    pub deposit_paid: u128,
    pub right_id: Option<String>,      // NEP-171 token id in commons
    pub status: ReservationStatus,
    pub created_at: u64,
    pub session_started_at: Option<u64>,
    pub session_finished_at: Option<u64>,
    pub metrics_delta: Option<Vec<(String, u64)>>,
    pub return_result: Option<ReturnResult>,
}

pub enum ReservationStatus {
    PendingAuthorization,   // slots held, waiting for commons
    Confirmed,
    InSession,
    Finished,               // device locked again, awaiting steward return check
    Closed,                 // deposit refunded (or none) — terminal
    Disputed,               // deposit held for review
    Cancelled,              // by holder before start — terminal
    Rejected,               // authorization failed — terminal
    NoShow,                 // start window passed — terminal
}

pub enum ReturnResult { Clean, Damage { note_hash: String } }
```

### 2.4 Telemetry

```rust
pub struct Telemetry {
    pub metrics: Vec<(String, u64)>,   // cumulative counters, monotonic per metric
    pub updated_at: u64,
    pub reports: u64,
}
```

`report_telemetry` rejects decreasing counters (`E_TELEMETRY_NOT_MONOTONIC`) unless `reset_epoch` is incremented by the DAO (hardware swap).

### 2.5 Task

```rust
pub struct Task {
    pub id: u64,
    pub rule_id: String,
    pub opened_by: AccountId,          // agent account (or council for manual tasks)
    pub rationale: String,             // ≤ 1000 chars, from agent
    pub metric_value_at_open: u64,
    pub reward_rights: u32,
    pub reward_cash: u128,
    pub needs_council: bool,
    pub status: TaskStatus,
    pub claimer: Option<AccountId>,
    pub claimed_at: Option<u64>,
    pub evidence_hash: Option<String>, // hex sha256
    pub evidence_uri: Option<String>,
    pub verification: Option<VerificationResult>,
    pub verifier: Option<AccountId>,
    pub council_approver: Option<AccountId>,
    pub reward_state: RewardState,
    pub minted_right_ids: Vec<String>,
    pub created_at: u64,
}

pub enum TaskStatus { Open, Claimed, Submitted, Approved, Rewarded, Rejected, Expired, Cancelled }

pub struct VerificationResult { pub passed: bool, pub details_hash: String, pub reported_at: u64 }

pub enum RewardState { NotStarted, RightsPending, CashPending, Done, Failed { reason: String } }

pub struct RewardPeriod { pub started_at: u64, pub rights_minted: u32 }
```

### 2.6 Escalation

```rust
pub struct Escalation {
    pub id: u64,
    pub requested_by: AccountId,
    pub kind: String,                  // "purchase" | "cash_reward" | "other"
    pub receiver: AccountId,
    pub amount: u128,
    pub reason: String,
    pub task_id: Option<u64>,
    pub proposal_id: Option<u64>,
    pub status: EscalationStatus,
    pub bond_paid: u128,
}
pub enum EscalationStatus { Submitting, Submitted, Approved, Rejected, Expired, Failed }
```

### 2.7 OutboundOp

```rust
pub struct OutboundOp {
    pub id: u64,
    pub kind: OpKind,                  // Refund | Sweep | CashReward | Bond | ProtocolFee
    pub to: AccountId,
    pub amount: u128,
    pub ref_id: Option<u64>,           // reservation / task / escalation id
    pub status: OpStatus,
    pub attempts: u32,
}
```

On failure: status `Failed`, amount moves from `pending_out` back to its source bucket (e.g. `deposits_held` for refunds) and the claim remains. `retry_op(op_id)` (anyone) re-sends a `Failed` op; never a `Succeeded` or `Pending` one.

### 2.8 Reputation

```rust
pub struct Reputation { pub sessions: u32, pub clean_returns: u32, pub damages: u32, pub maintenances: u32 }
pub struct ReputationRecord { pub seq: u64, pub account: AccountId, pub kind: String, pub ref_id: u64, pub at: u64 }
```

Every record emits `reputation_recorded` with `ref_id` so the board can link to the tx.

---

## 3. `asset` — methods

Access abbreviations: **DAO** = `predecessor == dao_id`; **COMMONS** = `predecessor == commons_id`; **BRIDGE** = `predecessor == bridge_id`; **AGENT** = `predecessor == agent_id`; **ROLE(x)** = predecessor has role x in pushed roles; **ANY** = anyone.

### 3.1 Init & governance

| Method | Access | Deposit | Behavior |
| :--- | :--- | :--- | :--- |
| `new(dao_id, commons_id, profile)` | init (deployer) | — | validate profile; store |
| `set_profile(profile)` | DAO | — | validate; `profile_version += 1`; does not affect existing reservations/rights/tasks; event `profile_updated` |
| `set_operators(bridge_id?, agent_id?)` | DAO | — | set/clear; event `operators_updated` |
| `fund_float()` | ANY (normally DAO via proposal) | yes | adds attached to `float_free`; then maybe sweep; event `float_funded` |
| `set_telemetry_epoch(epoch)` | DAO | — | allow counter reset after hardware swap |
| `sync_roles(updates: Vec<(AccountId, Vec<Role>)>, version)` | COMMONS | — | ignore if `version <= roles_version`; else apply |

### 3.2 Reservations

| Method | Access | Deposit | Behavior |
| :--- | :--- | :--- | :--- |
| `reserve(start_slot, slots, right_id?)` | ANY | fee + deposit (or deposit only if right) | Checks: `slots <= max`, start in `[now_slot, now_slot + horizon]`, slots free, attached == expected (exact, else `E_WRONG_AMOUNT`). Hold slots with `PendingAuthorization`. Call `commons.authorize_reservation(holder, asset=self, credential=profile.required_credential, right_id, reservation_id)` → `on_authorized`. |
| `on_authorized(reservation_id)` | private | — | Ok → `Confirmed`; fee → `float_free` (minus protocol fee op if >0); deposit → `deposits_held`; event `reservation_confirmed`; `maybe_sweep()`. Err/failed promise → release slots, status `Rejected`, refund attached via Refund op; event `reservation_rejected {reason}`. |
| `cancel_reservation(id)` | holder | — | Only `Confirmed` and before start slot. Refund fee per cancellation policy (v1: full refund if ≥ 1 slot before start, else fee kept) + full deposit; if `right_id` → `commons.release_right`. Event. |
| `mark_session_started(id)` | BRIDGE | — | Only `Confirmed`, within `[start, start + start_window]`. → `InSession`. Event. |
| `mark_session_finished(id, metrics: Vec<(String,u64)>)` | BRIDGE | — | Only `InSession`. → `Finished`; also applies telemetry (same rules as `report_telemetry`); if `right_id` → `commons.finalize_right`. Reputation `sessions += 1`. Event. |
| `mark_no_show(id)` | ANY | — | Only `Confirmed` after start window passed. → `NoShow`; fee kept; deposit refunded (v1 policy; log it); if right → `release_right` (right returns to Active — not consumed). Event. |
| `confirm_return(id, result)` | ROLE(steward), ≠ holder | — | Only `Finished`. Clean → Refund op for deposit, `Closed`, `clean_returns += 1`. Damage → `Disputed` (deposit stays in `deposits_held`). Events + reputation record. |
| `resolve_dispute(id, deduct: U128, note_hash)` | DAO | — | Only `Disputed`. `deduct <= deposit`. Deduct → `float_free`; rest → Refund op; `Closed`; `damages += 1`. Event. |

### 3.3 Telemetry & maintenance

| Method | Access | Behavior |
| :--- | :--- | :--- |
| `report_telemetry(metrics)` | BRIDGE | Monotonic per metric; unknown metrics allowed (≤ 16 metrics, names ≤ 32 chars). Event `telemetry_reported`. |
| `open_maintenance_task(rule_id, rationale)` | AGENT or ROLE(council) | Rule exists; no open task for rule; `metric - baseline >= threshold` (council may bypass threshold only with `manual=true` flag recorded); `reward_cash <= float_free` → reserve cash (`float_free -= cash; rewards_reserved += cash`); quota pre-check `period.rights_minted + reward_rights <= quota` (rolling period reset when `now > started_at + period_days`). `needs_council = reward_cash > council_threshold_cash`. Event `task_opened {rule_id, metric_value, threshold, rationale}`. |
| `annotate_task(task_id, note)` | AGENT | Append note (≤ 500 chars) — event only. |
| `claim_task(task_id)` | ANY member (any account with any role or any reputation sessions ≥ 1 — v1: any account) | Open → Claimed. Not agent/bridge. Event. |
| `unclaim_task(task_id)` | claimer, or ANY after `claim_timeout_hours` | → Open. Event. |
| `submit_task(task_id, evidence_hash, evidence_uri?)` | claimer | Claimed → Submitted. Event. |
| `submit_verification_result(task_id, passed, details_hash)` | BRIDGE | Only Submitted. Stores result. Event. |
| `approve_task(task_id)` | ROLE(verifier); ≠ claimer; ≠ agent; ≠ bridge | Submitted; if rule requires test → result must be `passed`. If `needs_council` or (`first_task_needs_council` and claimer has 0 maintenances) → set `verifier`, wait for `council_approve_task`. Else → **reward**. |
| `council_approve_task(task_id)` | ROLE(council); ≠ claimer; ≠ verifier | After verifier approval → **reward**. |
| `reject_task(task_id, reason)` | ROLE(verifier) or ROLE(council); ≠ claimer | Submitted → Rejected; release reserved cash back to float; reopen rule (rule can be reopened by agent). Event. |
| `expire_task(task_id)` | ANY | Claimed past timeout → Open (same as unclaim). |

**Reward procedure (exactly once):**
1. Guard: `status == Approved && reward_state == NotStarted` (set `Approved` first, then start).
2. If `reward_rights > 0`: `reward_state = RightsPending`; call `commons.mint_rights(holder, group, count, validity_days, max_slots, source={asset, task_id})` → `on_rights_minted(task_id)`.
3. `on_rights_minted`: success → store token ids, `period.rights_minted += n`; then if `reward_cash > 0` → CashReward op (`rewards_reserved -= cash; pending_out += cash`) → `reward_state = CashPending`; else `Done`. Failure → `reward_state = Failed{...}`; `retry_reward(task_id)` (ANY) restarts from the failed step only. `commons.mint_rights` must be **idempotent by `(asset, task_id)`** so a retry after an ambiguous failure never double-mints.
4. On `Done`: `status = Rewarded`; baseline for rule = metric value at approval; clear `open_task_by_rule`; reputation `maintenances += 1`; events `task_rewarded`, `reputation_recorded`.

### 3.4 Money ops

| Method | Access | Behavior |
| :--- | :--- | :--- |
| `sweep()` | ANY | If `float_free > float_cap` → Sweep op of the excess to `dao_id`. Also called internally after inflows. Event `swept`. |
| `retry_op(op_id)` | ANY | Only `Failed` ops. |
| `on_op_result(op_id)` | private | Success → `Succeeded`, totals updated. Failure → `Failed`, amount returned to source bucket. Event `op_result`. |

### 3.5 Escalations

| Method | Access | Behavior |
| :--- | :--- | :--- |
| `escalate(kind, receiver, amount, reason, task_id?)` | AGENT or ROLE(council) | Max open escalations (e.g. 3). Bond = DAO `proposal_bond` (cached via `refresh_dao_policy`) taken from `float_free` (must be available, else `E_INSUFFICIENT_FLOAT`). Bond op. Call `dao.add_proposal({description, kind: Transfer{token_id:"", receiver_id, amount}})` with bond attached → `on_escalation_submitted(id)`. Description format: `"COMMONKIT escalation <asset>#<id>: <reason>"`. |
| `on_escalation_submitted(id)` | private | Success → parse proposal id, `Submitted`. Failure → `Failed`, bond returned to `float_free`. |
| `sync_escalation(id)` | ANY | Calls `dao.get_proposal(proposal_id)` → `on_escalation_synced` maps status. |
| `refresh_dao_policy()` | ANY | Calls `dao.get_policy()` → caches `proposal_bond`. |

(See RESEARCH C8 fallback if contracts cannot add proposals.)

### 3.6 Views

`get_profile`, `get_wiring` (dao, commons, bridge, agent, versions), `get_ledger` (+ balance, storage usage, byte cost, invariant_ok: bool), `get_reservation(id)`, `get_reservations(from_index, limit)`, `get_reservations_by_holder(account, from, limit)`, `get_slot_owner(slot)`, `get_availability(from_slot, count)`, `can_access(account, reservation_id) -> AccessCheck {ok, reason, window_start, window_end}`, `get_telemetry`, `get_rule_status() -> Vec<{rule_id, metric, value, baseline, threshold, due: bool, open_task}>`, `get_task(id)`, `get_tasks(from, limit, status?)`, `get_escalation(id)`, `get_escalations(from, limit)`, `get_op(id)`, `get_ops(from, limit, status?)`, `get_reputation(account)`, `get_reputation_log(from, limit)`, `get_period()`, `get_roles(account)`, `version()`.

`can_access` returns `ok=true` only if: reservation `Confirmed` (or `InSession` for resumption), `holder == account`, now within the start window (or session active), and — if credential required — it was authorized at reservation time.

---

## 4. `commons` contract — state

```rust
pub struct CommonsContract {
    dao_id: AccountId,
    name: String,                                 // "Makerlab"
    assets: IterableMap<AccountId, AssetEntry>,   // registered assets
    groups: IterableMap<GroupId, Vec<AccountId>>,
    roles: IterableMap<AccountId, Vec<Role>>,
    roles_version: u64,
    credential_kinds: IterableMap<CredentialKind, CredentialKindConfig>,
    trainings: IterableMap<u64, Training>,
    next_training_id: u64,
    tokens: IterableMap<String /*token_id*/, Card>,
    tokens_by_owner: LookupMap<AccountId, IterableSet<String>>,
    mint_receipts: LookupMap<String /*"asset:task_id" or "training:id"*/, Vec<String>>,  // idempotency
    next_token_seq: u64,
    metadata: NftContractMetadata,                // NEP-177
}

pub struct AssetEntry { pub group_id: GroupId, pub active: bool, pub registered_at: u64 }

pub struct CredentialKindConfig {
    pub kind: CredentialKind,
    pub title: String,
    pub validity_days: u32,                // 0 = no expiry
    pub reward_group: GroupId,
    pub trainer_reward_rights: u32,
    pub right_max_slots: u32,
    pub right_validity_days: u32,
}

pub enum CardKind {
    UsageRight { group_id: GroupId, max_slots: u32, source: RightSource, status: RightStatus },
    Credential { kind: CredentialKind, issued_by_training: u64, suspended: bool },
}
pub enum RightSource { Maintenance { asset: AccountId, task_id: u64 }, Training { training_id: u64 } }
pub enum RightStatus { Active, Locked { asset: AccountId, reservation_id: u64 }, Consumed { asset: AccountId, reservation_id: u64 } }

pub struct Card {
    pub token_id: String,                  // "right-<seq>" | "cred-<seq>"
    pub owner_id: AccountId,
    pub kind: CardKind,
    pub issued_at: u64,
    pub expires_at: Option<u64>,
}

pub struct Training {
    pub id: u64, pub trainer: AccountId, pub trainee: AccountId, pub kind: CredentialKind,
    pub notes_hash: Option<String>, pub status: TrainingStatus, pub approver: Option<AccountId>,
    pub minted: Vec<String>, pub created_at: u64,
}
pub enum TrainingStatus { Proposed, Approved, Rejected }
```

## 5. `commons` — methods

| Method | Access | Behavior |
| :--- | :--- | :--- |
| `new(dao_id, name, metadata)` | init | — |
| `register_asset(asset_id, group_id)` | DAO | Add to group; then push current full role set to the new asset via `sync_roles`. Event. |
| `deactivate_asset(asset_id)` | DAO | New reservations/mints rejected; existing rights untouched. |
| `set_roles(account, roles)` | DAO | Validate role names; `roles_version += 1`; push `sync_roles([(account, roles)], version)` to **every active asset** (fire-and-forget + callback logging failures as `role_sync_failed` events; `resync_roles(asset)` ANY re-pushes the full set). |
| `set_credential_kind(config)` | DAO | Upsert. Changing config never alters issued cards. |
| `suspend_credential(token_id, reason)` / `unsuspend_credential` | DAO | Forward-looking only; event with reason. |
| `authorize_reservation(holder, asset, credential?, right_id?, reservation_id)` | registered active asset == predecessor | Returns `AuthResult { ok, reason }` (does **not** panic on business failures — returns `ok=false` so the asset can refund cleanly). Checks credential card held, not suspended, not expired. If `right_id`: owner == holder, UsageRight, `Active`, not expired, group contains asset → `Locked{asset, reservation_id}`. |
| `release_right(token_id, reservation_id)` | asset that locked it | Locked → Active. |
| `finalize_right(token_id, reservation_id)` | asset that locked it | Locked → Consumed. |
| `mint_rights(holder, count, max_slots, validity_days, source)` | registered active asset == `source.asset` | **Idempotent** on `mint_receipts[asset:task_id]`: if present, return the stored ids. Else mint `count` UsageRight cards in the asset's group; event `nft_mint` (NEP-171 format) + `rights_minted`. |
| `propose_credential(trainee, kind, notes_hash?)` | ROLE(trainer); trainer ≠ trainee | Creates Training. Event. |
| `approve_credential(training_id)` | ROLE(verifier); ≠ trainer; ≠ trainee | Mint credential card to trainee + `trainer_reward_rights` UsageRight cards to trainer (group = kind.reward_group), idempotent by `training:id`. Events. |
| `reject_credential(training_id, reason)` | ROLE(verifier); ≠ trainer | — |

### 5.1 NEP-171 / 177 / 181 surface (non-transferable)

- `nft_token(token_id)`, `nft_tokens(from_index, limit)`, `nft_supply_for_owner`, `nft_tokens_for_owner(account_id, from_index, limit)`, `nft_total_supply`, `nft_metadata()`.
- `nft_transfer`, `nft_transfer_call`, `nft_approve` → `env::panic_str("E_NON_TRANSFERABLE: COMMONKIT cards cannot be transferred")`.
- Token metadata: title (`"Makerlab · 3D printer access"`, `"Laser safety credential"`), description incl. source, `media` = small inline SVG data URI (verify size/wallet support in research B14), `extra` = JSON of status.
- Mint events in NEP-171 `nft_mint` format so explorers/wallets index them.

### 5.2 Views

`get_assets`, `get_group(group_id)`, `get_roles(account)`, `get_all_roles(from, limit)`, `get_credential_kinds`, `get_training(id)`, `get_trainings(from, limit)`, `has_credential(account, kind) -> bool`, `get_cards_for_owner(account)` (typed, richer than NEP-171), `get_mint_receipt(key)`, `version()`.

---

## 6. Slot math

`slot = floor(timestamp_ns / (slot_minutes * 60 * 1e9))`. Reservations cover `[start_slot, start_slot + slots)`. `slot_index` maps each held slot → reservation id. Holding is atomic within the `reserve` call; release on `Rejected`, `Cancelled`, `NoShow`. Finished/Closed reservations keep their slots (history) — fine because they are in the past.

## 7. Fee math

`fee = price_per_slot * slots`. `deposit = trusted ? deposit_trusted : deposit` where `trusted = reputation.clean_returns >= trusted_after`. With a right: `fee = 0`, `slots <= card.max_slots`. Protocol fee: `fee * bps / 10_000` → ProtocolFee op to `protocol_fee_receiver` (skip if 0).

## 8. Gas & deposits

- Name constants: `GAS_AUTHORIZE`, `GAS_ON_AUTHORIZED`, `GAS_MINT`, `GAS_ON_MINTED`, `GAS_ADD_PROPOSAL`, `GAS_TRANSFER_CB`, etc. Start generous (e.g. 20–50 Tgas), measure on testnet, record final values in DECISIONS.
- Storage for new records is paid from the asset's `storage_reserve` (profile) — the reserve must be sized after measuring (research B10). `get_ledger` reports `storage_usage * byte_cost` vs `storage_reserve`; verify.sh fails if usage exceeds 80% of reserve.
- `commons` storage: paid by its own balance funded at deployment by the DAO (`fund_storage()` payable).

## 9. Events (NEP-297, `standard: "commonkit"`)

`asset`: `profile_updated`, `operators_updated`, `roles_synced`, `float_funded`, `reservation_pending`, `reservation_confirmed`, `reservation_rejected`, `reservation_cancelled`, `session_started`, `session_finished`, `no_show`, `return_confirmed`, `dispute_opened`, `dispute_resolved`, `telemetry_reported`, `task_opened`, `task_annotated`, `task_claimed`, `task_unclaimed`, `task_submitted`, `verification_reported`, `task_approved`, `task_council_approved`, `task_rejected`, `task_rewarded`, `reward_failed`, `op_created`, `op_result`, `swept`, `escalation_created`, `escalation_submitted`, `escalation_synced`, `reputation_recorded`.

`commons`: `asset_registered`, `asset_deactivated`, `roles_set`, `role_sync_failed`, `credential_kind_set`, `training_proposed`, `training_approved`, `training_rejected`, `credential_suspended`, `credential_unsuspended`, `right_locked`, `right_released`, `right_consumed`, `rights_minted`, plus NEP-171 `nft_mint` (standard `nep171`).

Each event `data` includes the ids needed to link it (reservation_id, task_id, token_ids, op_id, proposal_id, account).

## 10. Error codes

`E_UNAUTHORIZED`, `E_NOT_DAO`, `E_NOT_COMMONS`, `E_NOT_BRIDGE`, `E_NOT_AGENT`, `E_MISSING_ROLE`, `E_SELF_VERIFY`, `E_INVALID_PROFILE`, `E_WRONG_AMOUNT`, `E_SLOT_TAKEN`, `E_SLOT_OUT_OF_RANGE`, `E_TOO_MANY_SLOTS`, `E_BAD_STATE`, `E_WINDOW_CLOSED`, `E_TELEMETRY_NOT_MONOTONIC`, `E_RULE_NOT_FOUND`, `E_RULE_NOT_DUE`, `E_TASK_ALREADY_OPEN`, `E_QUOTA_EXCEEDED`, `E_CASH_CAP_EXCEEDED`, `E_INSUFFICIENT_FLOAT`, `E_TOO_MANY_ESCALATIONS`, `E_OP_NOT_RETRYABLE`, `E_ALREADY_REWARDED`, `E_NON_TRANSFERABLE`, `E_RIGHT_NOT_ACTIVE`, `E_RIGHT_WRONG_GROUP`, `E_RIGHT_EXPIRED`, `E_CREDENTIAL_MISSING`, `E_ASSET_NOT_REGISTERED`, `E_NO_REVOCATION` (any attempt path that would revoke a right — there must be **no method** that does it; this code is used by guard functions).

## 11. Deployment & keylessness

1. Create account (sub-account of the community root), fund it (storage + initial nothing else).
2. Deploy WASM with `new(...)` init in the same transaction where possible.
3. Delete the full-access key. **Verify** `view_access_key_list` is empty → record in `deployments/testnet.json` with `code_hash`.
4. All further changes only through DAO proposals.
5. No upgrade method in v1 (immutable). Record in DECISIONS (trade-off: bug fix = redeploy to a new account + DAO re-registration).

## 12. Required test coverage (see TEST_PLAN for the matrix)

Every method: happy path + each access-control failure + each state failure. Every invariant in CLAUDE.md §4 has a dedicated test name prefixed `inv_`.
