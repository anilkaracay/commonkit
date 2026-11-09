use super::*;

const FEE2: u128 = N / 2; // 2 slots at 0.25 N
const DEP: u128 = 2 * N;

// ---- reserve ----

#[test]
fn reserve_holds_slots_and_asks_commons() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 2;
    let id = h.reserve(&alice(), start, 2);
    let r = h.res(id);
    assert_eq!(r.status, ReservationStatus::PendingAuthorization);
    assert_eq!((r.fee_paid.0, r.deposit_paid.0), (FEE2, DEP));
    assert_eq!(h.c.slot_index.get(&start), Some(&id));
    assert_eq!(h.c.slot_index.get(&(start + 1)), Some(&id));
    assert_eq!(h.c.ledger.pending_in, FEE2 + DEP);
    let cs = calls();
    let auth = cs
        .iter()
        .find(|c| c.method == "authorize_reservation")
        .unwrap();
    assert_eq!(auth.receiver, commons());
    assert_eq!(auth.args["holder"], "alice.testnet");
    assert_eq!(auth.args["asset"], asset().as_str());
    assert_eq!(auth.args["reservation_id"], id.to_string());
    assert_eq!(auth.args["slots"], 2);
    assert!(auth.args["credential"].is_null());
    assert!(cs.iter().any(|c| c.method == "on_authorized"));
    assert_eq!(events("reservation_pending").len(), 1);
    assert!(h.invariant_ok());
}

#[test]
fn reserve_passes_required_credential() {
    let mut p = profile();
    p.required_credential = Some("laser_safety".to_string());
    let mut h = H::with_profile(p);
    let start = h.now_slot();
    h.reserve(&alice(), start, 1);
    let auth = calls()
        .into_iter()
        .find(|c| c.method == "authorize_reservation")
        .unwrap();
    assert_eq!(auth.args["credential"], "laser_safety");
}

#[test]
fn reserve_with_right_charges_deposit_only() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 1;
    let id = h.call(&alice(), DEP, |c| {
        c.reserve(U64(start), 2, Some("right-7".to_string()))
    });
    let r = h.res(id.0);
    assert_eq!((r.fee_paid.0, r.deposit_paid.0), (0, DEP));
    let auth = calls()
        .into_iter()
        .find(|c| c.method == "authorize_reservation")
        .unwrap();
    assert_eq!(auth.args["right_id"], "right-7");
}

#[test]
fn reserve_uses_trusted_deposit_after_clean_returns() {
    let mut h = H::wired(0);
    for i in 0..3 {
        let start = h.now_slot() + 1;
        let id = h.confirmed(&alice(), start, 1);
        h.now = start * SLOT;
        h.call(&bridge(), 0, |c| c.mark_session_started(U64(id)));
        h.call(&bridge(), 0, |c| c.mark_session_finished(U64(id), vec![]));
        h.call(&steward(), 0, |c| {
            c.confirm_return(U64(id), ReturnResult::Clean)
        });
        h.settle_all();
        assert_eq!(h.c.reputation.get(&alice()).unwrap().clean_returns, i + 1);
    }
    assert_eq!(h.c.deposit_for(&alice()), N / 2);
    let start = h.now_slot() + 1;
    let id = h.reserve(&alice(), start, 1);
    assert_eq!(h.res(id).deposit_paid, U128(N / 2));
}

#[test]
#[should_panic(expected = "E_WRONG_AMOUNT")]
fn reserve_rejects_wrong_amount() {
    let mut h = H::wired(0);
    let start = h.now_slot();
    h.call(&alice(), FEE2 + DEP - 1, |c| c.reserve(U64(start), 2, None));
}

#[test]
#[should_panic(expected = "E_WRONG_AMOUNT")]
fn reserve_rejects_fee_with_right() {
    let mut h = H::wired(0);
    let start = h.now_slot();
    h.call(&alice(), FEE2 + DEP, |c| {
        c.reserve(U64(start), 2, Some("right-1".to_string()))
    });
}

#[test]
#[should_panic(expected = "E_TOO_MANY_SLOTS")]
fn reserve_rejects_too_many_slots() {
    let mut h = H::wired(0);
    let start = h.now_slot();
    h.call(&alice(), 5 * N / 4 + DEP, |c| {
        c.reserve(U64(start), 5, None)
    });
}

