/**
 * JSON shapes returned by the contract views in docs/CONTRACT_SPEC.md (§2, §3.6, §4, §5.2),
 * as they arrive over RPC (serde_json):
 *  - u128 amounts and u64 ids/timestamps/counters are strings (U128 / U64),
 *  - u32 / u16 are numbers,
 *  - unit enum variants are strings, data-carrying variants are `{ Variant: {...} }`,
 *  - Rust tuples are JSON arrays.
 * When packages/sdk publishes its types (M7), these must be replaced by re-exports from it.
 */

export type U128 = string;
export type U64 = string;
export type AccountId = string;
export type GroupId = string;
export type CredentialKind = string;
export type Role = 'steward' | 'verifier' | 'trainer' | 'council';

// ---------- asset §2.1 ----------
export interface MaintenanceRule {
  rule_id: string;
  metric: string;
  threshold: U64;
  title: string;
  reward_rights: number;
  reward_cash: U128;
  requires_verification_test: boolean;
  claim_timeout_hours: number;
}

export interface Profile {
  asset_type: string;
  display_name: string;
  group_id: GroupId;
  adapter: string;
  usage_unit_label: string;
  slot_minutes: number;
  max_slots_per_reservation: number;
  booking_horizon_days: number;
  price_per_slot: U128;
  deposit: U128;
  deposit_trusted: U128;
  trusted_after: number;
  required_credential: CredentialKind | null;
  float_cap: U128;
  storage_reserve: U128;
  auto_reward_cash_cap: U128;
  council_threshold_cash: U128;
  period_days: number;
  period_reward_quota: number;
  right_max_slots: number;
  right_validity_days: number;
  first_task_needs_council: boolean;
  start_window_minutes: number;
  rules: MaintenanceRule[];
  protocol_fee_bps: number;
  protocol_fee_receiver: AccountId | null;
}

/** `get_wiring` — dao, commons, bridge, agent, versions. */
export interface Wiring {
  dao_id: AccountId;
  commons_id: AccountId;
  bridge_id: AccountId | null;
  agent_id: AccountId | null;
  profile_version: number;
  roles_version: U64;
}

// ---------- asset §2.2 ----------
export interface Ledger {
  float_free: U128;
  deposits_held: U128;
  rewards_reserved: U128;
  pending_out: U128;
  total_fees_in: U128;
  total_swept: U128;
  total_refunded: U128;
  total_rewards_paid: U128;
  total_bonds_paid: U128;
  total_protocol_fees: U128;
}

/** `get_ledger` — Ledger + balance, storage usage, byte cost, invariant flag. */
export interface LedgerView extends Ledger {
  account_balance: U128;
  storage_reserve: U128;
  storage_usage: U64;
  storage_byte_cost: U128;
  invariant_ok: boolean;
}

// ---------- asset §2.3 ----------
export type ReservationStatus =
  | 'PendingAuthorization'
  | 'Confirmed'
  | 'InSession'
  | 'Finished'
  | 'Closed'
  | 'Disputed'
  | 'Cancelled'
  | 'Rejected'
  | 'NoShow';

export type ReturnResult = 'Clean' | { Damage: { note_hash: string } };

export interface Reservation {
  id: U64;
  holder: AccountId;
  start_slot: U64;
  slots: number;
  fee_paid: U128;
  deposit_paid: U128;
  right_id: string | null;
  status: ReservationStatus;
  created_at: U64;
  session_started_at: U64 | null;
  session_finished_at: U64 | null;
  metrics_delta: [string, U64][] | null;
  return_result: ReturnResult | null;
}

/** `can_access(account, reservation_id)` */
export interface AccessCheck {
  ok: boolean;
  reason: string;
  window_start: U64;
  window_end: U64;
}

// ---------- asset §2.4 ----------
export interface Telemetry {
  metrics: [string, U64][];
  updated_at: U64;
  reports: U64;
}

