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
    created_at: u64,                 // block time of `new`; default baseline of Schedule rules (D-212)

    // operators (set by DAO)
    bridge_id: Option<AccountId>,
    agent_id: Option<AccountId>,

    // roles pushed from commons
    roles: LookupMap<AccountId, Vec<Role>>,
    roles_version: u64,

    // money ledger (all yocto)
    ledger: Ledger,

    // reservations (D-209: ids are dense from 0 and never removed, so LookupMap + id-range
    // pagination replaces IterableMap for reservations, tasks, escalations and ops)
    next_reservation_id: u64,
    reservations: LookupMap<u64, Reservation>,
    slot_index: LookupMap<u64 /*slot number*/, u64 /*reservation id*/>,
    holder_reservations: LookupMap<AccountId, Vec<u64>>,   // D-209

    // telemetry
    telemetry: Telemetry,

    // upkeep (D-017)
    next_task_id: u64,
    tasks: LookupMap<u64, Task>,
    rule_baselines: LookupMap<String /*rule_id*/, u64 /*Metric: metric value at last reward; Schedule: timestamp of last reward (init = `new` time)*/>,
    faults: LookupMap<String /*rule_id*/, Vec<FaultReport>>,   // active reports for Report-trigger rules; cleared when the rule's task is Rewarded
    next_fault_seq: u64,                                       // D-212
    last_session_at: LookupMap<AccountId, u64>,               // for the fault-report anti-spam check
    service: ServiceState,
    service_log: Vector<OutOfServicePeriod>,
    open_task_by_rule: LookupMap<String, u64>,
    period: RewardPeriod,

    // escalations
    next_escalation_id: u64,
    escalations: LookupMap<u64, Escalation>,
    open_escalations: u32,
    dao_proposal_bond: Option<u128>,      // cached by refresh_dao_policy
    dao_proposal_period: Option<u64>,     // cached by refresh_dao_policy (D-102)

    // outbound operations (refunds, sweeps, cash rewards, bonds)
    next_op_id: u64,
    ops: LookupMap<u64, OutboundOp>,

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
    pub rules: Vec<UpkeepRule>,
    pub protocol_fee_bps: u16,         // must be <= PROTOCOL_FEE_MAX_BPS (e.g. 200); 0 in pilot
    pub protocol_fee_receiver: Option<AccountId>,
}

// "Upkeep" generalizes maintenance (D-017): every kind of care that keeps a shared thing alive.
pub enum UpkeepKind { Maintenance, Restock, Cleaning, Inspection, Repair, Rebalance, Supervision }

pub enum Trigger {
    Metric { metric: String, threshold: u64 },   // due when telemetry[metric] - baseline >= threshold
    Schedule { every_hours: u32 },               // due when now - last_completed_at >= every_hours
    Report { min_reports: u8 },                  // due when active fault reports (distinct reporters) >= min_reports
}

pub struct UpkeepRule {
    pub rule_id: String,               // "nozzle_clean", "filament_spool", "fault_repair"
    pub kind: UpkeepKind,
    pub trigger: Trigger,
    pub title: String,
    pub reward_rights: u32,            // usage-right cards for the worker
    pub reward_cash: U128,             // optional cash from free float (<= auto_reward_cash_cap)
    pub reimbursable_max: U128,        // Restock/Repair only: max documented expense the worker may claim
    pub requires_verification_test: bool,
    pub claim_timeout_hours: u32,
}
```

JSON shape (near-sdk serde defaults): `"kind": "Restock"`, `"trigger": {"Metric": {"metric": "filament_used_mm", "threshold": 330000}}`, `{"Schedule": {"every_hours": 168}}`, `{"Report": {"min_reports": 1}}`.

Profile validation (`validate_profile`): rules unique ids, `reward_cash <= auto_reward_cash_cap`, `reimbursable_max == 0` unless kind is `Restock` or `Repair`, `deposit_trusted <= deposit`, `price_per_slot + deposit_trusted > 0` (no free deposit-free reservations, D-020), `right_validity_days <= 3650` (D-213), `protocol_fee_bps <= MAX`, `slot_minutes > 0`, `float_cap > 0`, trigger bounds (`Metric.threshold > 0` and metric id ≤ 32 chars; `Schedule.every_hours > 0`; `Report.min_reports >= 1`), non-empty strings bounded (≤ 64 chars ids, ≤ 200 titles). (`reimbursable_max` may exceed `auto_reward_cash_cap`; such expenses are paid through the DAO, see §3.3 reward procedure.)

### 2.2 Ledger

```rust
pub struct Ledger {
    pub float_free: u128,          // available operating money
    pub deposits_held: u128,       // liability to users
    pub rewards_reserved: u128,    // cash reserved for open tasks + approved expenses + failed cash/reimbursement payouts
    pub pending_in: u128,          // attached amounts of reservations awaiting authorization (D-202)
    pub protocol_fees_owed: u128,  // failed protocol-fee payouts awaiting retry (D-202)
    pub fee_refunds_owed: u128,    // out-of-service fee refunds the float could not cover yet (D-213); owed, not held — not in the invariant
    pub pending_out: u128,         // amounts in flight (refunds, sweeps, cash rewards, reimbursements, bonds, fee payouts); already debited from the balance
    pub bonds_outstanding: u128,   // bonds sent to the DAO and not yet settled (D-102); a receivable — not in the balance invariant
    pub total_fees_in: u128,
    pub total_swept: u128,
    pub total_refunded: u128,
    pub total_rewards_paid: u128,
    pub total_reimbursed: u128,
    pub total_bonds_paid: u128,
    pub total_bonds_returned: u128,
    pub total_bonds_lost: u128,
    pub total_protocol_fees: u128,
}
```

**Ledger invariant (checked in tests after every operation, exposed via `get_ledger`; D-201):**

```
env::account_balance() >= storage_reserve + float_free + deposits_held + rewards_reserved + pending_in + protocol_fees_owed
```

`pending_out` is excluded because NEAR debits a transfer (or call deposit) from the balance when the receipt is created; `bonds_outstanding` because that money sits in the DAO. If a bounced transfer's callback runs one block before its refund receipt lands, `invariant_ok` is false for that block. Unattributed balance above the storage reserve (direct transfers, gas rewards) is reconciled into `float_free` by `fund_float` and every sweep, excluding in-flight amounts and outstanding bonds (D-204); `fund_float` therefore tops up a short storage reserve first.

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
    pub protocol_fee: u128,            // part of fee_paid paid out as protocol fee (D-202)
    pub right_op_id: Option<u64>,      // latest RightRelease / RightFinalize op (D-203)
    pub storage_cost: u128,            // measured storage cost of the records; kept if Rejected (D-213)
    pub fee_refund_owed: u128,         // out-of-service fee refund not yet paid (D-213)
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
    pub epoch: u64,                    // D-206
    pub reset_pending: bool,
}
```