#[test]
#[should_panic(expected = "E_TOO_MANY_SLOTS")]
fn reserve_rejects_zero_slots() {
    let mut h = H::wired(0);
    let start = h.now_slot();
    h.call(&alice(), DEP, |c| c.reserve(U64(start), 0, None));
}

#[test]
#[should_panic(expected = "E_SLOT_OUT_OF_RANGE")]
fn reserve_rejects_past_slot() {
    let mut h = H::wired(0);
    let start = h.now_slot() - 1;
    h.call(&alice(), N / 4 + DEP, |c| c.reserve(U64(start), 1, None));
}

#[test]
#[should_panic(expected = "E_SLOT_OUT_OF_RANGE")]
fn reserve_rejects_beyond_horizon() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 7 * 48 + 1;
    h.call(&alice(), N / 4 + DEP, |c| c.reserve(U64(start), 1, None));
}

#[test]
fn reserve_accepts_last_horizon_slot() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 7 * 48;
    h.reserve(&alice(), start, 1);
}

#[test]
#[should_panic(expected = "E_SLOT_TAKEN")]
fn reserve_rejects_overlapping_slots() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 2;
    h.reserve(&alice(), start, 2);
    h.reserve(&bob(), start + 1, 2);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn reserve_rejects_empty_right_id() {
    let mut h = H::wired(0);
    let start = h.now_slot();
    h.call(&alice(), DEP, |c| {
        c.reserve(U64(start), 1, Some(String::new()))
    });
}

// ---- on_authorized ----

#[test]
fn on_authorized_ok_confirms_and_books_money() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 2;
    let id = h.reserve(&alice(), start, 2);
    assert!(h.authorize(id, true, None));
    let r = h.res(id);
    assert_eq!(r.status, ReservationStatus::Confirmed);
    assert_eq!(h.c.ledger.float_free, FEE2);
    assert_eq!(h.c.ledger.deposits_held, DEP);
    assert_eq!(h.c.ledger.pending_in, 0);
    assert_eq!(h.c.ledger.total_fees_in, FEE2);
    assert_eq!(events("reservation_confirmed").len(), 1);
    assert!(h.invariant_ok());
}

#[test]
fn on_authorized_ok_sweeps_fee_above_cap() {
    let mut h = H::wired(3 * N);
    h.settle_all();
    let start = h.now_slot() + 2;
    let id = h.reserve(&alice(), start, 2);
    h.authorize(id, true, None);
    assert_eq!(h.c.ledger.float_free, 3 * N);
    assert_eq!(h.c.ledger.deposits_held, DEP);
    let sweep = h.last_op();
    assert_eq!((sweep.kind, sweep.amount.0), (OpKind::Sweep, FEE2));
    assert_eq!(transfers(), vec![(dao(), FEE2)]);
    h.settle_all();
    assert_eq!(h.c.ledger.total_swept, FEE2);
    assert!(h.invariant_ok());
}

#[test]
fn on_authorized_pays_protocol_fee() {
    let mut p = profile();
    p.protocol_fee_bps = 200;
    p.protocol_fee_receiver = Some(feesink());
    let mut h = H::with_profile(p);
    let start = h.now_slot() + 2;
    let id = h.reserve(&alice(), start, 2);
    h.authorize(id, true, None);
    let pf = FEE2 * 200 / 10_000;
    assert_eq!(h.c.ledger.float_free, FEE2 - pf);
    assert_eq!(h.res(id).protocol_fee, U128(pf));
    let op = h.last_op();
    assert_eq!(
        (op.kind, op.to.clone(), op.amount.0),
        (OpKind::ProtocolFee, feesink(), pf)
    );
    h.settle(op.id.0, false);
    assert_eq!(h.c.ledger.protocol_fees_owed, pf);
    assert!(h.invariant_ok());
    h.call(&bob(), 0, |c| c.retry_op(op.id));
    h.settle(op.id.0, true);
    assert_eq!(h.c.ledger.protocol_fees_owed, 0);
    assert_eq!(h.c.ledger.total_protocol_fees, pf);
    assert!(h.invariant_ok());
}