/** One element of `get_rule_status()`. */
export interface RuleStatus {
  rule_id: string;
  metric: string;
  value: U64;
  baseline: U64;
  threshold: U64;
  due: boolean;
  open_task: U64 | null;
}

// ---------- asset §2.5 ----------
export type TaskStatus =
  | 'Open'
  | 'Claimed'
  | 'Submitted'
  | 'Approved'
  | 'Rewarded'
  | 'Rejected'
  | 'Expired'
  | 'Cancelled';

export interface VerificationResult {
  passed: boolean;
  details_hash: string;
  reported_at: U64;
}

export type RewardState =
  | 'NotStarted'
  | 'RightsPending'
  | 'CashPending'
  | 'Done'
  | { Failed: { reason: string } };

export interface Task {
  id: U64;
  rule_id: string;
  opened_by: AccountId;
  rationale: string;
  metric_value_at_open: U64;
  reward_rights: number;
  reward_cash: U128;
  needs_council: boolean;
  status: TaskStatus;
  claimer: AccountId | null;
  claimed_at: U64 | null;
  evidence_hash: string | null;
  evidence_uri: string | null;
  verification: VerificationResult | null;
  verifier: AccountId | null;
  council_approver: AccountId | null;
  reward_state: RewardState;
  minted_right_ids: string[];
  created_at: U64;
}

export interface RewardPeriod {
  started_at: U64;
  rights_minted: number;
}

// ---------- asset §2.6 ----------
export type EscalationStatus = 'Submitting' | 'Submitted' | 'Approved' | 'Rejected' | 'Expired' | 'Failed';

export interface Escalation {
  id: U64;
  requested_by: AccountId;
  kind: 'purchase' | 'cash_reward' | 'other';
  receiver: AccountId;
  amount: U128;
  reason: string;
  task_id: U64 | null;
  proposal_id: U64 | null;
  status: EscalationStatus;
  bond_paid: U128;
}

// ---------- asset §2.7 ----------
export type OpKind = 'Refund' | 'Sweep' | 'CashReward' | 'Bond' | 'ProtocolFee';
export type OpStatus = 'Pending' | 'Succeeded' | 'Failed';

export interface OutboundOp {
  id: U64;
  kind: OpKind;
  to: AccountId;
  amount: U128;
  ref_id: U64 | null;
  status: OpStatus;
  attempts: number;
}

// ---------- asset §2.8 ----------
export interface Reputation {
  sessions: number;
  clean_returns: number;
  damages: number;
  maintenances: number;
}

export interface ReputationRecord {
  seq: U64;
  account: AccountId;
  kind: string;
  ref_id: U64;
  at: U64;
}

// ---------- commons §4 ----------
export interface AssetEntry {
  group_id: GroupId;
  active: boolean;
  registered_at: U64;
}

export interface CredentialKindConfig {
  kind: CredentialKind;
  title: string;
  validity_days: number;
  reward_group: GroupId;
  trainer_reward_rights: number;
  right_max_slots: number;
  right_validity_days: number;
}

export type RightSource =
  | { Maintenance: { asset: AccountId; task_id: U64 } }
  | { Training: { training_id: U64 } };

export type RightStatus =
  | 'Active'
  | { Locked: { asset: AccountId; reservation_id: U64 } }
  | { Consumed: { asset: AccountId; reservation_id: U64 } };

export type CardKind =
  | { UsageRight: { group_id: GroupId; max_slots: number; source: RightSource; status: RightStatus } }
  | { Credential: { kind: CredentialKind; issued_by_training: U64; suspended: boolean } };

export interface Card {
  token_id: string;
  owner_id: AccountId;
  kind: CardKind;
  issued_at: U64;
  expires_at: U64 | null;
}

export type TrainingStatus = 'Proposed' | 'Approved' | 'Rejected';

export interface Training {
  id: U64;
  trainer: AccountId;
  trainee: AccountId;
  kind: CredentialKind;
  notes_hash: string | null;
  status: TrainingStatus;
  approver: AccountId | null;
  minted: string[];
  created_at: U64;
}