`report_telemetry` rejects decreasing counters (`E_TELEMETRY_NOT_MONOTONIC`) unless the DAO raised the epoch with `set_telemetry_epoch` (hardware swap): exactly the next report may decrease counters, and baselines of Metric rules on decreased metrics restart at 0 (D-206).

### 2.4a Faults and service state (D-017)

```rust
pub struct FaultReport { pub seq: u64, pub reporter: AccountId, pub note_hash: String, pub at: u64 }   // seq = reputation ref_id (D-212)

pub struct ServiceState { pub in_service: bool, pub since: u64, pub reason_hash: Option<String> }

pub struct OutOfServicePeriod {
    pub seq: u64,
    pub started_at: u64,
    pub started_by: AccountId,
    pub reason_hash: String,
    pub ended_at: Option<u64>,
    pub ended_by: Option<ServiceRestoredBy>,
}
pub enum ServiceRestoredBy { RepairRewarded { task_id: u64 }, Council { account: AccountId } }
```

Bounds: at most 32 active reports per rule (`E_INVALID_ARGS` beyond). `note_hash` is a hex sha256 (64 chars).

### 2.5 Task

```rust
pub struct Task {
    pub id: u64,
    pub rule_id: String,
    pub kind: UpkeepKind,              // copied from the rule at open time
    pub trigger: Trigger,              // copied (D-212): the baseline reset uses the trigger the task was opened for
    pub opened_by: AccountId,          // agent account (or council for manual tasks)
    pub rationale: String,             // ≤ 1000 chars, from agent
    pub due_value_at_open: u64,        // Metric: delta since baseline; Schedule: hours since last; Report: active reports
    pub manual: bool,                  // council bypassed the due check
    pub reward_rights: u32,
    pub reward_cash: u128,
    // copied from rule/profile at open time so profile changes never alter a task (D-212)
    pub reimbursable_max: u128,
    pub right_max_slots: u32,
    pub right_validity_days: u32,
    pub requires_verification_test: bool,
    pub claim_timeout_hours: u32,
    pub needs_council: bool,
    pub status: TaskStatus,
    pub claimer: Option<AccountId>,
    pub claimed_at: Option<u64>,
    pub evidence_hash: Option<String>, // hex sha256
    pub evidence_uri: Option<String>,
    pub expense: u128,                 // Restock/Repair reimbursement claimed at submit (0 if none)
    pub receipt_hash: Option<String>,  // hex sha256 of the receipt
    pub expense_state: ExpenseState,
    pub verification: Option<VerificationResult>,
    pub verifier: Option<AccountId>,
    pub council_approver: Option<AccountId>,
    pub metric_value_at_approval: Option<u64>,   // Metric triggers: the new baseline
    pub reward_state: RewardState,
    pub minted_right_ids: Vec<String>,
    pub cash_op_id: Option<u64>,
    pub reimbursement_op_id: Option<u64>,
    pub reward_started_at: Option<u64>,          // last mint call (stuck-mint retry, D-213)
    pub created_at: u64,
}

pub enum TaskStatus { Open, Claimed, Submitted, Approved, Rewarded, Rejected, Expired, Cancelled }

pub struct VerificationResult { pub passed: bool, pub details_hash: String, pub reported_at: u64 }

pub enum RewardState { NotStarted, RightsPending, CashPending, Done, Failed { reason: String } }

pub enum ExpenseState { None, Reserved, NeedsEscalation, Escalated { escalation_id: u64 }, Paid, Denied }   // Denied: the DAO voted against the reimbursement escalation (D-213)

pub struct RewardPeriod { pub started_at: u64, pub rights_minted: u32, pub rights_reserved: u32 }   // rights_reserved: promised to open tasks (D-207)
```

### 2.6 Escalation

```rust
pub struct Escalation {
    pub id: u64,
    pub requested_by: AccountId,
    pub kind: String,                  // "purchase" | "cash_reward" | "reimbursement" (D-017) | "other"
    pub receiver: AccountId,
    pub amount: u128,
    pub reason: String,
    pub task_id: Option<u64>,
    pub proposal_id: Option<u64>,
    pub status: EscalationStatus,
    pub bond_paid: u128,
    pub bond_settled: bool,            // D-102: bond moved back to float_free exactly once on the first terminal sync
    pub bond_lost: bool,               // Removed proposal or unreadable proposal id (D-210)
    pub bond_op_id: Option<u64>,
    pub dao_status: Option<String>,    // raw Sputnik status of the last sync
    pub submission_time: Option<u64>,  // Sputnik submission_time from the last sync (preferred for lazy expiry)
    pub submitted_at: u64,
}
pub enum EscalationStatus { Submitting, Submitted, Approved, Rejected, Expired, Failed }
```