#[test]
fn on_authorized_rejection_releases_slots_and_refunds() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 2;
    let id = h.reserve(&alice(), start, 2);
    assert!(!h.authorize(id, false, Some("E_CREDENTIAL_MISSING")));
    let r = h.res(id);
    assert_eq!(r.status, ReservationStatus::Rejected);
    assert!(h.c.slot_index.get(&start).is_none());
    assert!(h.c.slot_index.get(&(start + 1)).is_none());
    let e = &events("reservation_rejected")[0];
    assert_eq!(e["reason"], "E_CREDENTIAL_MISSING");
    let op = h.last_op();
    assert_eq!(
        (op.kind, op.to.clone(), op.amount.0),
        (OpKind::Refund, alice(), FEE2 + DEP)
    );
    assert_eq!(transfers(), vec![(alice(), FEE2 + DEP)]);
    assert_eq!(h.c.ledger.pending_in, 0);
    assert_eq!(h.c.ledger.float_free, 0);
    h.settle_all();
    assert_eq!(h.c.ledger.total_refunded, FEE2 + DEP);
    assert!(h.invariant_ok());
    // the slots can be booked again
    h.reserve(&bob(), start, 2);
}

#[test]
fn on_authorized_failed_call_rejects_and_refunds() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 2;
    let id = h.reserve(&alice(), start, 1);
    h.callback(PromiseResult::Failed, |c| c.on_authorized(U64(id)));
    assert_eq!(h.res(id).status, ReservationStatus::Rejected);
    assert!(events("reservation_rejected")[0]["reason"]
        .as_str()
        .unwrap()
        .contains("call failed"));
    assert_eq!(h.last_op().amount.0, N / 4 + DEP);
    assert!(h.c.slot_index.get(&start).is_none());
}

#[test]
fn on_authorized_unreadable_result_releases_right() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 2;
    let id = h
        .call(&alice(), DEP, |c| {
            c.reserve(U64(start), 1, Some("right-3".to_string()))
        })
        .0;
    h.callback(PromiseResult::Successful(b"garbage".to_vec()), |c| {
        c.on_authorized(U64(id))
    });
    assert_eq!(h.res(id).status, ReservationStatus::Rejected);
    let release = calls()
        .into_iter()
        .find(|c| c.method == "release_right")
        .unwrap();
    assert_eq!(release.args["token_id"], "right-3");
    assert_eq!(release.args["reservation_id"], id.to_string());
    let r = h.res(id);
    assert_eq!(h.op(r.right_op_id.unwrap().0).kind, OpKind::RightRelease);
}

#[test]
fn on_authorized_ignores_repeat() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 2;
    let id = h.reserve(&alice(), start, 1);
    h.authorize(id, true, None);
    assert!(!h.authorize(id, true, None));
    assert_eq!(h.c.ledger.deposits_held, DEP);
}

// ---- cancel_reservation ----

#[test]
fn cancel_reservation_early_refunds_fee_and_deposit() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 4;
    let id = h.confirmed(&alice(), start, 2);
    h.call(&alice(), 0, |c| c.cancel_reservation(U64(id)));
    assert_eq!(h.res(id).status, ReservationStatus::Cancelled);
    assert!(h.c.slot_index.get(&start).is_none());
    assert_eq!(h.last_op().amount.0, FEE2 + DEP);
    assert_eq!((h.c.ledger.float_free, h.c.ledger.deposits_held), (0, 0));
    h.settle_all();
    assert!(h.invariant_ok());
}

#[test]
fn cancel_reservation_late_keeps_fee() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 1;
    let id = h.confirmed(&alice(), start, 2);
    h.now = start * SLOT - MIN; // less than one slot before start
    h.call(&alice(), 0, |c| c.cancel_reservation(U64(id)));
    assert_eq!(h.last_op().amount.0, DEP);
    assert_eq!(h.c.ledger.float_free, FEE2);
}

#[test]
fn cancel_reservation_with_right_releases_it() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 4;
    let id = h
        .call(&alice(), DEP, |c| {
            c.reserve(U64(start), 1, Some("right-9".to_string()))
        })
        .0;
    h.authorize(id, true, None);
    h.call(&alice(), 0, |c| c.cancel_reservation(U64(id)));
    let release = calls()
        .into_iter()
        .find(|c| c.method == "release_right")
        .unwrap();
    assert_eq!(release.receiver, commons());
    assert_eq!(release.args["token_id"], "right-9");
    // a failed release stays retryable and never touches money
    let op_id = h.res(id).right_op_id.unwrap().0;
    h.settle(op_id, false);
    assert_eq!(h.op(op_id).status, OpStatus::Failed);
    h.call(&bob(), 0, |c| c.retry_op(U64(op_id)));
    h.settle(op_id, true);
    assert_eq!(h.op(op_id).status, OpStatus::Succeeded);
    assert_eq!(h.op(op_id).attempts, 2);
}

