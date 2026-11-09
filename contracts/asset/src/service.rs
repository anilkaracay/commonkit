//! Fault reports and service state (CONTRACT_SPEC §2.4a, §3.3 "Faults and service", D-017).
//!
//! Anyone who used the asset in the last 14 days may report a fault (one active report per
//! account per Report-trigger rule). Stewards, council or the DAO can take the asset out of
//! service; only the council/DAO or a Rewarded Repair task bring it back.

use commonkit_types::commons_iface::{ROLE_COUNCIL, ROLE_STEWARD};
use near_sdk::json_types::U64;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId};

use crate::reputation::REP_FAULT_REPORT;
use crate::types::{FaultReport, OutOfServicePeriod, ServiceRestoredBy, ServiceState, Trigger};
use crate::{is_sha256_hex, AssetContract, AssetContractExt, FAULT_REPORT_WINDOW};

/// Max active reports per rule.
pub const MAX_ACTIVE_REPORTS: usize = 32;

impl AssetContract {
    pub(crate) fn assert_in_service(&self) {
        require!(
            self.service.in_service,
            "E_OUT_OF_SERVICE: the asset is out of service"
        );
    }

    /// Ends the open out-of-service period. Caller checked `!in_service`.
    pub(crate) fn restore_service(&mut self, by: ServiceRestoredBy) {
        let now = Self::now();
        self.service = ServiceState {
            in_service: true,
            since: U64(now),
            reason_hash: None,
        };
        let len = self.service_log.len();
        if len > 0 {
            if let Some(period) = self.service_log.get_mut(len - 1) {
                period.ended_at = Some(U64(now));
                period.ended_by = Some(by.clone());
            }
        }
        self.emit(
            "service_restored",
            json!({ "period_seq": len.saturating_sub(1).to_string(), "by": by }),
        );
    }

    /// Rule id of a Report-trigger rule: the given one, or the profile's first Report rule.
    fn report_rule(&self, rule_id: Option<String>) -> String {
        let rule = match &rule_id {
            Some(id) => self.profile.rules.iter().find(|r| &r.rule_id == id),
            None => self
                .profile
                .rules
                .iter()
                .find(|r| matches!(r.trigger, Trigger::Report { .. })),
        };
        match rule {
            Some(r) if matches!(r.trigger, Trigger::Report { .. }) => r.rule_id.clone(),
            _ => env::panic_str("E_RULE_NOT_FOUND: no Report-trigger rule"),
        }
    }

    pub(crate) fn active_reports(&self, rule_id: &str) -> usize {
        self.faults.get(rule_id).map(|f| f.len()).unwrap_or(0)
    }
}

#[near]
impl AssetContract {
    /// ANY account with a session on this asset in the last 14 days (not agent/bridge).
    /// Adds one active report to a Report-trigger rule.
    pub fn report_fault(&mut self, rule_id: Option<String>, note_hash: String) -> U64 {
        let reporter = env::predecessor_account_id();
        require!(
            !self.is_agent(&reporter) && !self.is_bridge(&reporter),
            "E_UNAUTHORIZED: the agent and the bridge cannot report faults"
        );
        let now = Self::now();
        let recent = self
            .last_session_at
            .get(&reporter)
            .map(|at| now.saturating_sub(*at) <= FAULT_REPORT_WINDOW)
            .unwrap_or(false);
        require!(
            recent,
            "E_NO_RECENT_SESSION: no session on this asset in the last 14 days"
        );
        require!(
            is_sha256_hex(&note_hash),
            "E_INVALID_ARGS: note_hash must be a hex sha256"
        );
        let rule_id = self.report_rule(rule_id);
        let mut reports = self.faults.get(&rule_id).cloned().unwrap_or_default();
        require!(
            reports.iter().all(|f| f.reporter != reporter),
            "E_ALREADY_REPORTED: you already have an active report for this rule"
        );
        require!(
            reports.len() < MAX_ACTIVE_REPORTS,
            "E_INVALID_ARGS: too many active reports for this rule"
        );
        let seq = self.next_fault_seq;
        self.next_fault_seq += 1;
        reports.push(FaultReport {
            seq: U64(seq),
            reporter: reporter.clone(),
            note_hash: note_hash.clone(),
            at: U64(now),
        });
        let active = reports.len();
        self.faults.insert(rule_id.clone(), reports);
        self.emit(
            "fault_reported",
            json!({
                "seq": seq.to_string(),
                "rule_id": rule_id,
                "reporter": reporter,
                "note_hash": note_hash,
                "active_reports": active,
            }),
        );
        self.record_reputation(&reporter, REP_FAULT_REPORT, seq);
        U64(seq)
    }