### 2.7 OutboundOp

```rust
pub struct OutboundOp {
    pub id: u64,
    pub kind: OpKind,                  // Refund | Sweep | CashReward | Reimbursement | Bond | ProtocolFee | RightRelease | RightFinalize (D-203)
    pub to: AccountId,
    pub amount: u128,
    pub ref_id: Option<u64>,           // reservation / task / escalation id
    pub status: OpStatus,
    pub attempts: u32,
    pub created_at: u64,
    pub updated_at: u64,
}
```

On failure: status `Failed`, amount moves from `pending_out` back to its source bucket and the claim remains: Refund → `deposits_held`, CashReward/Reimbursement → `rewards_reserved`, Sweep/Bond → `float_free`, ProtocolFee → `protocol_fees_owed` (D-202). `retry_op(op_id)` (anyone) re-sends a `Failed` op; never a `Succeeded` or `Pending` one. A Sweep retry needs `float_free >= amount`; Bond ops are not retryable (a new escalation is the retry). `RightRelease`/`RightFinalize` are amount-0 calls to commons for a reservation's right, retried the same way (D-203).

### 2.8 Reputation

```rust
pub struct Reputation { pub sessions: u32, pub clean_returns: u32, pub damages: u32, pub upkeeps: u32, pub fault_reports: u32 }
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
| `set_profile(profile)` | DAO | — | validate; `profile_version += 1`; does not affect existing reservations/rights/tasks; event `profile_updated` A rule whose trigger kind (or Metric metric) changed restarts its baseline (D-213). |
| `set_operators(bridge_id?, agent_id?)` | DAO | — | set/clear; event `operators_updated` |
| `fund_float()` | ANY (normally DAO via proposal) | yes | adds attached to `float_free`; then maybe sweep; event `float_funded` |
| `set_telemetry_epoch(epoch)` | DAO | — | allow counter reset after hardware swap |
| `sync_roles(updates: Vec<(AccountId, Vec<Role>)>, version)` | COMMONS | — | ignore (return `false`) if `version <= roles_version`; else apply the full snapshot (≤ 100 accounts, unknown role names dropped, `[]` removes) and return `true` (D-209, D-302) |

### 3.2 Reservations

| Method | Access | Deposit | Behavior |
| :--- | :--- | :--- | :--- |
| `reserve(start_slot, slots, right_id?)` | ANY | fee + deposit (or deposit only if right) | Checks: asset in service (else `E_OUT_OF_SERVICE`), `slots <= max`, start in `[now_slot, now_slot + horizon]`, slots free, attached == expected (exact, else `E_WRONG_AMOUNT`). Hold slots with `PendingAuthorization`. Call `commons.authorize_reservation(holder, asset=self, credential=profile.required_credential, right_id, reservation_id, slots)` (D-301) → `on_authorized`. With a right the deposit is at least `MIN_RESERVATION_STORAGE_DEPOSIT` (0.01 NEAR); the measured storage cost of the new records is stored as `storage_cost` (D-213). |
| `on_authorized(reservation_id)` | private | — | Ok → `Confirmed`; fee → `float_free` (minus protocol fee op if >0); deposit → `deposits_held`; event `reservation_confirmed`; `maybe_sweep()`. Err/failed promise → release slots, status `Rejected`, refund attached via Refund op; event `reservation_rejected {reason}`. A successful call with an unreadable result is also rejected and additionally sends `release_right` (D-203). A rejection keeps `storage_cost` in `float_free` and refunds the rest (D-213). |
| `cancel_reservation(id)` | holder | — | Only `Confirmed` and before start slot. Refund fee per cancellation policy (v1: full refund if ≥ 1 slot before start, else fee kept) + full deposit; if `right_id` → `commons.release_right`. **While out of service:** any `Confirmed` reservation (its session cannot start, even inside the start window — D-212) may be cancelled with full fee + deposit refund and right release, regardless of the normal policy (`reason: "out_of_service"`). Event. Out of service the deposit is always refunded; a fee the float cannot cover becomes `fee_refund_owed`, paid by `claim_fee_refund` (D-213). |
| `mark_session_started(id)` | BRIDGE | — | Only `Confirmed`, within `[start, start + start_window]`, asset in service (`E_OUT_OF_SERVICE`). → `InSession`; `last_session_at[holder] = now`. Event. |
| `mark_session_finished(id, metrics: Vec<(String,u64)>)` | BRIDGE | — | Only `InSession`. → `Finished`; `last_session_at[holder] = now`; also applies telemetry (same rules as `report_telemetry`); if `right_id` → `commons.finalize_right`. Reputation `sessions += 1`. Event. |
| `mark_no_show(id)` | ANY | — | Only `Confirmed` after start window passed. → `NoShow`; fee kept; deposit refunded (v1 policy; log it); if right → `release_right` (right returns to Active — not consumed). Event. Out of service the fee is refunded too (or owed, as for cancel) and no `no_show` record is written (D-213). |
| `confirm_return(id, result)` | ROLE(steward), ≠ holder | — | Only `Finished`. Clean → Refund op for deposit, `Closed`, `clean_returns += 1`. Damage → `Disputed` (deposit stays in `deposits_held`). Events + reputation record. |
| `resolve_dispute(id, deduct: U128, note_hash)` | DAO | — | Only `Disputed`. `deduct <= deposit`. Deduct → `float_free`; rest → Refund op; `Closed`; `damages += 1`. Event. |
| `claim_fee_refund(id)` | ANY | — | Pays `fee_refund_owed` once `float_free` covers it (Refund op). Event `fee_refund_paid` (D-213). |
| `force_close_session(id)` | DAO | — | Only `InSession` after `end_ts + 1 h`: → `Finished` without telemetry; right finalized; reputation `sessions += 1`. Event `session_finished {forced_by_dao: true}` (D-213). |

### 3.3 Telemetry & upkeep (D-017)

| Method | Access | Behavior |
| :--- | :--- | :--- |
| `report_telemetry(metrics)` | BRIDGE | Monotonic per metric; unknown metrics allowed (≤ 16 metrics, names ≤ 32 chars). Event `telemetry_reported`. |
| `open_upkeep_task(rule_id, rationale, manual?)` | AGENT or ROLE(council) | Rule exists; no open task for rule (`E_TASK_ALREADY_OPEN`); rule **due** per its trigger (`E_RULE_NOT_DUE`): Metric → `telemetry[metric] - baseline >= threshold`; Schedule → `now - baseline_ts >= every_hours * 3600e9`; Report → active fault reports for the rule `>= min_reports` (council may bypass the due check only with `manual=true`, recorded on the task; the agent can never pass `manual`); `reward_cash <= float_free` → reserve cash (`float_free -= cash; rewards_reserved += cash`); quota pre-check `period.rights_minted + period.rights_reserved + reward_rights <= quota`, then `rights_reserved += reward_rights` (D-207) (rolling period reset when `now > started_at + period_days`). `needs_council = reward_cash > council_threshold_cash`. Event `task_opened {task_id, rule_id, kind, trigger, due_value, rationale, manual}`. |
| `annotate_task(task_id, note)` | AGENT | Append note (≤ 500 chars) — event only. |
| `claim_task(task_id)` | ANY member (any account with any role or any reputation sessions ≥ 1 — v1: any account) | Open → Claimed. Not agent/bridge. Event. |
| `unclaim_task(task_id)` | claimer, or ANY after `claim_timeout_hours` | → Open. Event. |
| `submit_task(task_id, evidence_hash, evidence_uri?, expense?: U128, receipt_hash?)` | claimer | Claimed → Submitted. `expense > 0` only for Restock/Repair rules (`E_NOT_REIMBURSABLE`), requires `receipt_hash`, and `expense <= rule.reimbursable_max` (`E_EXPENSE_CAP`). Nothing is reserved yet. Event `task_submitted {expense, receipt_hash}`. |
| `submit_verification_result(task_id, passed, details_hash)` | BRIDGE | Only Submitted. Stores result. Event. Only while the task awaits its verifier (`verifier == None`, D-213). |
| `approve_task(task_id)` | ROLE(verifier); ≠ claimer; ≠ agent; ≠ bridge | Submitted; if rule requires test → result must be `passed`. Expense handling (never from deposits): if `expense > auto_reward_cash_cap` → `expense_state = NeedsEscalation` (paid only through `escalate(kind="reimbursement", receiver=claimer, amount=expense, task_id)` → `Escalated`); else if `expense > council_threshold_cash` or `expense > float_free` → `needs_council = true` (reserve at council approval); else reserve now (`float_free -= expense; rewards_reserved += expense`, `Reserved`). If `needs_council` or (`first_task_needs_council` and claimer has 0 upkeeps) → set `verifier`, wait for `council_approve_task`. Else → **reward**. Requires prepaid gas ≥ 125 Tgas (`E_INVALID_ARGS`, D-213). |
| `council_approve_task(task_id)` | ROLE(council); ≠ claimer; ≠ verifier | After verifier approval. Reserves a pending expense from `float_free` (`E_INSUFFICIENT_FLOAT` if not enough — the DAO funds the float first). → **reward**. Requires prepaid gas ≥ 125 Tgas (D-213). |
| `reject_task(task_id, reason)` | ROLE(verifier) or ROLE(council); ≠ claimer | Submitted → Rejected; release reserved cash back to float; reopen rule (rule can be reopened by agent). Event. Resets `NeedsEscalation` → `None`; keeps baselines and fault reports (D-213). |
| `expire_task(task_id)` | ANY | Claimed past timeout → Open (same as unclaim). |
| `cancel_task(task_id, reason)` | DAO or ROLE(council) | Open/Claimed → Cancelled; releases reserved cash and rights, unblocks the rule (D-208). Event `task_cancelled`. As a false alarm it also clears the rule's fault reports and restarts its baseline (Metric → current value, Schedule → now) (D-213). |
| `close_failed_reward(task_id, reason)` | DAO | Only `Approved` with `reward_state = Failed` and no minted rights: releases reserved cash/expense/rights, unblocks the rule, task → `Cancelled`. Event `reward_closed`. Never touches minted rights (D-213). |

**Reward procedure (exactly once):**
1. Guard: `status == Approved && reward_state == NotStarted` (set `Approved` first, then start).
2. If `reward_rights > 0`: `reward_state = RightsPending`; call `commons.mint_rights(holder, group, count, validity_days, max_slots, source={asset, task_id})` → `on_rights_minted(task_id)`.
3. `on_rights_minted`: success → store token ids, `period.rights_minted += n`; then if `reward_cash > 0` → CashReward op, and if `expense_state == Reserved` → a separate Reimbursement op (`ref_id = task_id`; each moves `rewards_reserved → pending_out`) → `reward_state = CashPending` until the ops resolve (a failed op stays retryable via `retry_op` and never blocks `Rewarded`; Reimbursement op success → `expense_state = Paid`); else `Done`. Mint failure (or an unreadable mint result) → `reward_state = Failed{reason: "E_MINT_FAILED"}`; `retry_reward(task_id)` (ANY, ≥ 125 Tgas) restarts the mint only (D-212), also when the mint has been `RightsPending` for 10 minutes (its callback ran out of gas; mint is idempotent, D-213). A failed `escalate(kind="reimbursement")` submission returns the task to `NeedsEscalation`. `commons.mint_rights` must be **idempotent by `(asset, task_id)`** so a retry after an ambiguous failure never double-mints.
4. On `Done`: `status = Rewarded`; reset the rule's baseline per trigger (Metric → metric value at approval; Schedule → `now`; Report → clear the rule's active fault reports); clear `open_task_by_rule`; reputation `upkeeps += 1`; if the task kind is `Repair` and the asset is out of service → back in service, close the open `OutOfServicePeriod` with `RepairRewarded{task_id}`, event `service_restored`; events `task_rewarded`, `reputation_recorded`.

**Faults and service (D-017):**

| Method | Access | Behavior |
| :--- | :--- | :--- |
| `report_fault(rule_id?, note_hash)` | ANY account with `last_session_at` within the last 14 days (`E_NO_RECENT_SESSION`) | `rule_id` defaults to the profile's first `Report`-trigger rule (`E_RULE_NOT_FOUND` if none / not a Report rule). One active report per account per rule (`E_ALREADY_REPORTED`). Not agent/bridge. Reputation `fault_reports += 1`. Event `fault_reported {rule_id, reporter, note_hash, active_reports}`. |
| `set_out_of_service(out: bool, reason_hash)` | `out=true`: ROLE(steward) or ROLE(council) or DAO. `out=false`: ROLE(council) or DAO only | `true` → `in_service=false`, opens an `OutOfServicePeriod`; event `out_of_service`. `false` → closes the period with `Council{account}`; event `service_restored`. The other path back to service is a Rewarded Repair task (above). While out of service: `reserve` and `mark_session_started` fail with `E_OUT_OF_SERVICE`, `can_access` returns `ok=false, reason="out_of_service"`, future Confirmed reservations can be cancelled with a full refund. |

### 3.4 Money ops

| Method | Access | Behavior |
| :--- | :--- | :--- |
| `sweep()` | ANY | If `float_free > float_cap` → Sweep op of the excess to `dao_id`. Also called internally after inflows. Event `swept`. |
| `retry_op(op_id)` | ANY | Only `Failed` ops. |
| `on_op_result(op_id)` | private | Success → `Succeeded`, totals updated. Failure → `Failed`, amount returned to source bucket. Event `op_result`. |

### 3.5 Escalations

| Method | Access | Behavior |
| :--- | :--- | :--- |
| `escalate(kind, receiver, amount, reason, task_id?)` (`kind="reimbursement"` requires `task_id` of a task with `expense_state == NeedsEscalation`, `receiver == claimer`, `amount == expense`; sets `Escalated`) | AGENT or ROLE(council) | Max open escalations (e.g. 3). Bond = DAO `proposal_bond` exactly (cached via `refresh_dao_policy`; a wrong bond fails with `ERR_MIN_BOND` and the callback handles it) taken from `float_free` (must be available, else `E_INSUFFICIENT_FLOAT`). Bond op. Call `dao.add_proposal({description, kind: Transfer{token_id:"", receiver_id, amount}})` with bond attached → `on_escalation_submitted(id)`. Description format: `"COMMONKIT escalation <asset>#<id>: <reason>"`. A reimbursement also requires the task `Approved` or `Rewarded` (D-213). |
| `on_escalation_submitted(id)` | private | Success → parse proposal id, `Submitted`. Failure → `Failed`, bond returned to `float_free`. |
| `sync_escalation(id)` | ANY | Calls `dao.get_proposal(proposal_id)` → `on_escalation_synced` maps status (D-102): `Approved` → Approved; `Rejected` → Rejected; `InProgress` past `submitted_at + proposal_period` → Expired (Sputnik expiry is lazy; the bond only returns after a council `act_proposal(id, "Finalize")`); `Moved`/`Failed` → Failed; a failed `get_proposal` (a `Removed` proposal is deleted) → Rejected with the bond lost. On the first transition to Approved/Rejected(not removed)/Expired: `bonds_outstanding -= bond`, `float_free += bond`, `bond_settled = true` (exactly once; the DAO refunds the bond as a plain transfer). Removed → `bonds_outstanding -= bond`, `bond_settled = true`, nothing credited. `Failed`/`Moved` settle the bond as spent (`bonds_outstanding -= bond`, nothing credited; a later refund is reconciled, D-204). Reimbursement outcomes update the task: Approved → `Paid`, Rejected by vote → `Denied`, Expired/Failed/Moved/Removed → `NeedsEscalation` (D-213). |
| `refresh_dao_policy()` | ANY | Calls `dao.get_policy()` → caches `proposal_bond` and `proposal_period`. |

(See RESEARCH C8 fallback if contracts cannot add proposals.)

### 3.6 Views

`get_profile`, `get_wiring` (dao, commons, bridge, agent, versions), `get_ledger` (+ balance, storage usage, byte cost, invariant_ok: bool), `get_reservation(id)`, `get_reservations(from_index, limit)`, `get_reservations_by_holder(account, from, limit)`, `get_slot_owner(slot)`, `get_availability(from_slot, count)`, `can_access(account, reservation_id) -> AccessCheck {ok, reason, window_start, window_end}`, `get_telemetry`, `get_rule_status() -> Vec<{rule_id, kind, trigger, current: U64, baseline: U64, due_value: U64, due: bool, next_due_estimate: Option<U64>, open_task, reward_rights, reward_cash, reimbursable_max}>` (`current`: Metric value / hours since last reward / active reports; `next_due_estimate`: Schedule only, ns timestamp), `get_faults(rule_id?) -> Vec<{rule_id, reports}>`, `get_service_status() -> ServiceState`, `get_service_log(from, limit)`, `get_last_session_at(account) -> Option<U64>`, `get_task(id)`, `get_tasks(from, limit, status?)`, `get_escalation(id)`, `get_escalations(from, limit)`, `get_op(id)`, `get_ops(from, limit, status?)`, `get_reputation(account)`, `get_reputation_log(from, limit)`, `get_period()`, `get_roles(account)`, `version()`.

`can_access` returns `ok=true` only if: asset in service, reservation `Confirmed` (or `InSession` for resumption), `holder == account`, now within the start window (or session active), and — if credential required — it was authorized at reservation time.

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
    tokens_by_owner: LookupMap<AccountId, Vec<String>>,   // cards are never moved or burned (D-303)
    mint_receipts: LookupMap<String /*"asset:task_id" or "training:id"*/, Vec<String>>,  // idempotency
    next_token_seq: u64,
    metadata: NftContractMetadata,                // NEP-177
}

pub struct AssetEntry { pub group_id: GroupId, pub active: bool, pub registered_at: U64 }

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
    Credential { kind: CredentialKind, issued_by_training: U64, suspended: bool },
}
pub enum RightSource { Maintenance { asset: AccountId, task_id: U64 }, Training { training_id: U64 } }
pub enum RightStatus { Active, Locked { asset: AccountId, reservation_id: U64 }, Consumed { asset: AccountId, reservation_id: U64 } }

pub struct Card {
    pub token_id: String,                  // "right-<seq>" | "cred-<seq>"
    pub owner_id: AccountId,
    pub kind: CardKind,
    pub issued_at: U64,
    pub expires_at: Option<U64>,
}

pub struct Training {
    pub id: U64, pub trainer: AccountId, pub trainee: AccountId, pub kind: CredentialKind,
    pub notes_hash: Option<String>, pub status: TrainingStatus, pub approver: Option<AccountId>,
    pub minted: Vec<String>, pub created_at: U64,
}
pub enum TrainingStatus { Proposed, Approved, Rejected }
```

