//! Maintenance tasks (CONTRACT_SPEC §3.3). The agent can open a task only for a rule whose
//! on-chain telemetry delta crossed its threshold, within the cash cap, the free float and the
//! period quota (invariant 7). Claimer, agent and bridge can never approve (invariant 3).

use commonkit_types::commons_iface::{ROLE_COUNCIL, ROLE_VERIFIER};
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId};

use crate::ledger::{add, sub};
use crate::types::{RewardState, Task, TaskStatus, VerificationResult};
use crate::{check_len, is_sha256_hex, AssetContract, AssetContractExt, NS_PER_HOUR};

pub const MAX_RATIONALE_LEN: usize = 1000;
pub const MAX_NOTE_LEN: usize = 500;
pub const MAX_URI_LEN: usize = 500;

impl AssetContract {
    pub(crate) fn get_task_or_panic(&self, id: u64) -> Task {
        self.tasks
            .get(&id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("E_NOT_FOUND: unknown task"))
    }

    fn claim_timed_out(t: &Task) -> bool {
        match t.claimed_at {
            Some(at) => {
                Self::now()
                    >= at.0.saturating_add(
                        u64::from(t.claim_timeout_hours).saturating_mul(NS_PER_HOUR),
                    )
            }
            None => false,
        }
    }

    /// Returns reserved cash to the float and reserved rights to the quota; unblocks the rule.
    fn release_task_reservations(&mut self, t: &Task) {
        let cash = t.reward_cash.0;
        self.ledger.rewards_reserved = sub(self.ledger.rewards_reserved, cash, "rewards_reserved");
        self.ledger.float_free = add(self.ledger.float_free, cash, "float_free");
        self.period.rights_reserved = self.period.rights_reserved.saturating_sub(t.reward_rights);
        if self.open_task_by_rule.get(&t.rule_id) == Some(&t.id.0) {
            self.open_task_by_rule.remove(&t.rule_id);
        }
    }

    fn reopen(&mut self, mut t: Task, by: &AccountId, timed_out: bool) {
        let previous = t.claimer.take();
        t.claimed_at = None;
        t.status = TaskStatus::Open;
        self.tasks.insert(t.id.0, t.clone());
        self.emit(
            "task_unclaimed",
            json!({
                "task_id": t.id,
                "previous_claimer": previous,
                "by": by,
                "timed_out": timed_out,
            }),
        );
    }

    /// The claimer, the agent and the bridge can never approve a task (invariant 3).
    fn assert_independent(&self, t: &Task, caller: &AccountId) {
        require!(
            t.claimer.as_ref() != Some(caller) && !self.is_agent(caller) && !self.is_bridge(caller),
            "E_SELF_VERIFY: claimer, agent and bridge cannot approve"
        );
    }

    fn assert_test_passed(t: &Task) {
        if t.requires_verification_test {
            require!(
                t.verification.as_ref().map(|v| v.passed).unwrap_or(false),
                "E_BAD_STATE: verification test has not passed"
            );
        }
    }
}

