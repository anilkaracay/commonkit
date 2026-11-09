//! COMMONKIT `asset` contract: one deployment per shared asset, identical WASM everywhere.
//!
//! Contract of record: `docs/CONTRACT_SPEC.md` §2–§3, §6–§10. Deviations are logged in
//! `docs/DECISIONS.md` as D-2nn.
//!
//! Every state-changing method follows: access check → validation → state change → event →
//! (promise with a `#[private]` callback that handles success and failure).

use commonkit_types::commons_iface::{emit_event, Role, ROLE_COUNCIL};
use near_sdk::json_types::U64;
use near_sdk::serde_json::Value;
use near_sdk::store::{LookupMap, Vector};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, Gas, PanicOnDefault, PromiseError};

pub mod escalations;
pub mod governance;
pub mod ledger;
pub mod ops;
pub mod profile;
pub mod reputation;
pub mod reservations;
pub mod rewards;
pub mod service;
pub mod tasks;
pub mod telemetry;
pub mod types;
pub mod views;

#[cfg(test)]
mod tests;

use ledger::Ledger;
use types::*;

/// Gas for our own callbacks (spec §8). Starting values; measured values go to DECISIONS.
pub const GAS_ON_AUTHORIZED: Gas = Gas::from_tgas(50);
pub const GAS_ON_OP_RESULT: Gas = Gas::from_tgas(15);
pub const GAS_ON_MINTED: Gas = Gas::from_tgas(30);
pub const GAS_ADD_PROPOSAL: Gas = Gas::from_tgas(30);
pub const GAS_ON_ESCALATION_SUBMITTED: Gas = Gas::from_tgas(15);
pub const GAS_DAO_VIEW: Gas = Gas::from_tgas(15);
pub const GAS_ON_DAO_VIEW: Gas = Gas::from_tgas(20);

pub const NS_PER_MINUTE: u64 = 60_000_000_000;
pub const NS_PER_HOUR: u64 = 60 * NS_PER_MINUTE;
pub const NS_PER_DAY: u64 = 24 * NS_PER_HOUR;

/// A fault reporter must have had a session within this window (D-017).
pub const FAULT_REPORT_WINDOW: u64 = 14 * NS_PER_DAY;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
pub enum StorageKey {
    Roles,
    Reservations,
    SlotIndex,
    HolderReservations,
    Tasks,
    RuleBaselines,
    OpenTaskByRule,
    Escalations,
    Ops,
    Reputation,
    ReputationLog,
    Faults,
    LastSessionAt,
    ServiceLog,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AssetContract {
    // identity & wiring
    pub(crate) dao_id: AccountId,
    pub(crate) commons_id: AccountId,
    pub(crate) profile: Profile,
    pub(crate) profile_version: u32,
    /// Block time of `new`; default baseline of Schedule rules.
    pub(crate) created_at: u64,

    // operators (set by DAO)
    pub(crate) bridge_id: Option<AccountId>,
    pub(crate) agent_id: Option<AccountId>,

    // roles pushed from commons
    pub(crate) roles: LookupMap<AccountId, Vec<Role>>,
    pub(crate) roles_version: u64,

    pub(crate) ledger: Ledger,

    // reservations (ids are dense from 0; records are never removed)
    pub(crate) next_reservation_id: u64,
    pub(crate) reservations: LookupMap<u64, Reservation>,
    pub(crate) slot_index: LookupMap<u64, u64>,
    pub(crate) holder_reservations: LookupMap<AccountId, Vec<u64>>,

    pub(crate) telemetry: Telemetry,

    // maintenance
    pub(crate) next_task_id: u64,
    pub(crate) tasks: LookupMap<u64, Task>,
    /// Metric: value at last reward. Schedule: timestamp of last reward (default `created_at`).
    pub(crate) rule_baselines: LookupMap<String, u64>,
    /// Active fault reports of Report-trigger rules; cleared when the rule's task is Rewarded.
    pub(crate) faults: LookupMap<String, Vec<FaultReport>>,
    pub(crate) next_fault_seq: u64,
    pub(crate) last_session_at: LookupMap<AccountId, u64>,
    pub(crate) service: ServiceState,
    pub(crate) service_log: Vector<OutOfServicePeriod>,
    pub(crate) open_task_by_rule: LookupMap<String, u64>,
    pub(crate) period: RewardPeriod,

    // escalations
    pub(crate) next_escalation_id: u64,
    pub(crate) escalations: LookupMap<u64, Escalation>,
    pub(crate) open_escalations: u32,
    /// Sputnik `policy.proposal_bond`, cached by `refresh_dao_policy`.
    pub(crate) dao_proposal_bond: Option<u128>,
    /// Sputnik `policy.proposal_period` (ns), cached by `refresh_dao_policy` (D-102).
    pub(crate) dao_proposal_period: Option<u64>,

    // outbound operations
    pub(crate) next_op_id: u64,
    pub(crate) ops: LookupMap<u64, OutboundOp>,

    // reputation
    pub(crate) reputation: LookupMap<AccountId, Reputation>,
    pub(crate) reputation_log: Vector<ReputationRecord>,
}

#[near]
impl AssetContract {
    #[init]
    pub fn new(dao_id: AccountId, commons_id: AccountId, profile: Profile) -> Self {
        profile::validate_profile(&profile);
        Self {
            dao_id,
            commons_id,
            profile,
            profile_version: 1,
            created_at: env::block_timestamp(),
            bridge_id: None,
            agent_id: None,
            roles: LookupMap::new(StorageKey::Roles),
            roles_version: 0,
            ledger: Ledger::default(),
            next_reservation_id: 0,
            reservations: LookupMap::new(StorageKey::Reservations),
            slot_index: LookupMap::new(StorageKey::SlotIndex),
            holder_reservations: LookupMap::new(StorageKey::HolderReservations),
            telemetry: Telemetry::default(),
            next_task_id: 0,
            tasks: LookupMap::new(StorageKey::Tasks),
            rule_baselines: LookupMap::new(StorageKey::RuleBaselines),
            faults: LookupMap::new(StorageKey::Faults),
            next_fault_seq: 0,
            last_session_at: LookupMap::new(StorageKey::LastSessionAt),
            service: ServiceState {
                in_service: true,
                since: U64(env::block_timestamp()),
                reason_hash: None,
            },
            service_log: Vector::new(StorageKey::ServiceLog),
            open_task_by_rule: LookupMap::new(StorageKey::OpenTaskByRule),
            period: RewardPeriod {
                started_at: U64(env::block_timestamp()),
                rights_minted: 0,
                rights_reserved: 0,
            },
            next_escalation_id: 0,
            escalations: LookupMap::new(StorageKey::Escalations),
            open_escalations: 0,
            dao_proposal_bond: None,
            dao_proposal_period: None,
            next_op_id: 0,
            ops: LookupMap::new(StorageKey::Ops),
            reputation: LookupMap::new(StorageKey::Reputation),
            reputation_log: Vector::new(StorageKey::ReputationLog),
        }
    }
}

// ---- internal helpers shared by all modules ----

impl AssetContract {
    pub(crate) fn assert_dao(&self) {
        require!(
            env::predecessor_account_id() == self.dao_id,
            "E_NOT_DAO: caller is not the DAO"
        );
    }

