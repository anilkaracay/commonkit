//! Outbound operations, sweep and retry (CONTRACT_SPEC §2.7, §3.4).
//!
//! Every outbound transfer or right-sync call is an `OutboundOp`: `Pending` → `Succeeded` |
//! `Failed`. A failed op's amount goes back to its source bucket, so the claim stays visible and
//! retryable; `retry_op` only re-sends `Failed` ops, so a retry can never double pay.
//!
//! | kind          | source bucket (on create / on failure) | success total          |
//! | :------------ | :------------------------------------- | :--------------------- |
//! | Refund        | deposits_held                          | total_refunded         |
//! | Sweep         | float_free                             | total_swept            |
//! | CashReward    | rewards_reserved                       | total_rewards_paid     |
//! | Reimbursement | rewards_reserved                       | total_reimbursed       |
//! | ProtocolFee   | protocol_fees_owed                     | total_protocol_fees    |
//! | Bond          | float_free (escalations.rs)            | total_bonds_paid       |
//! | RightRelease / RightFinalize | — (amount 0)            | —                      |

use commonkit_types::commons_iface::{
    RightRefArgs, GAS_FINALIZE_RIGHT, GAS_RELEASE_RIGHT, METHOD_FINALIZE_RIGHT,
    METHOD_RELEASE_RIGHT,
};
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{self, json};
use near_sdk::{env, near, require, AccountId, NearToken, Promise};

use crate::ledger::{add, sub};
use crate::types::{OpKind, OpStatus, OutboundOp};
use crate::{promise_succeeded, AssetContract, AssetContractExt, GAS_ON_OP_RESULT};

impl AssetContract {
    /// Records a new Pending op. The caller has already moved `amount` out of its source bucket
    /// (or out of `pending_in`); this adds it to `pending_out`.
    pub(crate) fn create_op(
        &mut self,
        kind: OpKind,
        to: AccountId,
        amount: u128,
        ref_id: Option<u64>,
    ) -> u64 {
        let id = self.next_op_id;
        self.next_op_id += 1;
        let now = Self::now();
        self.ledger.pending_out = add(self.ledger.pending_out, amount, "pending_out");
        self.ops.insert(
            id,
            OutboundOp {
                id: U64(id),
                kind,
                to: to.clone(),
                amount: U128(amount),
                ref_id: ref_id.map(U64),
                status: OpStatus::Pending,
                attempts: 1,
                created_at: U64(now),
                updated_at: U64(now),
            },
        );
        self.emit(
            "op_created",
            json!({
                "op_id": id.to_string(),
                "kind": kind,
                "to": to,
                "amount": amount.to_string(),
                "ref_id": ref_id.map(|r| r.to_string()),
            }),
        );
        id
    }

    /// Creates a transfer-kind op whose amount was already taken from its bucket, and sends it.
    pub(crate) fn create_and_send(
        &mut self,
        kind: OpKind,
        to: AccountId,
        amount: u128,
        ref_id: Option<u64>,
    ) -> u64 {
        let id = self.create_op(kind, to, amount, ref_id);
        self.send_op(id);
        id
    }

    /// Schedules the promise for a Pending op with the `on_op_result` callback.
    pub(crate) fn send_op(&self, op_id: u64) {
        let op = self
            .ops
            .get(&op_id)
            .unwrap_or_else(|| env::panic_str("E_NOT_FOUND: unknown op"));
        let callback = Self::ext(env::current_account_id())
            .with_static_gas(GAS_ON_OP_RESULT)
            .on_op_result(U64(op_id));
        let first = match op.kind {
            OpKind::Refund
            | OpKind::Sweep
            | OpKind::CashReward
            | OpKind::Reimbursement
            | OpKind::ProtocolFee => {
                Promise::new(op.to.clone()).transfer(NearToken::from_yoctonear(op.amount.0))
            }
            OpKind::RightRelease | OpKind::RightFinalize => {
                let reservation_id = op
                    .ref_id
                    .unwrap_or_else(|| env::panic_str("E_BAD_STATE: right op without reservation"));
                let reservation = self
                    .reservations
                    .get(&reservation_id.0)
                    .unwrap_or_else(|| env::panic_str("E_NOT_FOUND: unknown reservation"));
                let token_id = reservation
                    .right_id
                    .clone()
                    .unwrap_or_else(|| env::panic_str("E_BAD_STATE: reservation has no right"));
                let args = serde_json::to_vec(&RightRefArgs {
                    token_id,
                    reservation_id,
                })
                .unwrap_or_else(|_| env::panic_str("E_BAD_STATE: args"));
                let (method, gas) = if op.kind == OpKind::RightRelease {
                    (METHOD_RELEASE_RIGHT, GAS_RELEASE_RIGHT)
                } else {
                    (METHOD_FINALIZE_RIGHT, GAS_FINALIZE_RIGHT)
                };
                Promise::new(op.to.clone()).function_call(
                    method.to_string(),
                    args,
                    NearToken::from_yoctonear(0),
                    gas,
                )
            }
            OpKind::Bond => env::panic_str("E_OP_NOT_RETRYABLE: bonds are sent by escalate"),
        };
        first.then(callback).detach();
    }