#[near]
impl AssetContract {
    /// AGENT or ROLE(council). Opens a task for a due rule and reserves its cash and rights.
    /// `manual = true` (council only) bypasses the threshold and is recorded on the task.
    pub fn open_maintenance_task(
        &mut self,
        rule_id: String,
        rationale: String,
        manual: Option<bool>,
    ) -> U64 {
        let (caller, is_agent) = self.assert_agent_or_council();
        let manual = manual.unwrap_or(false);
        require!(
            !(manual && is_agent),
            "E_UNAUTHORIZED: only a council member can open a manual task"
        );
        let rule = self
            .profile
            .rules
            .iter()
            .find(|r| r.rule_id == rule_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("E_RULE_NOT_FOUND: no such rule in the profile"));
        require!(
            !self.open_task_by_rule.contains_key(&rule_id),
            "E_TASK_ALREADY_OPEN: rule already has an open task"
        );
        let value = self.telemetry.value(&rule.metric);
        let baseline = self.rule_baselines.get(&rule_id).copied().unwrap_or(0);
        let delta = value.saturating_sub(baseline);
        require!(
            manual || delta >= rule.threshold,
            "E_RULE_NOT_DUE: telemetry delta below the rule threshold"
        );
        require!(
            !rationale.is_empty(),
            "E_INVALID_ARGS: rationale must not be empty"
        );
        check_len(
            &rationale,
            MAX_RATIONALE_LEN,
            "E_INVALID_ARGS: rationale longer than 1000 characters",
        );
        let cash = rule.reward_cash.0;
        require!(
            cash <= self.profile.auto_reward_cash_cap.0,
            "E_CASH_CAP_EXCEEDED: reward_cash above auto_reward_cash_cap"
        );
        require!(
            cash <= self.ledger.float_free,
            "E_INSUFFICIENT_FLOAT: float cannot reserve the cash reward"
        );
        self.roll_period();
        let committed = u64::from(self.period.rights_minted)
            + u64::from(self.period.rights_reserved)
            + u64::from(rule.reward_rights);
        require!(
            committed <= u64::from(self.profile.period_reward_quota),
            "E_QUOTA_EXCEEDED: period reward quota reached"
        );

        self.ledger.float_free -= cash;
        self.ledger.rewards_reserved = add(self.ledger.rewards_reserved, cash, "rewards_reserved");
        self.period.rights_reserved += rule.reward_rights;

        let id = self.next_task_id;
        self.next_task_id += 1;
        let needs_council = cash > self.profile.council_threshold_cash.0;
        let task = Task {
            id: U64(id),
            rule_id: rule_id.clone(),
            metric: rule.metric.clone(),
            opened_by: caller.clone(),
            manual,
            rationale: rationale.clone(),
            metric_value_at_open: value,
            baseline_at_open: baseline,
            threshold: rule.threshold,
            reward_rights: rule.reward_rights,
            reward_cash: U128(cash),
            right_max_slots: self.profile.right_max_slots,
            right_validity_days: self.profile.right_validity_days,
            requires_verification_test: rule.requires_verification_test,
            claim_timeout_hours: rule.claim_timeout_hours,
            needs_council,
            status: TaskStatus::Open,
            claimer: None,
            claimed_at: None,
            evidence_hash: None,
            evidence_uri: None,
            verification: None,
            verifier: None,
            council_approver: None,
            metric_value_at_approval: None,
            reward_state: RewardState::NotStarted,
            minted_right_ids: Vec::new(),
            cash_op_id: None,
            created_at: U64(Self::now()),
        };
        self.tasks.insert(id, task);
        self.open_task_by_rule.insert(rule_id.clone(), id);
        self.emit(
            "task_opened",
            json!({
                "task_id": id.to_string(),
                "rule_id": rule_id,
                "metric": rule.metric,
                "metric_value": value,
                "baseline": baseline,
                "threshold": rule.threshold,
                "manual": manual,
                "opened_by": caller,
                "rationale": rationale,
                "reward_rights": rule.reward_rights,
                "reward_cash": cash.to_string(),
                "needs_council": needs_council,
            }),
        );
        U64(id)
    }

    /// AGENT. Appends a note to a task (event only).
    pub fn annotate_task(&mut self, task_id: U64, note: String) {
        self.assert_agent();
        self.get_task_or_panic(task_id.0);
        check_len(
            &note,
            MAX_NOTE_LEN,
            "E_INVALID_ARGS: note longer than 500 characters",
        );
        self.emit(
            "task_annotated",
            json!({ "task_id": task_id, "note": note }),
        );
    }

    /// ANY account except the agent and the bridge. `Open` → `Claimed`.
    pub fn claim_task(&mut self, task_id: U64) {
        let caller = env::predecessor_account_id();
        require!(
            !self.is_agent(&caller) && !self.is_bridge(&caller),
            "E_UNAUTHORIZED: the agent and the bridge cannot claim tasks"
        );
        let mut t = self.get_task_or_panic(task_id.0);
        require!(
            t.status == TaskStatus::Open,
            "E_BAD_STATE: task is not Open"
        );
        t.status = TaskStatus::Claimed;
        t.claimer = Some(caller.clone());
        t.claimed_at = Some(U64(Self::now()));
        self.tasks.insert(task_id.0, t);
        self.emit(
            "task_claimed",
            json!({ "task_id": task_id, "claimer": caller }),
        );
    }

