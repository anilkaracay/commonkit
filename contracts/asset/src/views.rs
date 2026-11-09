//! Read-only views (CONTRACT_SPEC §3.6). Pagination: ids are dense from 0, so `from_index`
//! is the first id returned. `limit` is capped at `MAX_PAGE`.

use commonkit_types::commons_iface::Role;
use near_sdk::json_types::{U128, U64};
use near_sdk::{env, near, AccountId};

use crate::ledger::LedgerView;
use crate::types::*;
use crate::{AssetContract, AssetContractExt};

pub const MAX_PAGE: u64 = 100;
pub const MAX_AVAILABILITY: u64 = 500;

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Wiring {
    pub dao_id: AccountId,
    pub commons_id: AccountId,
    pub bridge_id: Option<AccountId>,
    pub agent_id: Option<AccountId>,
    pub profile_version: u32,
    pub roles_version: U64,
    pub telemetry_epoch: U64,
    pub dao_proposal_bond: Option<U128>,
    pub dao_proposal_period: Option<U64>,
    pub open_escalations: u32,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AccessCheck {
    pub ok: bool,
    pub reason: String,
    pub window_start: U64,
    pub window_end: U64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuleStatus {
    pub rule_id: String,
    pub metric: String,
    pub value: u64,
    pub baseline: u64,
    pub delta: u64,
    pub threshold: u64,
    pub due: bool,
    pub open_task: Option<U64>,
    pub reward_rights: u32,
    pub reward_cash: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SlotInfo {
    pub slot: U64,
    pub reservation_id: Option<U64>,
}

fn page(from_index: Option<U64>, limit: Option<u64>, len: u64) -> std::ops::Range<u64> {
    let from = from_index.map(|f| f.0).unwrap_or(0).min(len);
    let limit = limit.unwrap_or(MAX_PAGE).min(MAX_PAGE);
    from..from.saturating_add(limit).min(len)
}

#[near]
impl AssetContract {
    pub fn version(&self) -> String {
        format!("commonkit-asset {}", env!("CARGO_PKG_VERSION"))
    }

    pub fn get_profile(&self) -> Profile {
        self.profile.clone()
    }

    pub fn get_wiring(&self) -> Wiring {
        Wiring {
            dao_id: self.dao_id.clone(),
            commons_id: self.commons_id.clone(),
            bridge_id: self.bridge_id.clone(),
            agent_id: self.agent_id.clone(),
            profile_version: self.profile_version,
            roles_version: U64(self.roles_version),
            telemetry_epoch: self.telemetry.epoch,
            dao_proposal_bond: self.dao_proposal_bond.map(U128),
            dao_proposal_period: self.dao_proposal_period.map(U64),
            open_escalations: self.open_escalations,
        }
    }

    pub fn get_ledger(&self) -> LedgerView {
        let l = &self.ledger;
        let balance = env::account_balance().as_yoctonear();
        let storage_usage = env::storage_usage();
        let byte_cost = env::storage_byte_cost().as_yoctonear();
        let storage_cost = u128::from(storage_usage) * byte_cost;
        let reserve = self.profile.storage_reserve.0;
        LedgerView {
            float_free: U128(l.float_free),
            deposits_held: U128(l.deposits_held),
            rewards_reserved: U128(l.rewards_reserved),
            pending_in: U128(l.pending_in),
            protocol_fees_owed: U128(l.protocol_fees_owed),
            pending_out: U128(l.pending_out),
            bonds_outstanding: U128(l.bonds_outstanding),
            total_fees_in: U128(l.total_fees_in),
            total_swept: U128(l.total_swept),
            total_refunded: U128(l.total_refunded),
            total_rewards_paid: U128(l.total_rewards_paid),
            total_bonds_paid: U128(l.total_bonds_paid),
            total_bonds_returned: U128(l.total_bonds_returned),
            total_bonds_lost: U128(l.total_bonds_lost),
            total_protocol_fees: U128(l.total_protocol_fees),
            float_cap: self.profile.float_cap,
            storage_reserve: U128(reserve),
            balance: U128(balance),
            storage_usage: U64(storage_usage),
            storage_byte_cost: U128(byte_cost),
            storage_cost: U128(storage_cost),
            invariant_ok: l.invariant_ok(balance, reserve),
            storage_ok: storage_cost <= reserve,
        }
    }

    pub fn get_reservation(&self, id: U64) -> Option<Reservation> {
        self.reservations.get(&id.0).cloned()
    }

    pub fn get_reservations(
        &self,
        from_index: Option<U64>,
        limit: Option<u64>,
    ) -> Vec<Reservation> {
        page(from_index, limit, self.next_reservation_id)
            .filter_map(|id| self.reservations.get(&id).cloned())
            .collect()
    }

    /// `from_index` is a position in the holder's own list (oldest first).
    pub fn get_reservations_by_holder(
        &self,
        account: AccountId,
        from_index: Option<U64>,
        limit: Option<u64>,
    ) -> Vec<Reservation> {
        let ids = self
            .holder_reservations
            .get(&account)
            .cloned()
            .unwrap_or_default();
        page(from_index, limit, ids.len() as u64)
            .filter_map(|i| self.reservations.get(&ids[i as usize]).cloned())
            .collect()
    }

    pub fn get_slot_owner(&self, slot: U64) -> Option<U64> {
        self.slot_index.get(&slot.0).copied().map(U64)
    }

    pub fn get_availability(&self, from_slot: U64, count: u64) -> Vec<SlotInfo> {
        let count = count.min(MAX_AVAILABILITY);
        (from_slot.0..from_slot.0.saturating_add(count))
            .map(|slot| SlotInfo {
                slot: U64(slot),
                reservation_id: self.slot_index.get(&slot).copied().map(U64),
            })
            .collect()
    }

    /// What the bridge checks before unlocking: `Confirmed` within the start window, or
    /// `InSession` before the reservation ends, and `holder == account`. A credential, if
    /// required, was checked by commons when the reservation was confirmed.
    pub fn can_access(&self, account: AccountId, reservation_id: U64) -> AccessCheck {
        let Some(r) = self.reservations.get(&reservation_id.0) else {
            return AccessCheck {
                ok: false,
                reason: "unknown_reservation".to_string(),
                window_start: U64(0),
                window_end: U64(0),
            };
        };
        let now = env::block_timestamp();
        let start = self.start_ts(r);
        let window_end = self.window_end_ts(r);
        let end = self.end_ts(r);
        let deny = |reason: &str, ws: u64, we: u64| AccessCheck {
            ok: false,
            reason: reason.to_string(),
            window_start: U64(ws),
            window_end: U64(we),
        };
        if r.holder != account {
            return deny("not_holder", start, window_end);
        }
        match r.status {
            ReservationStatus::Confirmed => {
                if now < start {
                    deny("too_early", start, window_end)
                } else if now > window_end {
                    deny("start_window_closed", start, window_end)
                } else {
                    AccessCheck {
                        ok: true,
                        reason: "ok".to_string(),
                        window_start: U64(start),
                        window_end: U64(window_end),
                    }
                }
            }
            ReservationStatus::InSession => {
                if now < end {
                    AccessCheck {
                        ok: true,
                        reason: "session_active".to_string(),
                        window_start: U64(start),
                        window_end: U64(end),
                    }
                } else {
                    deny("reservation_ended", start, end)
                }
            }
            ReservationStatus::PendingAuthorization => {
                deny("pending_authorization", start, window_end)
            }
            _ => deny("not_active", start, window_end),
        }
    }

    pub fn get_telemetry(&self) -> Telemetry {
        self.telemetry.clone()
    }

    pub fn get_rule_status(&self) -> Vec<RuleStatus> {
        self.profile
            .rules
            .iter()
            .map(|rule| {
                let value = self.telemetry.value(&rule.metric);
                let baseline = self.rule_baselines.get(&rule.rule_id).copied().unwrap_or(0);
                let delta = value.saturating_sub(baseline);
                RuleStatus {
                    rule_id: rule.rule_id.clone(),
                    metric: rule.metric.clone(),
                    value,
                    baseline,
                    delta,
                    threshold: rule.threshold,
                    due: delta >= rule.threshold,
                    open_task: self.open_task_by_rule.get(&rule.rule_id).copied().map(U64),
                    reward_rights: rule.reward_rights,
                    reward_cash: rule.reward_cash,
                }
            })
            .collect()
    }

    pub fn get_task(&self, id: U64) -> Option<Task> {
        self.tasks.get(&id.0).cloned()
    }

    /// `from_index`/`limit` select an id range; `status` filters within it.
    pub fn get_tasks(
        &self,
        from_index: Option<U64>,
        limit: Option<u64>,
        status: Option<TaskStatus>,
    ) -> Vec<Task> {
        page(from_index, limit, self.next_task_id)
            .filter_map(|id| self.tasks.get(&id).cloned())
            .filter(|t| status.is_none_or(|s| t.status == s))
            .collect()
    }

    pub fn get_escalation(&self, id: U64) -> Option<Escalation> {
        self.escalations.get(&id.0).cloned()
    }

    pub fn get_escalations(&self, from_index: Option<U64>, limit: Option<u64>) -> Vec<Escalation> {
        page(from_index, limit, self.next_escalation_id)
            .filter_map(|id| self.escalations.get(&id).cloned())
            .collect()
    }

    pub fn get_op(&self, id: U64) -> Option<OutboundOp> {
        self.ops.get(&id.0).cloned()
    }

    /// `from_index`/`limit` select an id range; `status` filters within it.
    pub fn get_ops(
        &self,
        from_index: Option<U64>,
        limit: Option<u64>,
        status: Option<OpStatus>,
    ) -> Vec<OutboundOp> {
        page(from_index, limit, self.next_op_id)
            .filter_map(|id| self.ops.get(&id).cloned())
            .filter(|o| status.is_none_or(|s| o.status == s))
            .collect()
    }

    pub fn get_reputation(&self, account: AccountId) -> Reputation {
        self.reputation.get(&account).cloned().unwrap_or_default()
    }

    pub fn get_reputation_log(
        &self,
        from_index: Option<U64>,
        limit: Option<u64>,
    ) -> Vec<ReputationRecord> {
        page(from_index, limit, u64::from(self.reputation_log.len()))
            .filter_map(|i| self.reputation_log.get(i as u32).cloned())
            .collect()
    }

    pub fn get_period(&self) -> RewardPeriod {
        self.period.clone()
    }

    pub fn get_roles(&self, account: AccountId) -> Vec<Role> {
        self.roles.get(&account).cloned().unwrap_or_default()
    }
}