    /// `out = true`: ROLE(steward), ROLE(council) or DAO. `out = false`: ROLE(council) or DAO.
    pub fn set_out_of_service(&mut self, out: bool, reason_hash: String) {
        let caller = env::predecessor_account_id();
        let is_dao = caller == self.dao_id;
        let is_council = self.has_role(&caller, ROLE_COUNCIL);
        if out {
            require!(
                is_dao || is_council || self.has_role(&caller, ROLE_STEWARD),
                "E_MISSING_ROLE: steward, council or DAO required"
            );
            require!(
                self.service.in_service,
                "E_BAD_STATE: the asset is already out of service"
            );
        } else {
            require!(
                is_dao || is_council,
                "E_MISSING_ROLE: council or DAO required to restore service"
            );
            require!(
                !self.service.in_service,
                "E_BAD_STATE: the asset is already in service"
            );
        }
        require!(
            is_sha256_hex(&reason_hash),
            "E_INVALID_ARGS: reason_hash must be a hex sha256"
        );
        if !out {
            self.restore_service(ServiceRestoredBy::Council { account: caller });
            return;
        }
        let now = Self::now();
        let seq = self.service_log.len();
        self.service = ServiceState {
            in_service: false,
            since: U64(now),
            reason_hash: Some(reason_hash.clone()),
        };
        self.service_log.push(OutOfServicePeriod {
            seq: U64(u64::from(seq)),
            started_at: U64(now),
            started_by: caller.clone(),
            reason_hash: reason_hash.clone(),
            ended_at: None,
            ended_by: None,
        });
        self.emit(
            "out_of_service",
            json!({
                "period_seq": seq.to_string(),
                "by": caller,
                "reason_hash": reason_hash,
            }),
        );
    }
}

/// `get_faults` row.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuleFaults {
    pub rule_id: String,
    pub reports: Vec<FaultReport>,
}

#[near]
impl AssetContract {
    /// Active fault reports per Report-trigger rule (or for one rule).
    pub fn get_faults(&self, rule_id: Option<String>) -> Vec<RuleFaults> {
        self.profile
            .rules
            .iter()
            .filter(|r| matches!(r.trigger, Trigger::Report { .. }))
            .filter(|r| rule_id.as_ref().is_none_or(|id| *id == r.rule_id))
            .map(|r| RuleFaults {
                rule_id: r.rule_id.clone(),
                reports: self.faults.get(&r.rule_id).cloned().unwrap_or_default(),
            })
            .collect()
    }

    pub fn get_service_status(&self) -> ServiceState {
        self.service.clone()
    }

    pub fn get_service_log(
        &self,
        from_index: Option<U64>,
        limit: Option<u64>,
    ) -> Vec<OutOfServicePeriod> {
        let len = u64::from(self.service_log.len());
        let from = from_index.map(|f| f.0).unwrap_or(0).min(len);
        let limit = limit
            .unwrap_or(crate::views::MAX_PAGE)
            .min(crate::views::MAX_PAGE);
        (from..from.saturating_add(limit).min(len))
            .filter_map(|i| self.service_log.get(i as u32).cloned())
            .collect()
    }

    /// Last session start/finish time of `account` on this asset (fault-report eligibility).
    pub fn get_last_session_at(&self, account: AccountId) -> Option<U64> {
        self.last_session_at.get(&account).copied().map(U64)
    }
}
