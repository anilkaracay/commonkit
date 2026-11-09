//! Reward procedure (CONTRACT_SPEC §3.3), exactly once (invariant 4).
//!
//! `Approved + NotStarted` → [`RightsPending` → `commons.mint_rights` → `on_rights_minted`] →
//! [`CashPending` → CashReward op → `on_op_result`] → `Done` (`Rewarded`).
//! A failed step sets `Failed { reason }`; `retry_reward` restarts from that step only. Each
//! callback acts only when the task is in the matching pending state, and `mint_rights` is
//! idempotent per `(asset, task_id)` in commons, so retries never double mint or double pay.

use commonkit_types::commons_iface::{
    MintRightsArgs, RightSource, TokenId, GAS_MINT, METHOD_MINT_RIGHTS,
};
use near_sdk::json_types::U64;
use near_sdk::serde_json::{self, json};
use near_sdk::{env, near, require, NearToken, Promise};

use crate::ledger::sub;
use crate::reputation::REP_MAINTENANCE;
use crate::types::{OpKind, RewardState, TaskStatus};
use crate::{promise_bytes, AssetContract, AssetContractExt, GAS_ON_MINTED, NS_PER_DAY};

const MAX_MINT_RESULT_LEN: usize = 8192;

impl AssetContract {
    /// Starts a new reward period when the current one has elapsed.
    pub(crate) fn roll_period(&mut self) {
        let length = u64::from(self.profile.period_days).saturating_mul(NS_PER_DAY);
        let now = Self::now();
        if now >= self.period.started_at.0.saturating_add(length) {
            self.period.started_at = U64(now);
            self.period.rights_minted = 0;
        }
    }

    pub(crate) fn set_reward_state(&mut self, task_id: u64, state: RewardState) {
        if let Some(mut t) = self.tasks.get(&task_id).cloned() {
            t.reward_state = state;
            self.tasks.insert(task_id, t);
        }
    }

    /// Guard + first step. Called right after the task became `Approved`.
    pub(crate) fn start_reward(&mut self, task_id: u64) {
        let mut t = self.get_task_or_panic(task_id);
        require!(
            t.status == TaskStatus::Approved && t.reward_state == RewardState::NotStarted,
            "E_ALREADY_REWARDED: reward already started"
        );
        t.metric_value_at_approval = Some(self.telemetry.value(&t.metric));
        self.tasks.insert(task_id, t);
        self.mint_step(task_id);
    }

