/**
 * JSON shapes returned by the deployed contract views (contracts/asset/src/views.rs,
 * contracts/commons/src/views.rs; checked against testnet on 2026-11-10):
 *  - U128 / U64 wrappers are strings; raw u64 fields (trigger thresholds, metric counters in
 *    tuples, `due_value_at_open`) are JSON numbers; u32 / u16 are numbers,
 *  - asset enums are externally tagged (`"Unit"` or `{ Variant: {...} }`),
 *  - commons `CardKind` / `RightSource` are tagged by `type`, `RightStatus` by `state`,
 *  - `#[serde(flatten)]` views (`CardView`, `AssetView`) arrive as one flat object.
 * Read every u64/u128 through BigInt(); `U64Num` covers fields that are numbers on chain.
 */

export type U128 = string;
export type U64 = string;
/** A raw u64 on chain: a JSON number (exact below 2^53, which these counters stay under). */
export type U64Num = number | string;
export type AccountId = string;
export type GroupId = string;
export type CredentialKind = string;
export type Role = 'steward' | 'verifier' | 'trainer' | 'council';

// ---------- asset §2.1 (D-017: maintenance → upkeep) ----------
export const UPKEEP_KINDS = ['Maintenance', 'Restock', 'Cleaning', 'Inspection', 'Repair', 'Rebalance', 'Supervision'] as const;
export type UpkeepKind = (typeof UPKEEP_KINDS)[number];

export type Trigger =
  | { Metric: { metric: string; threshold: number } }
  | { Schedule: { every_hours: number } }
  | { Report: { min_reports: number } };

export interface UpkeepRule {
  rule_id: string;
  kind: UpkeepKind;
  trigger: Trigger;
  title: string;
  reward_rights: number;
  reward_cash: U128;
  /** Restock/Repair only: max documented expense the worker may claim. */
  reimbursable_max: U128;
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
  rules: UpkeepRule[];
  protocol_fee_bps: number;
  protocol_fee_receiver: AccountId | null;
}

/** asset `get_wiring` */
export interface Wiring {
  dao_id: AccountId;
  commons_id: AccountId;
  bridge_id: AccountId | null;
  agent_id: AccountId | null;
  profile_version: number;
  roles_version: U64;
  telemetry_epoch: U64;
  dao_proposal_bond: U128 | null;
  dao_proposal_period: U64 | null;
  open_escalations: number;
}

// ---------- asset §2.2 ----------
/** asset `get_ledger` */
export interface LedgerView {
  float_free: U128;
  deposits_held: U128;
  rewards_reserved: U128;
  pending_in: U128;
  protocol_fees_owed: U128;
  fee_refunds_owed: U128;
  pending_out: U128;
  bonds_outstanding: U128;
  total_fees_in: U128;
  total_swept: U128;
  total_refunded: U128;
  total_rewards_paid: U128;
  total_reimbursed: U128;
  total_bonds_paid: U128;
  total_bonds_returned: U128;
  total_bonds_lost: U128;
  total_protocol_fees: U128;
  float_cap: U128;
  storage_reserve: U128;
  balance: U128;
  storage_usage: U64;
  storage_byte_cost: U128;
  storage_cost: U128;
  invariant_ok: boolean;
  storage_ok: boolean;
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
  protocol_fee: U128;
  deposit_paid: U128;
  right_id: string | null;
  status: ReservationStatus;
  created_at: U64;
  session_started_at: U64 | null;
  session_finished_at: U64 | null;
  metrics_delta: [string, number][] | null;
  return_result: ReturnResult | null;
  right_op_id: U64 | null;
  storage_cost: U128;
  fee_refund_owed: U128;
}

/** One element of `get_availability(from_slot, count)`. */
export interface SlotInfo {
  slot: U64;
  reservation_id: U64 | null;
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
  metrics: [string, number][];
  updated_at: U64;
  reports: U64;
  epoch: U64;
  reset_pending: boolean;
}

/**
 * One element of `get_rule_status()`. `current`: Metric value / hours since last reward /
 * active fault reports. `next_due_estimate`: Schedule only, ns timestamp.
 */
export interface RuleStatus {
  rule_id: string;
  kind: UpkeepKind;
  trigger: Trigger;
  current: U64;
  /** Metric: value at last reward; Schedule: ns timestamp of last reward; Report: 0. */
  baseline: U64;
  /** Metric: delta since baseline; Schedule: hours since last; Report: active reports. */
  due_value: U64;
  due: boolean;
  next_due_estimate: U64 | null;
  open_task: U64 | null;
  reward_rights: number;
  reward_cash: U128;
  reimbursable_max: U128;
}

// ---------- asset §2.4a ----------
export interface FaultReport {
  seq: U64;
  reporter: AccountId;
  note_hash: string;
  at: U64;
}