Stored ids/timestamps that are exposed in JSON are `U64` (strings). JSON tags: `CardKind` → `{"type":"UsageRight"|"Credential", ...}`, `RightSource` → `{"type":"Maintenance"|"Training", ...}`, `RightStatus` → `{"state":"Active"|"Locked"|"Consumed", ...}` (types in `commonkit_types::commons_iface`, D-301). Limits: `MAX_ROLE_ACCOUNTS = 100` (v1 limit: removed accounts stay as `[]` tombstones and keep counting, D-213), ids `[a-z0-9_-]{1,64}`, titles ≤ 200, reasons ≤ 500, hashes hex ≤ 128, validity ≤ 3650 days.

## 5. `commons` — methods

| Method | Access | Behavior |
| :--- | :--- | :--- |
| `new(dao_id, name, metadata)` | init | — |
| `register_asset(asset_id, group_id)` | DAO | Add to group (re-registering an existing asset re-activates it and may move it to another group; issued cards keep their group); then push current full role set to the new asset via `sync_roles`. Event. |
| `deactivate_asset(asset_id)` | DAO | New reservations/mints rejected; existing rights untouched. |
| `set_roles(account, roles)` | DAO | Validate role names; `roles_version += 1`; push `sync_roles(<full snapshot>, version)` to **every active asset** (fire-and-forget + callback logging failures as `role_sync_failed` events; `resync_roles(asset)` ANY re-pushes the full set). The snapshot lists every account that ever held a role (removed accounts with `[]`), so an asset that ignores `version <= roles_version` never loses an update (D-302). |
| `set_credential_kind(config)` | DAO | Upsert. Changing config never alters issued cards. |
| `suspend_credential(token_id, reason)` / `unsuspend_credential(token_id, reason)` | DAO | Forward-looking only; event with reason. On a usage right → `E_NO_REVOCATION`. |
| `resync_roles(asset_id)` | ANY | Re-push the current full snapshot to an active asset. |
| `on_roles_synced(asset_id, version)` | private | Failure → event `role_sync_failed`. Pushes that do not fit in the remaining gas emit `role_sync_failed {reason: insufficient_gas}` instead of being scheduled. |
| `fund_storage()` | ANY, payable | Adds to the commons balance (storage). Event `storage_funded`. |
| `authorize_reservation(holder, asset, credential?, right_id?, reservation_id, slots)` | registered asset == predecessor == `asset` | Returns `AuthResult { ok, reason, credential_token_id, locked_right_id }` (does **not** panic on business failures — returns `ok=false` so the asset can refund cleanly; a deactivated asset gets `ok=false, E_ASSET_NOT_REGISTERED`). Checks credential card held, not suspended, not expired. If `right_id`: owner == holder, UsageRight, `Active`, not expired, group contains asset, `slots <= max_slots` → `Locked{asset, reservation_id}` (D-301). |
| `release_right(token_id, reservation_id)` | asset that locked it | Locked{caller, reservation_id} → Active; returns `true`. Already `Active` → no-op, returns `false` (safe retry). Anything else → `E_BAD_STATE`. |
| `finalize_right(token_id, reservation_id)` | asset that locked it | Locked{caller, reservation_id} → Consumed; returns `true`. Already `Consumed{caller, reservation_id}` → no-op, returns `false`. Anything else → `E_BAD_STATE`. |
| `mint_rights(holder, count, max_slots, validity_days, source)` | registered active asset == `source.asset` | **Idempotent** on `mint_receipts[asset:task_id]`: if present, return the stored ids. Else mint `count` (1..=10) UsageRight cards in the group the asset is registered in (commons is the source of truth; any `group` arg is ignored — D-301); event `nft_mint` (NEP-171 format) + `rights_minted`. |
| `propose_credential(trainee, kind, notes_hash?)` | ROLE(trainer); trainer ≠ trainee | Kind must exist. Creates Training; returns its id. Event. |
| `approve_credential(training_id)` | ROLE(verifier); ≠ trainer; ≠ trainee | Mint credential card to trainee + `trainer_reward_rights` UsageRight cards to trainer (group = kind.reward_group), idempotent by `training:id` (a repeat returns the stored ids). Returns all minted ids. Events. |
| `reject_credential(training_id, reason)` | ROLE(verifier); ≠ trainer | Proposed → Rejected. Event with reason. |

