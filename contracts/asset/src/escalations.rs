//! Escalations to the community's Sputnik DAO (CONTRACT_SPEC §3.5, DAO_INTEGRATION §5).
//!
//! The asset itself opens a Sputnik `Transfer` proposal with the DAO's `proposal_bond` attached
//! from `float_free` (never from deposits or reserved rewards). The bond is a `Bond` op: it
//! succeeds when `add_proposal` returns an id (bond → `bonds_outstanding`) and fails (bond back
//! to float) otherwise. Sputnik returns the bond as a plain transfer on Approved, Rejected and
//! finalized Expired; `sync_escalation` credits it back to `float_free` exactly once, or writes
//! it off when the proposal was Removed (D-102). Outstanding bonds are excluded from
//! reconciliation so an early refund is never counted twice.
//!
//! Kept isolated so the documented fallback (`escalation_requested` + `link_escalation`,
//! RESEARCH C8) can replace `submit_proposal` without touching the rest of the contract.

use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{self, json, Value};
use near_sdk::{env, near, require, AccountId, NearToken, Promise};

use crate::ledger::{add, sub};
use crate::types::{Escalation, EscalationStatus, ExpenseState, OpKind, TaskStatus};
use crate::{
    check_len, promise_bytes, promise_succeeded, AssetContract, AssetContractExt, GAS_ADD_PROPOSAL,
    GAS_DAO_VIEW, GAS_ON_DAO_VIEW, GAS_ON_ESCALATION_SUBMITTED,
};

pub const MAX_OPEN_ESCALATIONS: u32 = 3;
pub const MAX_REASON_LEN: usize = 500;
pub const ESCALATION_KINDS: [&str; 4] = ["purchase", "cash_reward", "reimbursement", "other"];
pub const KIND_REIMBURSEMENT: &str = "reimbursement";
const MAX_PROPOSAL_LEN: usize = 32 * 1024;
const MAX_POLICY_LEN: usize = 64 * 1024;

/// Maps a Sputnik v2 `ProposalStatus` to an `EscalationStatus` (DAO_INTEGRATION §5).
pub fn map_dao_status(status: &str) -> Option<EscalationStatus> {
    match status {
        "InProgress" => Some(EscalationStatus::Submitted),
        "Approved" => Some(EscalationStatus::Approved),
        "Rejected" | "Removed" => Some(EscalationStatus::Rejected),
        "Expired" => Some(EscalationStatus::Expired),
        "Failed" | "Moved" => Some(EscalationStatus::Failed),
        _ => None,
    }
}