/** One element of `get_faults(rule_id?)`. */
export interface RuleFaults {
  rule_id: string;
  reports: FaultReport[];
}

export interface ServiceState {
  in_service: boolean;
  since: U64;
  reason_hash: string | null;
}

export type ServiceRestoredBy = { RepairRewarded: { task_id: U64 } } | { Council: { account: AccountId } };

export interface OutOfServicePeriod {
  seq: U64;
  started_at: U64;
  started_by: AccountId;
  reason_hash: string;
  ended_at: U64 | null;
  ended_by: ServiceRestoredBy | null;
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

export type ExpenseState = 'None' | 'Reserved' | 'NeedsEscalation' | { Escalated: { escalation_id: U64 } } | 'Paid' | 'Denied';

export interface Task {
  id: U64;
  rule_id: string;
  kind: UpkeepKind;
  trigger: Trigger;
  opened_by: AccountId;
  manual: boolean;
  rationale: string;
  /** Metric: delta since baseline; Schedule: hours since last; Report: active reports. */
  due_value_at_open: U64Num;
  reward_rights: number;
  reward_cash: U128;
  reimbursable_max: U128;
  right_max_slots: number;
  right_validity_days: number;
  requires_verification_test: boolean;
  claim_timeout_hours: number;
  needs_council: boolean;
  status: TaskStatus;
  claimer: AccountId | null;
  claimed_at: U64 | null;
  evidence_hash: string | null;
  evidence_uri: string | null;
  expense: U128;
  receipt_hash: string | null;
  expense_state: ExpenseState;
  verification: VerificationResult | null;
  verifier: AccountId | null;
  council_approver: AccountId | null;
  metric_value_at_approval: number | null;
  reward_state: RewardState;
  minted_right_ids: string[];
  cash_op_id: U64 | null;
  reimbursement_op_id: U64 | null;
  reward_started_at: U64 | null;
  created_at: U64;
}

export interface RewardPeriod {
  started_at: U64;
  rights_minted: number;
  rights_reserved: number;
}

// ---------- asset §2.6 ----------
export type EscalationStatus = 'Submitting' | 'Submitted' | 'Approved' | 'Rejected' | 'Expired' | 'Failed';

export interface Escalation {
  id: U64;
  requested_by: AccountId;
  /** "purchase" | "cash_reward" | "reimbursement" | "other" */
  kind: string;
  receiver: AccountId;
  amount: U128;
  reason: string;
  task_id: U64 | null;
  proposal_id: U64 | null;
  status: EscalationStatus;
  bond_paid: U128;
  bond_op_id: U64 | null;
  bond_settled: boolean;
  bond_lost: boolean;
  submission_time: U64 | null;
  dao_status: string | null;
  submitted_at: U64;
}

// ---------- asset §2.7 ----------
export type OpKind = 'Refund' | 'Sweep' | 'CashReward' | 'Reimbursement' | 'Bond' | 'ProtocolFee' | 'RightRelease' | 'RightFinalize';
export type OpStatus = 'Pending' | 'Succeeded' | 'Failed';

export interface OutboundOp {
  id: U64;
  kind: OpKind;
  to: AccountId;
  amount: U128;
  ref_id: U64 | null;
  status: OpStatus;
  attempts: number;
  created_at: U64;
  updated_at: U64;
}

// ---------- asset §2.8 ----------
export interface Reputation {
  sessions: number;
  clean_returns: number;
  damages: number;
  upkeeps: number;
  fault_reports: number;
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

/** commons `get_assets` element (AssetEntry flattened next to the id). */
export interface AssetView extends AssetEntry {
  asset_id: AccountId;
}

/** commons `get_all_roles` element. */
export interface RoleEntry {
  account_id: AccountId;
  roles: string[];
}

/** commons `get_wiring` */
export interface CommonsWiring {
  dao_id: AccountId;
  name: string;
  roles_version: U64;
  next_training_id: U64;
  next_token_seq: U64;
  total_supply: U64;
  version: string;
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
  | { type: 'Maintenance'; asset: AccountId; task_id: U64 }
  | { type: 'Training'; training_id: U64 };

export type RightStatus =
  | { state: 'Active' }
  | { state: 'Locked'; asset: AccountId; reservation_id: U64 }
  | { state: 'Consumed'; asset: AccountId; reservation_id: U64 };

export type CardKind =
  | { type: 'UsageRight'; group_id: GroupId; max_slots: number; source: RightSource; status: RightStatus }
  | { type: 'Credential'; kind: CredentialKind; issued_by_training: U64; suspended: boolean };

/** commons `get_cards_for_owner` element (`CardView`: Card flattened + `expired`). */
export interface Card {
  token_id: string;
  owner_id: AccountId;
  kind: CardKind;
  issued_at: U64;
  expires_at: U64 | null;
  expired: boolean;
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