#[test]
#[should_panic(expected = "E_UNAUTHORIZED")]
fn cancel_reservation_rejects_non_holder() {
    let mut h = H::wired(0);
    let id = h.confirmed(&alice(), h.now_slot() + 4, 1);
    h.call(&bob(), 0, |c| c.cancel_reservation(U64(id)));
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn cancel_reservation_rejects_pending() {
    let mut h = H::wired(0);
    let id = h.reserve(&alice(), h.now_slot() + 4, 1);
    h.call(&alice(), 0, |c| c.cancel_reservation(U64(id)));
}

#[test]
#[should_panic(expected = "E_WINDOW_CLOSED")]
fn cancel_reservation_rejects_after_start() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 1;
    let id = h.confirmed(&alice(), start, 1);
    h.now = start * SLOT;
    h.call(&alice(), 0, |c| c.cancel_reservation(U64(id)));
}

#[test]
#[should_panic(expected = "E_INSUFFICIENT_FLOAT")]
fn cancel_reservation_rejects_when_float_spent() {
    let mut h = H::wired(0);
    let id = h.confirmed(&alice(), h.now_slot() + 4, 2);
    h.c.ledger.float_free = 0; // e.g. reserved for a task reward meanwhile
    h.call(&alice(), 0, |c| c.cancel_reservation(U64(id)));
}

// ---- sessions ----

fn started(h: &mut H) -> u64 {
    let start = h.now_slot() + 1;
    let id = h.confirmed(&alice(), start, 2);
    h.now = start * SLOT + 5 * MIN;
    h.call(&bridge(), 0, |c| c.mark_session_started(U64(id)));
    id
}

#[test]
fn mark_session_started_in_window() {
    let mut h = H::wired(0);
    let id = started(&mut h);
    assert_eq!(h.res(id).status, ReservationStatus::InSession);
    assert_eq!(events("session_started").len(), 1);
}

#[test]
#[should_panic(expected = "E_NOT_BRIDGE")]
fn mark_session_started_rejects_non_bridge() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 1;
    let id = h.confirmed(&alice(), start, 1);
    h.now = start * SLOT;
    h.call(&alice(), 0, |c| c.mark_session_started(U64(id)));
}

#[test]
#[should_panic(expected = "E_WINDOW_CLOSED")]
fn mark_session_started_rejects_too_early() {
    let mut h = H::wired(0);
    let id = h.confirmed(&alice(), h.now_slot() + 1, 1);
    h.call(&bridge(), 0, |c| c.mark_session_started(U64(id)));
}

#[test]
#[should_panic(expected = "E_WINDOW_CLOSED")]
fn mark_session_started_rejects_after_window() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 1;
    let id = h.confirmed(&alice(), start, 1);
    h.now = start * SLOT + 16 * MIN;
    h.call(&bridge(), 0, |c| c.mark_session_started(U64(id)));
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn mark_session_started_rejects_pending() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 1;
    let id = h.reserve(&alice(), start, 1);
    h.now = start * SLOT;
    h.call(&bridge(), 0, |c| c.mark_session_started(U64(id)));
}

#[test]
fn mark_session_finished_records_delta_and_reputation() {
    let mut h = H::wired(0);
    h.telemetry(&[("nozzle_seconds", 100)]);
    let id = started(&mut h);
    h.call(&bridge(), 0, |c| {
        c.mark_session_finished(U64(id), vec![("nozzle_seconds".to_string(), 700)])
    });
    let r = h.res(id);
    assert_eq!(r.status, ReservationStatus::Finished);
    assert_eq!(
        r.metrics_delta,
        Some(vec![("nozzle_seconds".to_string(), 600)])
    );
    assert_eq!(h.c.telemetry.value("nozzle_seconds"), 700);
    assert_eq!(h.c.reputation.get(&alice()).unwrap().sessions, 1);
    assert_eq!(events("reputation_recorded")[0]["kind"], "session");
    assert_eq!(h.c.reputation_log.len(), 1);
}