    /// Creates and sends a RightRelease / RightFinalize op for a reservation's right.
    pub(crate) fn sync_right(&mut self, reservation_id: u64, kind: OpKind) {
        let commons = self.commons_id.clone();
        let op_id = self.create_op(kind, commons, 0, Some(reservation_id));
        if let Some(mut r) = self.reservations.get(&reservation_id).cloned() {
            r.right_op_id = Some(U64(op_id));
            self.reservations.insert(reservation_id, r);
        }
        self.send_op(op_id);
    }

    /// Moves `amount` back into the op kind's source bucket (failure path).
    fn credit_source(&mut self, kind: OpKind, amount: u128) {
        let l = &mut self.ledger;
        match kind {
            OpKind::Refund => l.deposits_held = add(l.deposits_held, amount, "deposits_held"),
            OpKind::Sweep | OpKind::Bond => l.float_free = add(l.float_free, amount, "float_free"),
            OpKind::CashReward | OpKind::Reimbursement => {
                l.rewards_reserved = add(l.rewards_reserved, amount, "rewards_reserved")
            }
            OpKind::ProtocolFee => {
                l.protocol_fees_owed = add(l.protocol_fees_owed, amount, "protocol_fees_owed")
            }
            OpKind::RightRelease | OpKind::RightFinalize => {}
        }
    }

    /// Takes `amount` out of the op kind's source bucket (retry path).
    fn debit_source(&mut self, kind: OpKind, amount: u128) {
        let l = &mut self.ledger;
        match kind {
            OpKind::Refund => l.deposits_held = sub(l.deposits_held, amount, "deposits_held"),
            OpKind::Sweep => {
                require!(
                    l.float_free >= amount,
                    "E_INSUFFICIENT_FLOAT: float_free below sweep amount"
                );
                l.float_free -= amount;
            }
            OpKind::CashReward | OpKind::Reimbursement => {
                l.rewards_reserved = sub(l.rewards_reserved, amount, "rewards_reserved")
            }
            OpKind::ProtocolFee => {
                l.protocol_fees_owed = sub(l.protocol_fees_owed, amount, "protocol_fees_owed")
            }
            OpKind::RightRelease | OpKind::RightFinalize => {}
            OpKind::Bond => env::panic_str("E_OP_NOT_RETRYABLE: bonds are sent by escalate"),
        }
    }

    /// Re-sends a Failed op (shared by `retry_op` and `retry_reward`).
    pub(crate) fn resend_failed_op(&mut self, op_id: u64) {
        let mut op = self
            .ops
            .get(&op_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("E_NOT_FOUND: unknown op"));
        require!(
            op.status == OpStatus::Failed,
            "E_OP_NOT_RETRYABLE: only Failed ops can be retried"
        );
        require!(
            op.kind != OpKind::Bond,
            "E_OP_NOT_RETRYABLE: bonds are re-sent by a new escalation"
        );
        self.debit_source(op.kind, op.amount.0);
        self.ledger.pending_out = add(self.ledger.pending_out, op.amount.0, "pending_out");
        op.status = OpStatus::Pending;
        op.attempts += 1;
        op.updated_at = U64(Self::now());
        self.ops.insert(op_id, op);
        self.emit("op_retried", json!({ "op_id": op_id.to_string() }));
        self.send_op(op_id);
    }