    pub(crate) fn assert_commons(&self) {
        require!(
            env::predecessor_account_id() == self.commons_id,
            "E_NOT_COMMONS: caller is not the commons contract"
        );
    }

    pub(crate) fn is_bridge(&self, account: &AccountId) -> bool {
        self.bridge_id.as_ref() == Some(account)
    }

    pub(crate) fn is_agent(&self, account: &AccountId) -> bool {
        self.agent_id.as_ref() == Some(account)
    }

    pub(crate) fn assert_bridge(&self) {
        require!(
            self.is_bridge(&env::predecessor_account_id()),
            "E_NOT_BRIDGE: caller is not the bridge"
        );
    }

    pub(crate) fn assert_agent(&self) {
        require!(
            self.is_agent(&env::predecessor_account_id()),
            "E_NOT_AGENT: caller is not the agent"
        );
    }

    pub(crate) fn has_role(&self, account: &AccountId, role: &str) -> bool {
        self.roles
            .get(account)
            .map(|roles| roles.iter().any(|r| r == role))
            .unwrap_or(false)
    }

    /// AGENT or ROLE(council). Returns the caller and whether it is the agent.
    pub(crate) fn assert_agent_or_council(&self) -> (AccountId, bool) {
        let caller = env::predecessor_account_id();
        if self.is_agent(&caller) {
            return (caller, true);
        }
        require!(
            self.has_role(&caller, ROLE_COUNCIL),
            "E_NOT_AGENT: caller is not the agent or a council member"
        );
        (caller, false)
    }

    pub(crate) fn assert_role(&self, role: &str) -> AccountId {
        let caller = env::predecessor_account_id();
        if !self.has_role(&caller, role) {
            env::panic_str(&format!("E_MISSING_ROLE: caller lacks role {role}"));
        }
        caller
    }

    pub(crate) fn slot_ns(&self) -> u64 {
        u64::from(self.profile.slot_minutes) * NS_PER_MINUTE
    }

    pub(crate) fn now() -> u64 {
        env::block_timestamp()
    }

    pub(crate) fn emit(&self, event: &str, data: Value) {
        emit_event(event, data);
    }
}

/// True when the single promise result this callback depends on succeeded.
pub(crate) fn promise_succeeded() -> bool {
    if env::promise_results_count() != 1 {
        return false;
    }
    !matches!(env::promise_result_checked(0, 0), Err(PromiseError::Failed))
}

/// Bytes of the single promise result, `None` when it failed or exceeds `max_len`.
pub(crate) fn promise_bytes(max_len: usize) -> Option<Vec<u8>> {
    if env::promise_results_count() != 1 {
        return None;
    }
    env::promise_result_checked(0, max_len).ok()
}

/// String length bound in characters.
pub(crate) fn check_len(value: &str, max: usize, err: &str) {
    if value.chars().count() > max {
        env::panic_str(err);
    }
}

/// `true` for a 64-character hex string (sha256).
pub(crate) fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}