### 5.1 NEP-171 / 177 / 181 surface (non-transferable)

- `nft_token(token_id)`, `nft_tokens(from_index, limit)`, `nft_supply_for_owner`, `nft_tokens_for_owner(account_id, from_index, limit)`, `nft_total_supply`, `nft_metadata()`.
- `nft_transfer`, `nft_transfer_call`, `nft_approve`, `nft_revoke`, `nft_revoke_all` → `env::panic_str("E_NON_TRANSFERABLE: COMMONKIT cards cannot be transferred")`. They take no arguments (any args are ignored) so the panic is the same whatever a wallet sends. `nft_is_approved` → `false`; `approved_account_ids` is always `{}`.
- Token metadata (computed at view time, never stored): title (`"<name> · <group_id> access"`, `"Laser safety credential"` from the kind id), description incl. source, `media` = base64 SVG data URI (< 2 KB; status colour), `issued_at`/`expires_at` in ms, `copies = 1`, `extra` = JSON of status (`kind`, `status`/`suspended`, `expired`).
- Mint events in NEP-171 `nft_mint` format so explorers/wallets index them.

### 5.2 Views

`get_wiring()`, `get_assets(from?, limit?)`, `get_asset(asset_id)`, `get_group(group_id)`, `get_groups()`, `get_roles(account)`, `get_all_roles(from, limit)` (includes `[]` tombstones), `get_credential_kinds`, `get_training(id)`, `get_trainings(from, limit)`, `has_credential(account, kind) -> bool`, `get_cards_for_owner(account)` / `get_card(token_id)` (typed, richer than NEP-171; card fields flattened + `expired`), `get_mint_receipt(key)`, `version()`.