    /// The claimer at any time, or ANY after `claim_timeout_hours`. `Claimed` → `Open`.
    pub fn unclaim_task(&mut self, task_id: U64) {
        let caller = env::predecessor_account_id();
        let t = self.get_task_or_panic(task_id.0);
        require!(
            t.status == TaskStatus::Claimed,
            "E_BAD_STATE: task is not Claimed"
        );
        let timed_out = Self::claim_timed_out(&t);
        require!(
            t.claimer.as_ref() == Some(&caller) || timed_out,
            "E_UNAUTHORIZED: only the claimer can unclaim before the timeout"
        );
        self.reopen(t, &caller, timed_out);
    }

    /// ANY. A `Claimed` task past its claim timeout returns to `Open`.
    pub fn expire_task(&mut self, task_id: U64) {
        let caller = env::predecessor_account_id();
        let t = self.get_task_or_panic(task_id.0);
        require!(
            t.status == TaskStatus::Claimed && Self::claim_timed_out(&t),
            "E_BAD_STATE: task is not a timed-out claim"
        );
        self.reopen(t, &caller, true);
    }

    /// Claimer. `Claimed` → `Submitted` with a hex sha256 of the evidence.
    pub fn submit_task(
        &mut self,
        task_id: U64,
        evidence_hash: String,
        evidence_uri: Option<String>,
    ) {
        let caller = env::predecessor_account_id();
        let mut t = self.get_task_or_panic(task_id.0);
        require!(
            t.claimer.as_ref() == Some(&caller),
            "E_UNAUTHORIZED: only the claimer can submit"
        );
        require!(
            t.status == TaskStatus::Claimed,
            "E_BAD_STATE: task is not Claimed"
        );
        require!(
            is_sha256_hex(&evidence_hash),
            "E_INVALID_ARGS: evidence_hash must be a hex sha256"
        );
        if let Some(uri) = &evidence_uri {
            check_len(
                uri,
                MAX_URI_LEN,
                "E_INVALID_ARGS: evidence_uri longer than 500 characters",
            );
        }
        t.status = TaskStatus::Submitted;
        t.evidence_hash = Some(evidence_hash.clone());
        t.evidence_uri = evidence_uri.clone();
        self.tasks.insert(task_id.0, t);
        self.emit(
            "task_submitted",
            json!({
                "task_id": task_id,
                "claimer": caller,
                "evidence_hash": evidence_hash,
                "evidence_uri": evidence_uri,
            }),
        );
    }

    /// BRIDGE. Stores the verification test result of a `Submitted` task.
    pub fn submit_verification_result(&mut self, task_id: U64, passed: bool, details_hash: String) {
        self.assert_bridge();
        let mut t = self.get_task_or_panic(task_id.0);
        require!(
            t.status == TaskStatus::Submitted,
            "E_BAD_STATE: task is not Submitted"
        );
        require!(
            is_sha256_hex(&details_hash),
            "E_INVALID_ARGS: details_hash must be a hex sha256"
        );
        t.verification = Some(VerificationResult {
            passed,
            details_hash: details_hash.clone(),
            reported_at: U64(Self::now()),
        });
        self.tasks.insert(task_id.0, t);
        self.emit(
            "verification_reported",
            json!({ "task_id": task_id, "passed": passed, "details_hash": details_hash }),
        );
    }

    /// ROLE(verifier); not the claimer, agent or bridge. Rewards the task, or waits for
    /// `council_approve_task` when the task needs council or is the claimer's first one.
    pub fn approve_task(&mut self, task_id: U64) {
        let caller = env::predecessor_account_id();
        let mut t = self.get_task_or_panic(task_id.0);
        self.assert_independent(&t, &caller);
        self.assert_role(ROLE_VERIFIER);
        require!(
            t.status == TaskStatus::Submitted && t.verifier.is_none(),
            "E_BAD_STATE: task is not awaiting verifier approval"
        );
        Self::assert_test_passed(&t);
        let first_task = self.profile.first_task_needs_council
            && t.claimer
                .as_ref()
                .and_then(|c| self.reputation.get(c))
                .map(|r| r.maintenances)
                .unwrap_or(0)
                == 0;
        t.verifier = Some(caller.clone());
        if t.needs_council || first_task {
            t.needs_council = true;
            self.tasks.insert(task_id.0, t);
            self.emit(
                "task_approved",
                json!({ "task_id": task_id, "verifier": caller, "awaiting_council": true }),
            );
            return;
        }
        t.status = TaskStatus::Approved;
        self.tasks.insert(task_id.0, t);
        self.emit(
            "task_approved",
            json!({ "task_id": task_id, "verifier": caller, "awaiting_council": false }),
        );
        self.start_reward(task_id.0);
    }

