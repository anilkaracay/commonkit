use super::*;

const DEP: u128 = 2 * N;

fn closed_clean(h: &mut H) -> u64 {
    let start = h.now_slot() + 1;
    let id = h.confirmed(&alice(), start, 1);
    h.now = start * SLOT;
    h.call(&bridge(), 0, |c| c.mark_session_started(U64(id)));
    h.call(&bridge(), 0, |c| c.mark_session_finished(U64(id), vec![]));
    h.call(&steward(), 0, |c| {
        c.confirm_return(U64(id), ReturnResult::Clean)
    });
    id
}

#[test]
fn sweep_moves_excess_to_dao() {
    let mut h = H::wired(0);
    h.c.ledger.float_free = 0;
    h.balance += 4 * N; // e.g. a direct transfer to the asset account
    let op = h.call(&bob(), 0, |c| c.sweep()).unwrap();
    assert_eq!(h.c.ledger.float_free, 3 * N);
    assert_eq!(h.op(op.0).amount.0, N);
    assert_eq!(transfers(), vec![(dao(), N)]);
    h.settle(op.0, true);
    assert_eq!(h.c.ledger.total_swept, N);
    assert_eq!(h.c.ledger.pending_out, 0);
    assert!(h.invariant_ok());
}

#[test]
fn sweep_is_noop_under_cap() {
    let mut h = H::wired(N);
    assert!(h.call(&bob(), 0, |c| c.sweep()).is_none());
    assert!(transfers().is_empty());
    assert_eq!(h.c.ledger.float_free, N);
}

#[test]
fn sweep_never_touches_deposits_or_rewards() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 4;
    h.confirmed(&alice(), start, 4); // 1 N fee, 2 N deposit
    h.c.ledger.rewards_reserved = 0;
    h.call(&dao(), 10 * N, |c| c.fund_float());
    h.settle_all();
    assert_eq!(h.c.ledger.float_free, 3 * N);
    assert_eq!(h.c.ledger.deposits_held, DEP);
    assert_eq!(h.c.ledger.total_swept, 8 * N);
    assert!(h.invariant_ok());
}

#[test]
fn on_op_result_failed_refund_keeps_claim_and_retry_pays_once() {
    let mut h = H::wired(0);
    closed_clean(&mut h);
    let op = h.last_op();
    assert_eq!((op.kind, op.status), (OpKind::Refund, OpStatus::Pending));
    assert_eq!(h.c.ledger.deposits_held, 0);
    assert_eq!(h.c.ledger.pending_out, DEP);
    assert!(!h.settle(op.id.0, false));
    assert_eq!(h.op(op.id.0).status, OpStatus::Failed);
    assert_eq!(h.c.ledger.deposits_held, DEP);
    assert_eq!(h.c.ledger.pending_out, 0);
    assert_eq!(events("op_result")[0]["status"], "Failed");
    assert!(h.invariant_ok());
    h.call(&bob(), 0, |c| c.retry_op(op.id));
    assert_eq!(transfers(), vec![(alice(), DEP)]);
    assert_eq!(h.op(op.id.0).attempts, 2);
    assert_eq!(h.c.ledger.deposits_held, 0);
    assert!(h.settle(op.id.0, true));
    assert_eq!(h.c.ledger.total_refunded, DEP);
    assert!(h.invariant_ok());
}

#[test]
#[should_panic(expected = "E_OP_NOT_RETRYABLE")]
fn retry_op_rejects_pending() {
    let mut h = H::wired(0);
    closed_clean(&mut h);
    let op = h.last_op().id;
    h.call(&bob(), 0, |c| c.retry_op(op));
}

#[test]
#[should_panic(expected = "E_OP_NOT_RETRYABLE")]
fn retry_op_rejects_succeeded() {
    let mut h = H::wired(0);
    closed_clean(&mut h);
    let op = h.last_op().id;
    h.settle(op.0, true);
    h.call(&bob(), 0, |c| c.retry_op(op));
}

#[test]
#[should_panic(expected = "E_NOT_FOUND")]
fn retry_op_rejects_unknown() {
    let mut h = H::wired(0);
    h.call(&bob(), 0, |c| c.retry_op(U64(99)));
}

#[test]
fn failed_sweep_returns_to_float_and_retry_needs_float() {
    let mut h = H::new();
    h.call(&dao(), 5 * N, |c| c.fund_float());
    let op = h.last_op();
    h.settle(op.id.0, false);
    assert_eq!(h.c.ledger.float_free, 5 * N);
    assert!(h.invariant_ok());
    h.call(&bob(), 0, |c| c.retry_op(op.id));
    assert_eq!(h.c.ledger.float_free, 3 * N);
    h.settle(op.id.0, true);
    assert_eq!(h.c.ledger.total_swept, 2 * N);
}

#[test]
#[should_panic(expected = "E_INSUFFICIENT_FLOAT")]
fn retry_op_sweep_rejects_without_float() {
    let mut h = H::new();
    h.call(&dao(), 5 * N, |c| c.fund_float());
    let op = h.last_op();
    h.settle(op.id.0, false);
    h.c.ledger.float_free = N;
    h.call(&bob(), 0, |c| c.retry_op(op.id));
}

#[test]
fn on_op_result_ignores_settled_op() {
    let mut h = H::wired(0);
    closed_clean(&mut h);
    let op = h.last_op().id.0;
    assert!(h.settle(op, true));
    assert!(!h.settle(op, true));
    assert_eq!(h.c.ledger.total_refunded, DEP);
}

#[test]
fn reconcile_ignores_in_flight_money() {
    let mut h = H::wired(0);
    closed_clean(&mut h);
    let op = h.last_op().id.0;
    // the bounced refund arrives before our callback: it must not become float
    h.balance += DEP;
    h.call(&bob(), 0, |c| c.sweep());
    assert_eq!(h.c.ledger.float_free, N / 4);
    h.callback(PromiseResult::Failed, |c| c.on_op_result(U64(op)));
    assert_eq!(h.c.ledger.deposits_held, DEP);
    assert!(h.invariant_ok());
}