---

## 6. Slot math

`slot = floor(timestamp_ns / (slot_minutes * 60 * 1e9))`. Reservations cover `[start_slot, start_slot + slots)`. `slot_index` maps each held slot → reservation id. Holding is atomic within the `reserve` call; release on `Rejected`, `Cancelled`, `NoShow`. Finished/Closed reservations keep their slots (history) — fine because they are in the past.

## 7. Fee math

`fee = price_per_slot * slots`. `deposit = trusted ? deposit_trusted : deposit` where `trusted = reputation.clean_returns >= trusted_after`. With a right: `fee = 0`, `slots <= card.max_slots`. Protocol fee: `fee * bps / 10_000` → ProtocolFee op to `protocol_fee_receiver` (skip if 0).

## 8. Gas & deposits

- Named constants (final, measured in the sandbox against the real Sputnik WASM — D-214). Static gas that is not burnt is refunded, so the constants keep ≥ 5× headroom over the measured burn:

  | Constant | Value | Burnt (measured) | Used for |
  | :--- | ---: | ---: | :--- |
  | `GAS_AUTHORIZE` (commons_iface) | 15 Tgas | 1.7 | `commons.authorize_reservation` |
  | `GAS_ON_AUTHORIZED` | 75 Tgas | 3.3 | callback; may create 2 ops (refund + right release, or protocol fee + sweep) |
  | `GAS_MINT` (commons_iface) | 30 Tgas | 2.8 (2 cards) | `commons.mint_rights` |
  | `GAS_ON_MINTED` | 70 Tgas | 4.1 | callback; may create CashReward + Reimbursement ops (2 × 25 + 20) |
  | `GAS_ON_OP_RESULT` | 25 Tgas | 2.1–3.4 | every op callback; may finish a reward |
  | `GAS_RELEASE_RIGHT` / `GAS_FINALIZE_RIGHT` (commons_iface) | 10 Tgas | 1.9 | right sync ops |
  | `GAS_ADD_PROPOSAL` | 30 Tgas | 2.1 | `dao.add_proposal` |
  | `GAS_ON_ESCALATION_SUBMITTED` | 15 Tgas | 2.5 | callback |
  | `GAS_DAO_VIEW` / `GAS_ON_DAO_VIEW` | 15 / 20 Tgas | 1.8 / 2.3 | `get_policy`, `get_proposal` + callbacks |
  | commons `GAS_SYNC_ROLES` / `GAS_ON_ROLES_SYNCED` | 20 / 5 Tgas | 3.0 / 1.5 | role push per asset |