    fn mint_step(&mut self, task_id: u64) {
        let mut t = self.get_task_or_panic(task_id);
        if t.reward_rights == 0 {
            self.cash_step(task_id);
            return;
        }
        let holder = t
            .claimer
            .clone()
            .unwrap_or_else(|| env::panic_str("E_BAD_STATE: task has no claimer"));
        t.reward_state = RewardState::RightsPending;
        let args = MintRightsArgs {
            holder,
            count: t.reward_rights,
            max_slots: t.right_max_slots,
            validity_days: t.right_validity_days,
            source: RightSource::Maintenance {
                asset: env::current_account_id(),
                task_id: U64(task_id),
            },
        };
        self.tasks.insert(task_id, t);
        let args =
            serde_json::to_vec(&args).unwrap_or_else(|_| env::panic_str("E_BAD_STATE: args"));
        Promise::new(self.commons_id.clone())
            .function_call(
                METHOD_MINT_RIGHTS.to_string(),
                args,
                NearToken::from_yoctonear(0),
                GAS_MINT,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_MINTED)
                    .on_rights_minted(U64(task_id)),
            )
            .detach();
    }

    fn cash_step(&mut self, task_id: u64) {
        let mut t = self.get_task_or_panic(task_id);
        let cash = t.reward_cash.0;
        if cash == 0 {
            self.finish_reward(task_id);
            return;
        }
        let claimer = t
            .claimer
            .clone()
            .unwrap_or_else(|| env::panic_str("E_BAD_STATE: task has no claimer"));
        self.ledger.rewards_reserved = sub(self.ledger.rewards_reserved, cash, "rewards_reserved");
        let op_id = self.create_op(OpKind::CashReward, claimer, cash, Some(task_id));
        t.cash_op_id = Some(U64(op_id));
        t.reward_state = RewardState::CashPending;
        self.tasks.insert(task_id, t);
        self.send_op(op_id);
    }

    /// Final step: `Done`, `Rewarded`, new baseline, rule unblocked, reputation.
    pub(crate) fn finish_reward(&mut self, task_id: u64) {
        let mut t = self.get_task_or_panic(task_id);
        if t.status != TaskStatus::Approved || t.reward_state == RewardState::Done {
            env::log_str("finish_reward: task not in reward flow, ignored");
            return;
        }
        t.reward_state = RewardState::Done;
        t.status = TaskStatus::Rewarded;
        let baseline = t.metric_value_at_approval.unwrap_or(t.metric_value_at_open);
        self.rule_baselines.insert(t.rule_id.clone(), baseline);
        if self.open_task_by_rule.get(&t.rule_id) == Some(&task_id) {
            self.open_task_by_rule.remove(&t.rule_id);
        }
        self.tasks.insert(task_id, t.clone());
        let claimer = t
            .claimer
            .clone()
            .unwrap_or_else(|| env::panic_str("E_BAD_STATE: task has no claimer"));
        self.emit(
            "task_rewarded",
            json!({
                "task_id": t.id,
                "rule_id": t.rule_id,
                "claimer": claimer,
                "right_ids": t.minted_right_ids,
                "cash": t.reward_cash,
                "cash_op_id": t.cash_op_id,
                "new_baseline": baseline,
            }),
        );
        self.record_reputation(&claimer, REP_MAINTENANCE, task_id);
    }

    pub(crate) fn fail_reward(&mut self, task_id: u64, reason: &str) {
        self.set_reward_state(
            task_id,
            RewardState::Failed {
                reason: reason.to_string(),
            },
        );
        self.emit(
            "reward_failed",
            json!({ "task_id": task_id.to_string(), "reason": reason }),
        );
    }
}

#[near]
impl AssetContract {
    /// Callback of `commons.mint_rights`. Acts only while the task is `RightsPending`.
    #[private]
    pub fn on_rights_minted(&mut self, task_id: U64) -> bool {
        let ids: Option<Vec<TokenId>> = promise_bytes(MAX_MINT_RESULT_LEN)
            .and_then(|bytes| serde_json::from_slice(&bytes).ok());
        let mut t = match self.tasks.get(&task_id.0) {
            Some(t) if t.reward_state == RewardState::RightsPending => t.clone(),
            _ => {
                env::log_str("on_rights_minted: task not RightsPending, ignored");
                return false;
            }
        };
        match ids {
            Some(ids) => {
                self.roll_period();
                self.period.rights_reserved =
                    self.period.rights_reserved.saturating_sub(t.reward_rights);
                self.period.rights_minted += t.reward_rights;
                t.minted_right_ids = ids.clone();
                self.tasks.insert(task_id.0, t);
                self.emit(
                    "rights_received",
                    json!({ "task_id": task_id, "right_ids": ids }),
                );
                self.cash_step(task_id.0);
                true
            }
            None => {
                self.fail_reward(task_id.0, "E_MINT_FAILED");
                false
            }
        }
    }

    /// ANY. Restarts a `Failed` reward from the step that failed (mint or cash transfer).
    pub fn retry_reward(&mut self, task_id: U64) {
        let t = self.get_task_or_panic(task_id.0);
        require!(
            t.status == TaskStatus::Approved,
            "E_ALREADY_REWARDED: task is not in the reward flow"
        );
        require!(
            matches!(t.reward_state, RewardState::Failed { .. }),
            "E_BAD_STATE: reward has not failed"
        );
        match t.cash_op_id {
            Some(op_id) => self.resend_failed_op(op_id.0),
            None => self.mint_step(task_id.0),
        }
    }
}