/// Parses `add_proposal`'s return value (`u64` as a JSON number, or a string).
fn parse_proposal_id(bytes: &[u8]) -> Option<u64> {
    match serde_json::from_slice::<Value>(bytes).ok()? {
        Value::Number(n) => n.as_u64(),
        Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

impl AssetContract {
    fn get_escalation_or_panic(&self, id: u64) -> Escalation {
        self.escalations
            .get(&id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("E_NOT_FOUND: unknown escalation"))
    }

    /// Reimbursement escalations move the task's expense state (D-017).
    fn set_expense_state(&mut self, task_id: Option<U64>, state: ExpenseState) {
        if let Some(mut t) = task_id.and_then(|id| self.tasks.get(&id.0).cloned()) {
            t.expense_state = state;
            self.tasks.insert(t.id.0, t);
        }
    }

    /// Reimbursement escalations decide the task's expense (verifier #4): Approved → Paid,
    /// Rejected by vote → Denied (terminal), Expired / Failed / Moved / Removed →
    /// NeedsEscalation (can be escalated again). Only the escalation the task points to counts.
    fn propagate_expense(&mut self, e: &Escalation, dao_status: &str) {
        if e.kind != KIND_REIMBURSEMENT {
            return;
        }
        let Some(mut t) = e.task_id.and_then(|id| self.tasks.get(&id.0).cloned()) else {
            return;
        };
        if t.expense_state
            != (ExpenseState::Escalated {
                escalation_id: e.id,
            })
        {
            return;
        }
        let next = match e.status {
            EscalationStatus::Approved => ExpenseState::Paid,
            EscalationStatus::Rejected if dao_status != "Removed" => ExpenseState::Denied,
            EscalationStatus::Rejected | EscalationStatus::Expired | EscalationStatus::Failed => {
                ExpenseState::NeedsEscalation
            }
            _ => return,
        };
        t.expense_state = next.clone();
        self.tasks.insert(t.id.0, t.clone());
        self.emit(
            "expense_state_changed",
            json!({
                "task_id": t.id,
                "escalation_id": e.id,
                "expense_state": next,
                "dao_status": dao_status,
                "reason": format!("DAO proposal {dao_status}"),
            }),
        );
    }

    fn close_escalation(&mut self, mut e: Escalation, status: EscalationStatus) -> Escalation {
        if e.status.is_open() && !status.is_open() {
            self.open_escalations = self.open_escalations.saturating_sub(1);
        }
        e.status = status;
        self.escalations.insert(e.id.0, e.clone());
        e
    }

    /// Opens the Sputnik Transfer proposal with the bond attached.
    fn submit_proposal(&self, e: &Escalation) {
        let description = format!(
            "COMMONKIT escalation {}#{}: {}",
            env::current_account_id(),
            e.id.0,
            e.reason
        );
        let args = json!({
            "proposal": {
                "description": description,
                "kind": { "Transfer": {
                    "token_id": "",
                    "receiver_id": e.receiver,
                    "amount": e.amount,
                    "msg": null,
                }},
            }
        });
        Promise::new(self.dao_id.clone())
            .function_call(
                "add_proposal".to_string(),
                args.to_string().into_bytes(),
                NearToken::from_yoctonear(e.bond_paid.0),
                GAS_ADD_PROPOSAL,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_ESCALATION_SUBMITTED)
                    .on_escalation_submitted(e.id),
            )
            .detach();
    }
}

#[near]
impl AssetContract {
    /// AGENT or ROLE(council). Asks the DAO to pay `amount` to `receiver` through a Sputnik
    /// Transfer proposal. At most 3 open escalations; the bond comes from `float_free`.
    pub fn escalate(
        &mut self,
        kind: String,
        receiver: AccountId,
        amount: U128,
        reason: String,
        task_id: Option<U64>,
    ) -> U64 {
        let (caller, _) = self.assert_agent_or_council();
        require!(
            ESCALATION_KINDS.contains(&kind.as_str()),
            "E_INVALID_ARGS: kind must be purchase, cash_reward, reimbursement or other"
        );
        require!(amount.0 > 0, "E_WRONG_AMOUNT: amount must be > 0");
        require!(
            !reason.is_empty(),
            "E_INVALID_ARGS: reason must not be empty"
        );
        check_len(
            &reason,
            MAX_REASON_LEN,
            "E_INVALID_ARGS: reason longer than 500 characters",
        );
        if let Some(t) = task_id {
            self.get_task_or_panic(t.0);
        }
        if kind == KIND_REIMBURSEMENT {
            let t = self.get_task_or_panic(
                task_id
                    .unwrap_or_else(|| {
                        env::panic_str("E_INVALID_ARGS: reimbursement needs task_id")
                    })
                    .0,
            );
            require!(
                matches!(t.status, TaskStatus::Approved | TaskStatus::Rewarded),
                "E_BAD_STATE: task is not approved"
            );
            require!(
                t.expense_state == ExpenseState::NeedsEscalation,
                "E_BAD_STATE: task expense does not need an escalation"
            );
            require!(
                t.claimer.as_ref() == Some(&receiver) && t.expense == amount,
                "E_INVALID_ARGS: reimbursement must pay the claimer exactly the expense"
            );
        }
        require!(
            self.open_escalations < MAX_OPEN_ESCALATIONS,
            "E_TOO_MANY_ESCALATIONS: too many open escalations"
        );
        let bond = self
            .dao_proposal_bond
            .unwrap_or_else(|| env::panic_str("E_BAD_STATE: call refresh_dao_policy first"));
        require!(
            self.ledger.float_free >= bond,
            "E_INSUFFICIENT_FLOAT: float cannot cover the proposal bond"
        );

        let id = self.next_escalation_id;
        self.next_escalation_id += 1;
        self.ledger.float_free -= bond;
        let dao = self.dao_id.clone();
        let bond_op = self.create_op(OpKind::Bond, dao, bond, Some(id));
        let e = Escalation {
            id: U64(id),
            requested_by: caller.clone(),
            kind: kind.clone(),
            receiver: receiver.clone(),
            amount,
            reason: reason.clone(),
            task_id,
            proposal_id: None,
            status: EscalationStatus::Submitting,
            bond_paid: U128(bond),
            bond_op_id: Some(U64(bond_op)),
            bond_settled: false,
            bond_lost: false,
            submission_time: None,
            dao_status: None,
            submitted_at: U64(Self::now()),
        };
        self.escalations.insert(id, e.clone());
        self.open_escalations += 1;
        if kind == KIND_REIMBURSEMENT {
            self.set_expense_state(
                task_id,
                ExpenseState::Escalated {
                    escalation_id: U64(id),
                },
            );
        }
        self.emit(
            "escalation_created",
            json!({
                "escalation_id": id.to_string(),
                "requested_by": caller,
                "kind": kind,
                "receiver": receiver,
                "amount": amount,
                "reason": reason,
                "task_id": task_id,
                "bond": bond.to_string(),
                "bond_op_id": bond_op.to_string(),
            }),
        );
        self.submit_proposal(&e);
        U64(id)
    }

    /// Callback of `dao.add_proposal`. Stores the proposal id and moves the bond to
    /// `bonds_outstanding`; on failure the bond returns to the float and the escalation is
    /// `Failed`. A succeeded call with an unreadable id writes the bond off (D-102).
    #[private]
    pub fn on_escalation_submitted(&mut self, escalation_id: U64) -> bool {
        let succeeded = promise_succeeded();
        let proposal_id = promise_bytes(64).and_then(|b| parse_proposal_id(&b));
        let mut e = match self.escalations.get(&escalation_id.0) {
            Some(e) if e.status == EscalationStatus::Submitting => e.clone(),
            _ => {
                env::log_str("on_escalation_submitted: escalation not submitting, ignored");
                return false;
            }
        };
        if let Some(op) = e.bond_op_id {
            // The bond is spent whenever add_proposal succeeded, even if its id is unreadable.
            self.settle_op(op.0, succeeded);
        }
        let bond = e.bond_paid.0;
        let ok = succeeded && proposal_id.is_some();
        e.proposal_id = proposal_id.map(U64);
        let e = if ok {
            self.ledger.bonds_outstanding =
                add(self.ledger.bonds_outstanding, bond, "bonds_outstanding");
            self.close_escalation(e, EscalationStatus::Submitted)
        } else if succeeded {
            e.dao_status = Some("unreadable proposal id".to_string());
            e.bond_lost = true;
            e.bond_settled = true;
            self.ledger.total_bonds_lost = add(self.ledger.total_bonds_lost, bond, "total");
            self.close_escalation(e, EscalationStatus::Failed)
        } else {
            e.dao_status = Some("add_proposal failed".to_string());
            if e.kind == KIND_REIMBURSEMENT {
                self.set_expense_state(e.task_id, ExpenseState::NeedsEscalation);
            }
            e.bond_settled = true;
            self.close_escalation(e, EscalationStatus::Failed)
        };
        self.emit(
            "escalation_submitted",
            json!({
                "escalation_id": escalation_id,
                "ok": ok,
                "proposal_id": e.proposal_id,
                "status": e.status,
                "bond": e.bond_paid,
            }),
        );
        ok
    }

    /// ANY. Reads `dao.get_proposal(proposal_id)` and maps its status. Allowed while the
    /// escalation has a proposal id and its bond is not settled yet.
    pub fn sync_escalation(&mut self, escalation_id: U64) {
        let e = self.get_escalation_or_panic(escalation_id.0);
        let proposal_id = e
            .proposal_id
            .unwrap_or_else(|| env::panic_str("E_BAD_STATE: escalation has no proposal id"));
        require!(
            !e.bond_settled,
            "E_BAD_STATE: escalation is final and its bond settled"
        );
        Promise::new(self.dao_id.clone())
            .function_call(
                "get_proposal".to_string(),
                json!({ "id": proposal_id.0 }).to_string().into_bytes(),
                NearToken::from_yoctonear(0),
                GAS_DAO_VIEW,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_DAO_VIEW)
                    .on_escalation_synced(escalation_id),
            )
            .detach();
    }

    /// Callback of `dao.get_proposal` (D-102):
    /// - failed call → the proposal was Removed (deleted): `Rejected`, bond lost;
    /// - `InProgress` past `submission_time + proposal_period` → `Expired` (bond stays outstanding
    ///   until a council `Finalize` stores `Expired` and Sputnik returns it);
    /// - stored `Approved` / `Rejected` / `Expired` → mapped, bond back to `float_free` once;
    /// - `Failed` / `Moved` → `Failed`, bond stays outstanding.
    #[private]
    pub fn on_escalation_synced(&mut self, escalation_id: U64) -> bool {
        let succeeded = promise_succeeded();
        let proposal: Option<Value> =
            promise_bytes(MAX_PROPOSAL_LEN).and_then(|b| serde_json::from_slice::<Value>(&b).ok());
        let mut e = match self.escalations.get(&escalation_id.0) {
            Some(e) if e.proposal_id.is_some() && !e.bond_settled => e.clone(),
            _ => {
                env::log_str("on_escalation_synced: nothing to sync, ignored");
                return false;
            }
        };
        let bond = e.bond_paid.0;
        let (dao_status, mapped) = if !succeeded {
            // get_proposal panics ERR_NO_PROPOSAL only for a Removed (deleted) proposal.
            e.bond_lost = true;
            e.bond_settled = true;
            let l = &mut self.ledger;
            l.bonds_outstanding = sub(l.bonds_outstanding, bond, "bonds_outstanding");
            l.total_bonds_lost = add(l.total_bonds_lost, bond, "total");
            ("Removed".to_string(), EscalationStatus::Rejected)
        } else {
            let Some(p) = proposal else {
                env::log_str("on_escalation_synced: unreadable proposal");
                return false;
            };
            let Some(status) = p.get("status").and_then(|s| s.as_str()).map(str::to_string) else {
                env::log_str("on_escalation_synced: proposal without status");
                return false;
            };
            let submitted_at = p
                .get("submission_time")
                .and_then(|s| s.as_str())
                .and_then(|s| s.parse::<u64>().ok());
            e.submission_time = submitted_at.map(U64);
            let Some(mut mapped) = map_dao_status(&status) else {
                env::log_str("on_escalation_synced: unknown proposal status");
                return false;
            };
            if status == "InProgress" {
                if let (Some(at), Some(period)) = (submitted_at, self.dao_proposal_period) {
                    if at.saturating_add(period) < Self::now() {
                        mapped = EscalationStatus::Expired;
                    }
                }
            }
            if matches!(status.as_str(), "Approved" | "Rejected" | "Expired") {
                e.bond_settled = true;
                let l = &mut self.ledger;
                l.bonds_outstanding = sub(l.bonds_outstanding, bond, "bonds_outstanding");
                l.float_free = add(l.float_free, bond, "float_free");
                l.total_bonds_returned = add(l.total_bonds_returned, bond, "total");
            }
            if matches!(status.as_str(), "Failed" | "Moved") {
                // Sputnik keeps the bond while Failed; settle it as spent. A later refund or
                // policy difference arrives as untracked balance and is reconciled (D-204).
                e.bond_settled = true;
                let l = &mut self.ledger;
                l.bonds_outstanding = sub(l.bonds_outstanding, bond, "bonds_outstanding");
                l.total_bonds_lost = add(l.total_bonds_lost, bond, "total");
            }
            (status, mapped)
        };
        e.dao_status = Some(dao_status.clone());
        let e = self.close_escalation(e, mapped);
        self.propagate_expense(&e, &dao_status);
        self.emit(
            "escalation_synced",
            json!({
                "escalation_id": escalation_id,
                "proposal_id": e.proposal_id,
                "dao_status": dao_status,
                "status": e.status,
                "bond_settled": e.bond_settled,
                "bond_lost": e.bond_lost,
            }),
        );
        true
    }

    /// ANY. Reads `dao.get_policy()` and caches `proposal_bond` and `proposal_period`.
    pub fn refresh_dao_policy(&mut self) {
        Promise::new(self.dao_id.clone())
            .function_call(
                "get_policy".to_string(),
                b"{}".to_vec(),
                NearToken::from_yoctonear(0),
                GAS_DAO_VIEW,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_DAO_VIEW)
                    .on_dao_policy(),
            )
            .detach();
    }

    #[private]
    pub fn on_dao_policy(&mut self) -> bool {
        let policy =
            promise_bytes(MAX_POLICY_LEN).and_then(|b| serde_json::from_slice::<Value>(&b).ok());
        let field =
            |name: &str| -> Option<u128> { policy.as_ref()?.get(name)?.as_str()?.parse().ok() };
        let bond = field("proposal_bond");
        let period = field("proposal_period").and_then(|p| u64::try_from(p).ok());
        match (bond, period) {
            (Some(bond), Some(period)) => {
                self.dao_proposal_bond = Some(bond);
                self.dao_proposal_period = Some(period);
                self.emit(
                    "dao_policy_refreshed",
                    json!({
                        "proposal_bond": bond.to_string(),
                        "proposal_period": period.to_string(),
                    }),
                );
                true
            }
            _ => {
                env::log_str("on_dao_policy: get_policy failed or unreadable");
                false
            }
        }
    }
}