- Recommended attached gas for callers (scripts, bridge, agent, web): `reserve` 120 Tgas; `cancel_reservation`, `mark_no_show`, `confirm_return`, `resolve_dispute`, `claim_fee_refund`, `retry_op`, `fund_float`, `sweep`, `reject_task`, `cancel_task` 60 Tgas; `approve_task`, `council_approve_task`, `retry_reward` ≥ 125 Tgas (enforced, `E_INVALID_ARGS`); `escalate` 60 Tgas; `sync_escalation`, `refresh_dao_policy` 50 Tgas; other methods 30 Tgas. A DAO `set_roles` action needs `10 + 25 × active_assets` Tgas (D-303); vote with 300 Tgas.
- Storage for new records is paid from the asset's `storage_reserve` (profile) — the reserve must be sized after measuring (research B10). `get_ledger` reports `storage_usage * byte_cost` vs `storage_reserve`; verify.sh fails if usage exceeds 80% of reserve.
- `commons` storage: paid by its own balance funded at deployment by the DAO (`fund_storage()` payable).

## 9. Events (NEP-297, `standard: "commonkit"`)

`asset`: `profile_updated`, `operators_updated`, `roles_synced`, `float_funded`, `reservation_pending`, `reservation_confirmed`, `reservation_rejected`, `reservation_cancelled`, `session_started`, `session_finished`, `no_show`, `return_confirmed`, `dispute_opened`, `dispute_resolved`, `telemetry_reported`, `fault_reported`, `out_of_service`, `service_restored`, `task_opened` (with `kind`), `task_annotated`, `task_claimed`, `task_unclaimed`, `task_submitted`, `verification_reported`, `task_approved`, `task_council_approved`, `task_rejected`, `task_rewarded`, `reward_failed`, `op_created`, `op_result`, `swept`, `escalation_created`, `escalation_submitted`, `escalation_synced`, `reputation_recorded`; added by D-2nn: `op_retried`, `rights_received`, `task_cancelled`, `telemetry_epoch_set`, `dao_policy_refreshed`, `expense_state_changed`, `fee_refund_paid`, `reward_closed`. Envelope: `EVENT_JSON:{"standard":"commonkit","version":"1.0.0","event":…,"data":[{…}]}` (one-element array, D-301); ids and amounts inside `data` are strings.

