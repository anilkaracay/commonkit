use super::*;
use crate::escalations::map_dao_status;

const BOND: u128 = N;
const PERIOD: u64 = 7 * DAY;

fn policy_json() -> Vec<u8> {
    format!(
        r#"{{"roles":[],"default_vote_policy":{{}},"proposal_bond":"{BOND}","proposal_period":"{PERIOD}","bounty_bond":"1","bounty_forgiveness_period":"1"}}"#
    )
    .into_bytes()
}

fn with_policy(float: u128) -> H {
    let mut h = H::wired(float);
    h.settle_all();
    h.call(&bob(), 0, |c| c.refresh_dao_policy());
    h.callback(PromiseResult::Successful(policy_json()), |c| {
        c.on_dao_policy()
    });
    h
}

fn escalate(h: &mut H) -> u64 {
    h.call(&agent(), 0, |c| {
        c.escalate(
            "purchase".to_string(),
            bob(),
            U128(5 * N),
            "replace nozzle".to_string(),
            None,
        )
    })
    .0
}

fn submitted(h: &mut H) -> u64 {
    let id = escalate(h);
    h.callback(PromiseResult::Successful(b"7".to_vec()), |c| {
        c.on_escalation_submitted(U64(id))
    });
    id
}

fn proposal(status: &str, submitted_at: u64) -> PromiseResult {
    PromiseResult::Successful(
        format!(
            r#"{{"id":7,"proposer":"printer.makerlab.testnet","description":"x","kind":{{}},"status":"{status}","vote_counts":{{}},"votes":{{}},"submission_time":"{submitted_at}"}}"#
        )
        .into_bytes(),
    )
}

fn sync(h: &mut H, id: u64, result: PromiseResult) -> bool {
    h.call(&bob(), 0, |c| c.sync_escalation(U64(id)));
    h.callback(result, |c| c.on_escalation_synced(U64(id)))
}

#[test]
fn refresh_dao_policy_caches_bond_and_period() {
    let mut h = H::wired(0);
    h.call(&bob(), 0, |c| c.refresh_dao_policy());
    let call = calls()
        .into_iter()
        .find(|c| c.method == "get_policy")
        .unwrap();
    assert_eq!(call.receiver, dao());
    assert!(h.callback(PromiseResult::Successful(policy_json()), |c| c
        .on_dao_policy()));
    assert_eq!(h.c.dao_proposal_bond, Some(BOND));
    assert_eq!(h.c.dao_proposal_period, Some(PERIOD));
}

#[test]
fn on_dao_policy_ignores_failure() {
    let mut h = H::wired(0);
    assert!(!h.callback(PromiseResult::Failed, |c| c.on_dao_policy()));
    assert!(h.c.dao_proposal_bond.is_none());
}

#[test]
fn escalate_opens_transfer_proposal_with_bond_from_float() {
    let mut h = with_policy(3 * N);
    let id = escalate(&mut h);
    let call = calls()
        .into_iter()
        .find(|c| c.method == "add_proposal")
        .unwrap();
    assert_eq!(call.receiver, dao());
    assert_eq!(call.deposit, BOND);
    let t = &call.args["proposal"]["kind"]["Transfer"];
    assert_eq!(t["token_id"], "");
    assert_eq!(t["receiver_id"], "bob.testnet");
    assert_eq!(t["amount"], (5 * N).to_string());
    assert!(t["msg"].is_null());
    assert_eq!(
        call.args["proposal"]["description"],
        format!("COMMONKIT escalation {}#{id}: replace nozzle", asset())
    );
    assert_eq!(h.c.ledger.float_free, 2 * N);
    assert_eq!(h.c.ledger.pending_out, BOND);
    assert_eq!(h.c.open_escalations, 1);
    let e = h.c.escalations.get(&id).cloned().unwrap();
    assert_eq!(e.status, EscalationStatus::Submitting);
    assert_eq!(h.op(e.bond_op_id.unwrap().0).kind, OpKind::Bond);
    assert!(h.invariant_ok());
}

#[test]
fn escalate_by_council_member() {
    let mut h = with_policy(3 * N);
    h.call(&council(), 0, |c| {
        c.escalate("other".to_string(), bob(), U128(N), "r".to_string(), None)
    });
}

#[test]
#[should_panic(expected = "E_NOT_AGENT")]
fn escalate_rejects_other_accounts() {
    let mut h = with_policy(3 * N);
    h.call(&alice(), 0, |c| {
        c.escalate("other".to_string(), bob(), U128(N), "r".to_string(), None)
    });
}