#[test]
fn mark_session_finished_consumes_right() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 1;
    let id = h
        .call(&alice(), DEP, |c| {
            c.reserve(U64(start), 1, Some("right-4".to_string()))
        })
        .0;
    h.authorize(id, true, None);
    h.now = start * SLOT;
    h.call(&bridge(), 0, |c| c.mark_session_started(U64(id)));
    h.call(&bridge(), 0, |c| c.mark_session_finished(U64(id), vec![]));
    let fin = calls()
        .into_iter()
        .find(|c| c.method == "finalize_right")
        .unwrap();
    assert_eq!(fin.args["token_id"], "right-4");
    assert_eq!(
        h.op(h.res(id).right_op_id.unwrap().0).kind,
        OpKind::RightFinalize
    );
}

#[test]
#[should_panic(expected = "E_TELEMETRY_NOT_MONOTONIC")]
fn mark_session_finished_rejects_decreasing_counter() {
    let mut h = H::wired(0);
    h.telemetry(&[("nozzle_seconds", 100)]);
    let id = started(&mut h);
    h.call(&bridge(), 0, |c| {
        c.mark_session_finished(U64(id), vec![("nozzle_seconds".to_string(), 50)])
    });
}

#[test]
#[should_panic(expected = "E_NOT_BRIDGE")]
fn mark_session_finished_rejects_non_bridge() {
    let mut h = H::wired(0);
    let id = started(&mut h);
    h.call(&alice(), 0, |c| c.mark_session_finished(U64(id), vec![]));
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn mark_session_finished_rejects_not_in_session() {
    let mut h = H::wired(0);
    let id = h.confirmed(&alice(), h.now_slot() + 1, 1);
    h.call(&bridge(), 0, |c| c.mark_session_finished(U64(id), vec![]));
}

// ---- no-show ----

#[test]
fn mark_no_show_keeps_fee_refunds_deposit_releases_slots() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 1;
    let id = h.confirmed(&alice(), start, 2);
    h.now = start * SLOT + 16 * MIN;
    h.call(&bob(), 0, |c| c.mark_no_show(U64(id)));
    assert_eq!(h.res(id).status, ReservationStatus::NoShow);
    assert_eq!(h.last_op().amount.0, DEP);
    assert_eq!(h.c.ledger.float_free, FEE2);
    assert_eq!(h.c.ledger.deposits_held, 0);
    assert!(h.c.slot_index.get(&(start + 1)).is_none());
    assert_eq!(events("reputation_recorded")[0]["kind"], "no_show");
}

#[test]
fn mark_no_show_releases_right() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 1;
    let id = h
        .call(&alice(), DEP, |c| {
            c.reserve(U64(start), 1, Some("right-2".to_string()))
        })
        .0;
    h.authorize(id, true, None);
    h.now = start * SLOT + 16 * MIN;
    h.call(&bob(), 0, |c| c.mark_no_show(U64(id)));
    assert!(calls().iter().any(|c| c.method == "release_right"));
}

#[test]
#[should_panic(expected = "E_WINDOW_CLOSED")]
fn mark_no_show_rejects_open_window() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 1;
    let id = h.confirmed(&alice(), start, 1);
    h.now = start * SLOT + 15 * MIN;
    h.call(&bob(), 0, |c| c.mark_no_show(U64(id)));
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn mark_no_show_rejects_in_session() {
    let mut h = H::wired(0);
    let id = started(&mut h);
    h.now += HOUR;
    h.call(&bob(), 0, |c| c.mark_no_show(U64(id)));
}

// ---- returns and disputes ----

fn finished(h: &mut H) -> u64 {
    let id = started(h);
    h.call(&bridge(), 0, |c| c.mark_session_finished(U64(id), vec![]));
    id
}

fn damage() -> ReturnResult {
    ReturnResult::Damage {
        note_hash: HASH.to_string(),
    }
}

#[test]
fn confirm_return_clean_refunds_deposit() {
    let mut h = H::wired(0);
    let id = finished(&mut h);
    h.call(&steward(), 0, |c| {
        c.confirm_return(U64(id), ReturnResult::Clean)
    });
    assert_eq!(h.res(id).status, ReservationStatus::Closed);
    assert_eq!(transfers(), vec![(alice(), DEP)]);
    assert_eq!(h.c.reputation.get(&alice()).unwrap().clean_returns, 1);
    h.settle_all();
    assert_eq!(h.c.ledger.deposits_held, 0);
    assert!(h.invariant_ok());
}