    /// Reconciles unaccounted balance into `float_free` and sweeps anything above `float_cap`
    /// to the DAO. Returns the sweep op id, if any.
    pub(crate) fn maybe_sweep(&mut self) -> Option<u64> {
        self.reconcile();
        let cap = self.profile.float_cap.0;
        if self.ledger.float_free <= cap {
            return None;
        }
        let excess = self.ledger.float_free - cap;
        self.ledger.float_free = cap;
        let dao = self.dao_id.clone();
        let op_id = self.create_and_send(OpKind::Sweep, dao, excess, None);
        self.emit(
            "swept",
            json!({ "op_id": op_id.to_string(), "amount": excess.to_string() }),
        );
        Some(op_id)
    }

    /// Balance above the storage reserve that belongs to no bucket (direct transfers, returned
    /// Sputnik bonds, gas rewards) becomes float (D-204). Returns the amount moved.
    pub(crate) fn reconcile(&mut self) -> u128 {
        let extra = self.ledger.unaccounted(
            env::account_balance().as_yoctonear(),
            self.profile.storage_reserve.0,
        );
        if extra > 0 {
            self.ledger.float_free = add(self.ledger.float_free, extra, "float_free");
        }
        extra
    }
}

#[near]
impl AssetContract {
    /// ANY. Sweeps `float_free - float_cap` to the DAO if positive. Returns the op id.
    pub fn sweep(&mut self) -> Option<U64> {
        self.maybe_sweep().map(U64)
    }

    /// ANY. Re-sends a `Failed` op. `Succeeded` and `Pending` ops are never re-sent.
    pub fn retry_op(&mut self, op_id: U64) {
        self.resend_failed_op(op_id.0);
    }

    #[private]
    pub fn on_op_result(&mut self, op_id: U64) -> bool {
        let ok = promise_succeeded();
        self.settle_op(op_id.0, ok)
    }
}

impl AssetContract {
    /// Resolves a Pending op as succeeded or failed. Returns `ok`, or `false` when the op was
    /// not pending (ignored).
    pub(crate) fn settle_op(&mut self, op_id: u64, ok: bool) -> bool {
        let mut op = match self.ops.get(&op_id) {
            Some(op) if op.status == OpStatus::Pending => op.clone(),
            _ => {
                env::log_str("on_op_result: op not pending, ignored");
                return false;
            }
        };
        let amount = op.amount.0;
        self.ledger.pending_out = sub(self.ledger.pending_out, amount, "pending_out");
        op.status = if ok {
            OpStatus::Succeeded
        } else {
            OpStatus::Failed
        };
        op.updated_at = U64(Self::now());
        let kind = op.kind;
        let ref_id = op.ref_id.map(|r| r.0);
        self.ops.insert(op_id, op);

        if ok {
            let l = &mut self.ledger;
            match kind {
                OpKind::Refund => l.total_refunded = add(l.total_refunded, amount, "total"),
                OpKind::Sweep => l.total_swept = add(l.total_swept, amount, "total"),
                OpKind::CashReward => {
                    l.total_rewards_paid = add(l.total_rewards_paid, amount, "total")
                }
                OpKind::Reimbursement => {
                    l.total_reimbursed = add(l.total_reimbursed, amount, "total")
                }
                OpKind::ProtocolFee => {
                    l.total_protocol_fees = add(l.total_protocol_fees, amount, "total")
                }
                OpKind::Bond => l.total_bonds_paid = add(l.total_bonds_paid, amount, "total"),
                OpKind::RightRelease | OpKind::RightFinalize => {}
            }
        } else {
            self.credit_source(kind, amount);
        }
        self.emit(
            "op_result",
            json!({
                "op_id": op_id.to_string(),
                "kind": kind,
                "status": if ok { "Succeeded" } else { "Failed" },
                "amount": amount.to_string(),
                "ref_id": ref_id.map(|r| r.to_string()),
            }),
        );
        if matches!(kind, OpKind::CashReward | OpKind::Reimbursement) {
            if let Some(task_id) = ref_id {
                self.on_task_op_settled(task_id, kind, ok);
            }
        }
        ok
    }
}