`commons`: `asset_registered`, `asset_deactivated`, `roles_set`, `role_sync_failed`, `credential_kind_set`, `training_proposed`, `training_approved`, `training_rejected`, `credential_suspended`, `credential_unsuspended`, `right_locked`, `right_released`, `right_consumed`, `rights_minted`, `storage_funded`, plus NEP-171 `nft_mint` (standard `nep171`, version `1.0.0`, `memo` = mint receipt key).

Each event `data` includes the ids needed to link it (reservation_id, task_id, token_ids, op_id, proposal_id, account).

## 10. Error codes

`E_UNAUTHORIZED`, `E_NOT_DAO`, `E_NOT_COMMONS`, `E_NOT_BRIDGE`, `E_NOT_AGENT`, `E_MISSING_ROLE`, `E_SELF_VERIFY`, `E_INVALID_PROFILE`, `E_WRONG_AMOUNT`, `E_SLOT_TAKEN`, `E_SLOT_OUT_OF_RANGE`, `E_TOO_MANY_SLOTS`, `E_BAD_STATE`, `E_WINDOW_CLOSED`, `E_TELEMETRY_NOT_MONOTONIC`, `E_RULE_NOT_FOUND`, `E_RULE_NOT_DUE`, `E_TASK_ALREADY_OPEN`, `E_QUOTA_EXCEEDED`, `E_CASH_CAP_EXCEEDED`, `E_INSUFFICIENT_FLOAT`, `E_TOO_MANY_ESCALATIONS`, `E_OP_NOT_RETRYABLE`, `E_ALREADY_REWARDED`, `E_NON_TRANSFERABLE`, `E_RIGHT_NOT_ACTIVE`, `E_RIGHT_WRONG_GROUP`, `E_RIGHT_EXPIRED`, `E_CREDENTIAL_MISSING`, `E_ASSET_NOT_REGISTERED`, `E_OUT_OF_SERVICE`, `E_NO_RECENT_SESSION`, `E_ALREADY_REPORTED`, `E_NOT_REIMBURSABLE`, `E_EXPENSE_CAP`, `E_INVALID_ARGS` (malformed or out-of-bounds argument; also too little prepaid gas for a reward), `E_LEDGER` (internal ledger underflow/overflow — a bug; aborts), `E_MINT_FAILED` / `E_TRANSFER_FAILED` (reasons in `reward_failed` events, D-213), `E_NOT_FOUND` (unknown token/training id), `E_NO_REVOCATION` (any attempt path that would revoke a right — there must be **no method** that does it; this code is used by guard functions).

## 11. Deployment & keylessness

1. Create account (sub-account of the community root), fund it (storage + initial nothing else).
2. Deploy WASM with `new(...)` init in the same transaction where possible.
3. Delete the full-access key. **Verify** `view_access_key_list` is empty → record in `deployments/testnet.json` with `code_hash`.
4. All further changes only through DAO proposals.
5. No upgrade method in v1 (immutable). Record in DECISIONS (trade-off: bug fix = redeploy to a new account + DAO re-registration).

## 12. Required test coverage (see TEST_PLAN for the matrix)

Every method: happy path + each access-control failure + each state failure. Every invariant in CLAUDE.md §4 has a dedicated test name prefixed `inv_`.