#[test]
fn confirm_return_damage_opens_dispute() {
    let mut h = H::wired(0);
    let id = finished(&mut h);
    h.call(&steward(), 0, |c| c.confirm_return(U64(id), damage()));
    assert_eq!(h.res(id).status, ReservationStatus::Disputed);
    assert_eq!(events("dispute_opened").len(), 1);
    assert_eq!(h.c.ledger.deposits_held, DEP);
    assert!(transfers().is_empty());
}

#[test]
#[should_panic(expected = "E_SELF_VERIFY")]
fn confirm_return_rejects_holder() {
    let mut h = H::wired(0);
    let id = finished(&mut h);
    h.roles(&[(alice(), &["steward"])]);
    h.call(&alice(), 0, |c| {
        c.confirm_return(U64(id), ReturnResult::Clean)
    });
}

#[test]
#[should_panic(expected = "E_MISSING_ROLE")]
fn confirm_return_rejects_non_steward() {
    let mut h = H::wired(0);
    let id = finished(&mut h);
    h.call(&bob(), 0, |c| {
        c.confirm_return(U64(id), ReturnResult::Clean)
    });
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn confirm_return_rejects_not_finished() {
    let mut h = H::wired(0);
    let id = started(&mut h);
    h.call(&steward(), 0, |c| {
        c.confirm_return(U64(id), ReturnResult::Clean)
    });
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn confirm_return_rejects_bad_note_hash() {
    let mut h = H::wired(0);
    let id = finished(&mut h);
    let bad = ReturnResult::Damage {
        note_hash: "nope".to_string(),
    };
    h.call(&steward(), 0, |c| c.confirm_return(U64(id), bad));
}

#[test]
fn resolve_dispute_splits_deposit() {
    let mut h = H::wired(0);
    let id = finished(&mut h);
    h.call(&steward(), 0, |c| c.confirm_return(U64(id), damage()));
    h.call(&dao(), 0, |c| {
        c.resolve_dispute(U64(id), U128(N / 2), HASH.to_string())
    });
    assert_eq!(h.res(id).status, ReservationStatus::Closed);
    assert_eq!(transfers(), vec![(alice(), DEP - N / 2)]);
    assert_eq!(h.c.ledger.float_free, FEE2 + N / 2);
    assert_eq!(h.c.reputation.get(&alice()).unwrap().damages, 1);
    h.settle_all();
    assert!(h.invariant_ok());
}

#[test]
fn resolve_dispute_zero_deduction_records_no_damage() {
    let mut h = H::wired(0);
    let id = finished(&mut h);
    h.call(&steward(), 0, |c| c.confirm_return(U64(id), damage()));
    h.call(&dao(), 0, |c| {
        c.resolve_dispute(U64(id), U128(0), HASH.to_string())
    });
    assert_eq!(transfers(), vec![(alice(), DEP)]);
    assert_eq!(h.c.reputation.get(&alice()).unwrap().damages, 0);
}

#[test]
#[should_panic(expected = "E_WRONG_AMOUNT")]
fn resolve_dispute_rejects_deduction_above_deposit() {
    let mut h = H::wired(0);
    let id = finished(&mut h);
    h.call(&steward(), 0, |c| c.confirm_return(U64(id), damage()));
    h.call(&dao(), 0, |c| {
        c.resolve_dispute(U64(id), U128(DEP + 1), HASH.to_string())
    });
}

#[test]
#[should_panic(expected = "E_NOT_DAO")]
fn resolve_dispute_rejects_non_dao() {
    let mut h = H::wired(0);
    let id = finished(&mut h);
    h.call(&steward(), 0, |c| c.confirm_return(U64(id), damage()));
    h.call(&council(), 0, |c| {
        c.resolve_dispute(U64(id), U128(0), HASH.to_string())
    });
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn resolve_dispute_rejects_not_disputed() {
    let mut h = H::wired(0);
    let id = finished(&mut h);
    h.call(&dao(), 0, |c| {
        c.resolve_dispute(U64(id), U128(0), HASH.to_string())
    });
}