#[test]
#[should_panic(expected = "E_NOT_AGENT")]
fn escalate_rejects_revoked_agent() {
    let mut h = with_policy(3 * N);
    h.call(&dao(), 0, |c| c.set_operators(Some(bridge()), None));
    escalate(&mut h);
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn escalate_requires_cached_policy() {
    let mut h = H::wired(3 * N);
    escalate(&mut h);
}

#[test]
#[should_panic(expected = "E_INSUFFICIENT_FLOAT")]
fn escalate_rejects_without_float_for_bond() {
    let mut h = with_policy(N / 2);
    escalate(&mut h);
}

#[test]
fn escalate_never_uses_deposits_for_bond() {
    let mut h = with_policy(0);
    let start = h.now_slot() + 2;
    h.confirmed(&alice(), start, 1); // 2 N deposit held, 0.25 N float
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| escalate(&mut h)));
    assert!(r.is_err());
    assert_eq!(h.c.ledger.deposits_held, 2 * N);
}

#[test]
#[should_panic(expected = "E_TOO_MANY_ESCALATIONS")]
fn escalate_rejects_fourth_open() {
    let mut h = with_policy(3 * N);
    h.c.ledger.float_free = 10 * N;
    for _ in 0..4 {
        escalate(&mut h);
    }
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn escalate_rejects_unknown_kind() {
    let mut h = with_policy(3 * N);
    h.call(&agent(), 0, |c| {
        c.escalate("bribe".to_string(), bob(), U128(N), "r".to_string(), None)
    });
}

#[test]
#[should_panic(expected = "E_WRONG_AMOUNT")]
fn escalate_rejects_zero_amount() {
    let mut h = with_policy(3 * N);
    h.call(&agent(), 0, |c| {
        c.escalate("other".to_string(), bob(), U128(0), "r".to_string(), None)
    });
}

#[test]
#[should_panic(expected = "E_NOT_FOUND")]
fn escalate_rejects_unknown_task() {
    let mut h = with_policy(3 * N);
    h.call(&agent(), 0, |c| {
        c.escalate(
            "other".to_string(),
            bob(),
            U128(N),
            "r".to_string(),
            Some(U64(5)),
        )
    });
}

#[test]
fn on_escalation_submitted_stores_id_and_outstanding_bond() {
    let mut h = with_policy(3 * N);
    let id = submitted(&mut h);
    let e = h.c.escalations.get(&id).cloned().unwrap();
    assert_eq!(
        (e.status, e.proposal_id),
        (EscalationStatus::Submitted, Some(U64(7)))
    );
    assert_eq!(h.c.ledger.pending_out, 0);
    assert_eq!(h.c.ledger.bonds_outstanding, BOND);
    assert_eq!(h.c.ledger.total_bonds_paid, BOND);
    assert_eq!(h.op(e.bond_op_id.unwrap().0).status, OpStatus::Succeeded);
    assert!(h.invariant_ok());
}

#[test]
fn on_escalation_submitted_failure_returns_bond() {
    let mut h = with_policy(3 * N);
    let id = escalate(&mut h);
    h.balance += BOND; // the failed call's deposit is refunded
    assert!(!h.callback(PromiseResult::Failed, |c| c
        .on_escalation_submitted(U64(id))));
    let e = h.c.escalations.get(&id).cloned().unwrap();
    assert_eq!(e.status, EscalationStatus::Failed);
    assert_eq!(h.c.ledger.float_free, 3 * N);
    assert_eq!(h.c.ledger.pending_out, 0);
    assert_eq!(h.c.open_escalations, 0);
    assert_eq!(h.op(e.bond_op_id.unwrap().0).status, OpStatus::Failed);
    assert!(h.invariant_ok());
}

#[test]
fn on_escalation_submitted_unreadable_id_writes_bond_off() {
    let mut h = with_policy(3 * N);
    let id = escalate(&mut h);
    h.callback(PromiseResult::Successful(b"{}".to_vec()), |c| {
        c.on_escalation_submitted(U64(id))
    });
    let e = h.c.escalations.get(&id).cloned().unwrap();
    assert_eq!(e.status, EscalationStatus::Failed);
    assert!(e.bond_lost);
    assert_eq!(h.c.ledger.bonds_outstanding, 0);
    assert_eq!(h.c.ledger.total_bonds_lost, BOND);
}

#[test]
fn sync_escalation_approved_returns_bond_once() {
    let mut h = with_policy(3 * N);
    let id = submitted(&mut h);
    let get = {
        h.call(&bob(), 0, |c| c.sync_escalation(U64(id)));
        calls()
            .into_iter()
            .find(|c| c.method == "get_proposal")
            .unwrap()
    };
    assert_eq!(get.args["id"], 7);
    h.balance += BOND; // Sputnik returned the bond
    assert!(h.callback(proposal("Approved", T0), |c| c
        .on_escalation_synced(U64(id))));
    let e = h.c.escalations.get(&id).cloned().unwrap();
    assert_eq!(e.status, EscalationStatus::Approved);
    assert!(e.bond_settled && !e.bond_lost);
    assert_eq!(h.c.ledger.bonds_outstanding, 0);
    assert_eq!(h.c.ledger.float_free, 3 * N);
    assert_eq!(h.c.ledger.total_bonds_returned, BOND);
    assert_eq!(h.c.open_escalations, 0);
    assert!(h.invariant_ok());
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn sync_escalation_rejects_after_bond_settled() {
    let mut h = with_policy(3 * N);
    let id = submitted(&mut h);
    sync(&mut h, id, proposal("Rejected", T0));
    h.call(&bob(), 0, |c| c.sync_escalation(U64(id)));
}

#[test]
fn sync_escalation_in_progress_stays_submitted() {
    let mut h = with_policy(3 * N);
    let id = submitted(&mut h);
    sync(&mut h, id, proposal("InProgress", T0));
    let e = h.c.escalations.get(&id).cloned().unwrap();
    assert_eq!(e.status, EscalationStatus::Submitted);
    assert_eq!(e.submission_time, Some(U64(T0)));
}

#[test]
fn sync_escalation_lazy_expiry_keeps_bond_until_finalized() {
    let mut h = with_policy(3 * N);
    let id = submitted(&mut h);
    h.now = T0 + PERIOD + 1;
    sync(&mut h, id, proposal("InProgress", T0));
    let e = h.c.escalations.get(&id).cloned().unwrap();
    assert_eq!(e.status, EscalationStatus::Expired);
    assert!(!e.bond_settled);
    assert_eq!(h.c.open_escalations, 0);
    assert_eq!(h.c.ledger.bonds_outstanding, BOND);
    // after a council Finalize the bond comes back
    h.balance += BOND;
    sync(&mut h, id, proposal("Expired", T0));
    assert_eq!(h.c.ledger.float_free, 3 * N);
    assert!(h.c.escalations.get(&id).unwrap().bond_settled);
}

#[test]
fn sync_escalation_removed_proposal_loses_bond() {
    let mut h = with_policy(3 * N);
    let id = submitted(&mut h);
    sync(&mut h, id, PromiseResult::Failed);
    let e = h.c.escalations.get(&id).cloned().unwrap();
    assert_eq!(e.status, EscalationStatus::Rejected);
    assert!(e.bond_lost);
    assert_eq!(e.dao_status.as_deref(), Some("Removed"));
    assert_eq!(h.c.ledger.bonds_outstanding, 0);
    assert_eq!(h.c.ledger.total_bonds_lost, BOND);
    assert_eq!(h.c.ledger.float_free, 2 * N);
    assert!(h.invariant_ok());
}

#[test]
fn sync_escalation_failed_settles_bond_as_spent() {
    let mut h = with_policy(3 * N);
    let id = submitted(&mut h);
    sync(&mut h, id, proposal("Failed", T0));
    let e = h.c.escalations.get(&id).cloned().unwrap();
    assert_eq!(e.status, EscalationStatus::Failed);
    assert!(e.bond_settled);
    assert_eq!(h.c.ledger.bonds_outstanding, 0);
    assert_eq!(h.c.ledger.total_bonds_lost, BOND);
    assert_eq!(h.c.ledger.float_free, 2 * N);
    // a later bond refund is plain untracked balance, reconciled into the float (D-204)
    h.balance += BOND;
    h.call(&bob(), 0, |c| c.sweep());
    assert_eq!(h.c.ledger.float_free, 3 * N);
    assert!(h.invariant_ok());
}

#[test]
fn sync_escalation_moved_settles_bond_as_spent() {
    let mut h = with_policy(3 * N);
    let id = submitted(&mut h);
    sync(&mut h, id, proposal("Moved", T0));
    assert!(h.c.escalations.get(&id).unwrap().bond_settled);
    assert_eq!(h.c.ledger.bonds_outstanding, 0);
}

#[test]
fn reconcile_does_not_absorb_returned_bond_twice() {
    let mut h = with_policy(3 * N);
    let id = submitted(&mut h);
    h.balance += BOND; // bond refund lands before anyone syncs
    h.call(&bob(), 0, |c| c.sweep());
    assert_eq!(h.c.ledger.float_free, 2 * N);
    sync(&mut h, id, proposal("Rejected", T0));
    assert_eq!(h.c.ledger.float_free, 3 * N);
    assert!(h.invariant_ok());
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn sync_escalation_rejects_without_proposal_id() {
    let mut h = with_policy(3 * N);
    let id = escalate(&mut h);
    h.call(&bob(), 0, |c| c.sync_escalation(U64(id)));
}

#[test]
fn map_dao_status_covers_all_sputnik_statuses() {
    use EscalationStatus::*;
    let cases = [
        ("InProgress", Submitted),
        ("Approved", Approved),
        ("Rejected", Rejected),
        ("Removed", Rejected),
        ("Expired", Expired),
        ("Failed", Failed),
        ("Moved", Failed),
    ];
    for (s, e) in cases {
        assert_eq!(map_dao_status(s), Some(e));
    }
    assert_eq!(map_dao_status("Other"), None);
}
