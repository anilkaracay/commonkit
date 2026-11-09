//! Stored and JSON-exposed types of the asset contract (CONTRACT_SPEC §2).
//!
//! Amounts are `U128` yoctoNEAR, ids and timestamps `U64` (JSON strings). Internal arithmetic
//! always goes through `.0` on these wrappers; nothing here is a float.

use commonkit_types::commons_iface::{CredentialKind, GroupId, TokenId};
use near_sdk::json_types::{U128, U64};
use near_sdk::{near, AccountId};

/// Status of every outbound transfer or call the asset makes (spec §1).
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OpStatus {
    Pending,
    Succeeded,
    Failed,
}

/// One maintenance rule of a profile (spec §2.1).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MaintenanceRule {
    pub rule_id: String,
    pub metric: String,
    /// Delta of `metric` since the rule's baseline that makes the rule due.
    pub threshold: u64,
    pub title: String,
    pub reward_rights: u32,
    pub reward_cash: U128,
    pub requires_verification_test: bool,
    pub claim_timeout_hours: u32,
}

/// Asset profile (spec §2.1). Validated by `profile::validate_profile`.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Profile {
    pub asset_type: String,
    pub display_name: String,
    pub group_id: GroupId,
    pub adapter: String,
    pub usage_unit_label: String,
    pub slot_minutes: u32,
    pub max_slots_per_reservation: u32,
    pub booking_horizon_days: u32,
    pub price_per_slot: U128,
    pub deposit: U128,
    pub deposit_trusted: U128,
    pub trusted_after: u32,
    pub required_credential: Option<CredentialKind>,
    pub float_cap: U128,
    pub storage_reserve: U128,
    pub auto_reward_cash_cap: U128,
    pub council_threshold_cash: U128,
    pub period_days: u32,
    pub period_reward_quota: u32,
    pub right_max_slots: u32,
    pub right_validity_days: u32,
    pub first_task_needs_council: bool,
    pub start_window_minutes: u32,
    pub rules: Vec<MaintenanceRule>,
    pub protocol_fee_bps: u16,
    pub protocol_fee_receiver: Option<AccountId>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReservationStatus {
    /// Slots held, waiting for commons.
    PendingAuthorization,
    Confirmed,
    InSession,
    /// Device locked again, awaiting the steward's return check.
    Finished,
    /// Deposit refunded (or none). Terminal.
    Closed,
    /// Deposit held for DAO review.
    Disputed,
    /// Cancelled by the holder before start. Terminal.
    Cancelled,
    /// Authorization failed. Terminal.
    Rejected,
    /// Start window passed without a session. Terminal.
    NoShow,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ReturnResult {
    Clean,
    Damage { note_hash: String },
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Reservation {
    pub id: U64,
    pub holder: AccountId,
    pub start_slot: U64,
    pub slots: u32,
    pub fee_paid: U128,
    /// Part of `fee_paid` paid out as protocol fee on confirmation (never refunded by the asset).
    pub protocol_fee: U128,
    pub deposit_paid: U128,
    pub right_id: Option<TokenId>,
    pub status: ReservationStatus,
    pub created_at: U64,
    pub session_started_at: Option<U64>,
    pub session_finished_at: Option<U64>,
    pub metrics_delta: Option<Vec<(String, u64)>>,
    pub return_result: Option<ReturnResult>,
    /// Latest `RightRelease`/`RightFinalize` op for `right_id` (D-203).
    pub right_op_id: Option<U64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct Telemetry {
    /// Cumulative counters, monotonic per metric within one epoch.
    pub metrics: Vec<(String, u64)>,
    pub updated_at: U64,
    pub reports: U64,
    /// Hardware epoch, raised by the DAO after a hardware swap (D-206).
    pub epoch: U64,
    /// True between `set_telemetry_epoch` and the next report: that report may decrease counters.
    pub reset_pending: bool,
}

impl Telemetry {
    pub fn value(&self, metric: &str) -> u64 {
        self.metrics
            .iter()
            .find(|(m, _)| m == metric)
            .map(|(_, v)| *v)
            .unwrap_or(0)
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TaskStatus {
    Open,
    Claimed,
    Submitted,
    Approved,
    Rewarded,
    Rejected,
    /// Reserved; v1 returns timed-out claims to `Open` instead.
    Expired,
    Cancelled,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VerificationResult {
    pub passed: bool,
    pub details_hash: String,
    pub reported_at: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RewardState {
    NotStarted,
    RightsPending,
    CashPending,
    Done,
    Failed { reason: String },
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Task {
    pub id: U64,
    pub rule_id: String,
    pub metric: String,
    pub opened_by: AccountId,
    /// True when a council member opened it without the threshold being crossed.
    pub manual: bool,
    pub rationale: String,
    pub metric_value_at_open: u64,
    pub baseline_at_open: u64,
    pub threshold: u64,
    pub reward_rights: u32,
    pub reward_cash: U128,
    /// Copied from the profile at open time so later profile changes never alter a task.
    pub right_max_slots: u32,
    pub right_validity_days: u32,
    pub requires_verification_test: bool,
    pub claim_timeout_hours: u32,
    pub needs_council: bool,
    pub status: TaskStatus,
    pub claimer: Option<AccountId>,
    pub claimed_at: Option<U64>,
    pub evidence_hash: Option<String>,
    pub evidence_uri: Option<String>,
    pub verification: Option<VerificationResult>,
    pub verifier: Option<AccountId>,
    pub council_approver: Option<AccountId>,
    pub metric_value_at_approval: Option<u64>,
    pub reward_state: RewardState,
    pub minted_right_ids: Vec<TokenId>,
    pub cash_op_id: Option<U64>,
    pub created_at: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RewardPeriod {
    pub started_at: U64,
    pub rights_minted: u32,
    /// Rights promised to open tasks, counted against the quota at open time (D-207).
    pub rights_reserved: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EscalationStatus {
    Submitting,
    Submitted,
    Approved,
    Rejected,
    Expired,
    Failed,
}

impl EscalationStatus {
    pub fn is_open(self) -> bool {
        matches!(
            self,
            EscalationStatus::Submitting | EscalationStatus::Submitted
        )
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Escalation {
    pub id: U64,
    pub requested_by: AccountId,
    pub kind: String,
    pub receiver: AccountId,
    pub amount: U128,
    pub reason: String,
    pub task_id: Option<U64>,
    pub proposal_id: Option<U64>,
    pub status: EscalationStatus,
    pub bond_paid: U128,
    pub bond_op_id: Option<U64>,
    /// The bond came back into `float_free` (Approved / Rejected / Expired) or was written off.
    pub bond_settled: bool,
    /// The bond is lost: proposal Removed (deleted) or its id unreadable (D-102).
    pub bond_lost: bool,
    /// Sputnik `submission_time` (ns) from the last sync.
    pub submission_time: Option<U64>,
    /// Raw Sputnik status string from the last `sync_escalation`.
    pub dao_status: Option<String>,
    pub created_at: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OpKind {
    Refund,
    Sweep,
    CashReward,
    Bond,
    ProtocolFee,
    /// `commons.release_right` for a reservation's right (amount 0, D-203).
    RightRelease,
    /// `commons.finalize_right` for a reservation's right (amount 0, D-203).
    RightFinalize,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OutboundOp {
    pub id: U64,
    pub kind: OpKind,
    pub to: AccountId,
    pub amount: U128,
    /// Reservation / task / escalation id.
    pub ref_id: Option<U64>,
    pub status: OpStatus,
    pub attempts: u32,
    pub created_at: U64,
    pub updated_at: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct Reputation {
    pub sessions: u32,
    pub clean_returns: u32,
    pub damages: u32,
    pub maintenances: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReputationRecord {
    pub seq: U64,
    pub account: AccountId,
    pub kind: String,
    pub ref_id: U64,
    pub at: U64,
}