    /// ROLE(council); not the claimer, the verifier, the agent or the bridge.
    pub fn council_approve_task(&mut self, task_id: U64) {
        let caller = env::predecessor_account_id();
        let mut t = self.get_task_or_panic(task_id.0);
        self.assert_independent(&t, &caller);
        require!(
            t.verifier.as_ref() != Some(&caller),
            "E_SELF_VERIFY: the verifier cannot also give council approval"
        );
        self.assert_role(ROLE_COUNCIL);
        require!(
            t.status == TaskStatus::Submitted && t.verifier.is_some() && t.needs_council,
            "E_BAD_STATE: task is not awaiting council approval"
        );
        Self::assert_test_passed(&t);
        t.status = TaskStatus::Approved;
        t.council_approver = Some(caller.clone());
        self.tasks.insert(task_id.0, t);
        self.emit(
            "task_council_approved",
            json!({ "task_id": task_id, "council_approver": caller }),
        );
        self.start_reward(task_id.0);
    }

    /// ROLE(verifier) or ROLE(council); not the claimer. `Submitted` → `Rejected`; reserved cash
    /// returns to the float and the rule can be reopened.
    pub fn reject_task(&mut self, task_id: U64, reason: String) {
        let caller = env::predecessor_account_id();
        let mut t = self.get_task_or_panic(task_id.0);
        require!(
            t.claimer.as_ref() != Some(&caller),
            "E_SELF_VERIFY: the claimer cannot reject their own task"
        );
        require!(
            self.has_role(&caller, ROLE_VERIFIER) || self.has_role(&caller, ROLE_COUNCIL),
            "E_MISSING_ROLE: caller lacks role verifier or council"
        );
        require!(
            t.status == TaskStatus::Submitted,
            "E_BAD_STATE: task is not Submitted"
        );
        check_len(
            &reason,
            MAX_NOTE_LEN,
            "E_INVALID_ARGS: reason longer than 500 characters",
        );
        self.release_task_reservations(&t);
        t.status = TaskStatus::Rejected;
        self.tasks.insert(task_id.0, t.clone());
        self.emit(
            "task_rejected",
            json!({ "task_id": task_id, "by": caller, "reason": reason, "rule_id": t.rule_id }),
        );
        self.maybe_sweep();
    }

    /// DAO or ROLE(council). Cancels an `Open` or `Claimed` task (e.g. a false alarm) and
    /// releases its reserved cash and rights (D-208).
    pub fn cancel_task(&mut self, task_id: U64, reason: String) {
        let caller = env::predecessor_account_id();
        require!(
            caller == self.dao_id || self.has_role(&caller, ROLE_COUNCIL),
            "E_UNAUTHORIZED: only the DAO or a council member can cancel a task"
        );
        let mut t = self.get_task_or_panic(task_id.0);
        require!(
            matches!(t.status, TaskStatus::Open | TaskStatus::Claimed),
            "E_BAD_STATE: only Open or Claimed tasks can be cancelled"
        );
        check_len(
            &reason,
            MAX_NOTE_LEN,
            "E_INVALID_ARGS: reason longer than 500 characters",
        );
        self.release_task_reservations(&t);
        t.status = TaskStatus::Cancelled;
        self.tasks.insert(task_id.0, t.clone());
        self.emit(
            "task_cancelled",
            json!({ "task_id": task_id, "by": caller, "reason": reason, "rule_id": t.rule_id }),
        );
        self.maybe_sweep();
    }
}
