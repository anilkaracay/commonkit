use super::*;

fn with_session(who: &AccountId) -> H {
    let mut h = H::wired(0);
    h.session(who);
    h
}

#[test]
fn report_fault_after_recent_session() {
    let mut h = with_session(&alice());
    let seq = h.call(&alice(), 0, |c| c.report_fault(None, HASH.to_string()));
    assert_eq!(seq, U64(0));
    let e = &events("fault_reported")[0];
    assert_eq!(e["rule_id"], "fault_repair");
    assert_eq!(e["active_reports"], 1);
    assert_eq!(h.c.reputation.get(&alice()).unwrap().fault_reports, 1);
    let faults = h.view(|c| c.get_faults(None));
    assert_eq!(faults.len(), 1);
    assert_eq!(faults[0].reports[0].reporter, alice());
}

#[test]
#[should_panic(expected = "E_ALREADY_REPORTED")]
fn report_fault_rejects_second_report() {
    let mut h = with_session(&alice());
    h.call(&alice(), 0, |c| c.report_fault(None, HASH.to_string()));
    h.call(&alice(), 0, |c| c.report_fault(None, HASH.to_string()));
}

#[test]
#[should_panic(expected = "E_RULE_NOT_FOUND")]
fn report_fault_rejects_non_report_rule() {
    let mut h = with_session(&alice());
    h.call(&alice(), 0, |c| {
        c.report_fault(Some("nozzle_clean".to_string()), HASH.to_string())
    });
}

#[test]
#[should_panic(expected = "E_RULE_NOT_FOUND")]
fn report_fault_rejects_profile_without_report_rule() {
    let mut h = with_session(&alice());
    h.c.profile.rules.truncate(4);
    h.call(&alice(), 0, |c| c.report_fault(None, HASH.to_string()));
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn report_fault_rejects_bad_hash() {
    let mut h = with_session(&alice());
    h.call(&alice(), 0, |c| c.report_fault(None, "x".to_string()));
}

#[test]
#[should_panic(expected = "E_UNAUTHORIZED")]
fn report_fault_rejects_agent() {
    let mut h = with_session(&alice());
    h.call(&agent(), 0, |c| c.report_fault(None, HASH.to_string()));
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn report_fault_caps_active_reports() {
    let mut h = H::wired(0);
    for i in 0..33 {
        let who = acc(&format!("user{i}.testnet"));
        h.c.last_session_at.insert(who.clone(), h.now);
        h.call(&who, 0, |c| c.report_fault(None, HASH.to_string()));
    }
}

#[test]
fn set_out_of_service_by_steward_and_back_by_council() {
    let mut h = H::wired(0);
    h.call(&steward(), 0, |c| {
        c.set_out_of_service(true, HASH.to_string())
    });
    assert!(!h.c.service.in_service);
    assert_eq!(events("out_of_service").len(), 1);
    h.call(&council(), 0, |c| {
        c.set_out_of_service(false, HASH.to_string())
    });
    assert!(h.c.service.in_service);
    let log = h.view(|c| c.get_service_log(None, None));
    assert_eq!(log.len(), 1);
    assert_eq!(
        log[0].ended_by,
        Some(ServiceRestoredBy::Council { account: council() })
    );
}

#[test]
fn set_out_of_service_by_dao() {
    let mut h = H::wired(0);
    h.call(&dao(), 0, |c| c.set_out_of_service(true, HASH.to_string()));
    h.call(&dao(), 0, |c| c.set_out_of_service(false, HASH.to_string()));
    assert!(h.view(|c| c.get_service_status()).in_service);
}

#[test]
#[should_panic(expected = "E_MISSING_ROLE")]
fn set_out_of_service_restore_rejects_steward() {
    let mut h = H::wired(0);
    h.call(&steward(), 0, |c| {
        c.set_out_of_service(true, HASH.to_string())
    });
    h.call(&steward(), 0, |c| {
        c.set_out_of_service(false, HASH.to_string())
    });
}

#[test]
#[should_panic(expected = "E_MISSING_ROLE")]
fn set_out_of_service_rejects_member() {
    let mut h = H::wired(0);
    h.call(&alice(), 0, |c| {
        c.set_out_of_service(true, HASH.to_string())
    });
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn set_out_of_service_rejects_twice() {
    let mut h = H::wired(0);
    h.call(&steward(), 0, |c| {
        c.set_out_of_service(true, HASH.to_string())
    });
    h.call(&council(), 0, |c| {
        c.set_out_of_service(true, HASH.to_string())
    });
}

#[test]
#[should_panic(expected = "E_OUT_OF_SERVICE")]
fn mark_session_started_rejects_out_of_service() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 1;
    let id = h.confirmed(&alice(), start, 1);
    h.call(&steward(), 0, |c| {
        c.set_out_of_service(true, HASH.to_string())
    });
    h.now = start * SLOT;
    h.call(&bridge(), 0, |c| c.mark_session_started(U64(id)));
}

#[test]
fn rule_status_reports_each_trigger() {
    let mut h = H::wired(0);
    h.telemetry(&[("nozzle_seconds", 900)]);
    h.now += 100 * HOUR;
    let rows = h.view(|c| c.get_rule_status());
    let nozzle = &rows[0];
    assert_eq!(
        (nozzle.current, nozzle.due_value, nozzle.due),
        (U64(900), U64(900), false)
    );
    let weekly = &rows[3];
    assert_eq!(weekly.current, U64(100));
    assert_eq!(weekly.next_due_estimate, Some(U64(T0 + 168 * HOUR)));
    assert!(!weekly.due);
    let repair = &rows[4];
    assert_eq!((repair.current, repair.due), (U64(0), false));
}

// ---- invariants added by D-017 (unit level; sandbox versions in M1c) ----

#[test]
fn inv_restock_expense_capped_and_not_from_deposits() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 4;
    h.confirmed(&bob(), start, 1); // 2 N deposit held, 0.25 N float
    h.telemetry(&[("filament_used_mm", 400_000)]);
    let t = h.submitted("filament_spool", N / 2);
    // float (0.25 N) < expense (0.5 N): needs council, and council cannot take deposits
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    assert!(h.task(t).needs_council);
    assert_eq!(h.c.ledger.deposits_held, 2 * N);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        h.call(&council(), 0, |c| c.council_approve_task(U64(t)))
    }));
    assert!(
        r.is_err(),
        "expense must not be paid while the float is short"
    );
    assert_eq!(h.c.ledger.deposits_held, 2 * N);
    assert_eq!(h.c.ledger.rewards_reserved, 0);
    // cap: a claim above reimbursable_max is refused outright
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut h2 = H::wired(0);
        h2.telemetry(&[("filament_used_mm", 400_000)]);
        h2.submitted("filament_spool", 3 * N + 1)
    }));
    assert!(r.is_err());
    assert!(h.invariant_ok());
}

#[test]
fn inv_out_of_service_blocks_access_and_refunds() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 1;
    let id = h.confirmed(&alice(), start, 2);
    // less than one slot before start: the normal policy would keep the fee
    h.now = start * SLOT - MIN;
    h.call(&steward(), 0, |c| {
        c.set_out_of_service(true, HASH.to_string())
    });
    // access denied
    h.now = start * SLOT;
    let access = h.view(|c| c.can_access(alice(), U64(id)));
    assert!(!access.ok);
    assert_eq!(access.reason, "out_of_service");
    // reserve refused
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let s = h.now_slot() + 4;
        h.reserve(&bob(), s, 1)
    }));
    assert!(r.is_err());
    // full refund even inside the window
    h.call(&alice(), 0, |c| c.cancel_reservation(U64(id)));
    assert_eq!(
        events("reservation_cancelled")[0]["reason"],
        "out_of_service"
    );
    assert_eq!(transfers(), vec![(alice(), N / 2 + 2 * N)]);
    h.settle_all();
    assert_eq!(h.c.ledger.float_free, 0);
    assert!(h.invariant_ok());
}

#[test]
fn inv_fault_report_requires_recent_session() {
    let mut h = H::wired(0);
    let never = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        h.call(&bob(), 0, |c| c.report_fault(None, HASH.to_string()))
    }));
    assert!(never.is_err());
    h.session(&bob());
    h.now += 14 * DAY + 1;
    let stale = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        h.call(&bob(), 0, |c| c.report_fault(None, HASH.to_string()))
    }));
    assert!(stale.is_err());
    assert!(h.c.faults.get("fault_repair").is_none());
    h.session(&bob());
    h.call(&bob(), 0, |c| c.report_fault(None, HASH.to_string()));
    assert_eq!(h.c.faults.get("fault_repair").unwrap().len(), 1);
}

#[test]
#[should_panic(expected = "E_NO_RECENT_SESSION")]
fn report_fault_rejects_without_session() {
    let mut h = H::wired(0);
    h.call(&bob(), 0, |c| c.report_fault(None, HASH.to_string()));
}

#[test]
fn inv_schedule_rule_due_only_after_interval() {
    let mut h = H::wired(0);
    h.now = T0 + 168 * HOUR - 1;
    let early = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| h.open("weekly_clean")));
    assert!(early.is_err());
    h.now = T0 + 168 * HOUR;
    let t = h.open("weekly_clean");
    assert_eq!(h.task(t).due_value_at_open, 168);
    h.claim(t, &alice());
    h.submit(t, &alice(), 0);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    h.minted(t, &["right-1"]);
    // the interval restarts at the reward
    h.now += 167 * HOUR;
    let again = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| h.open("weekly_clean")));
    assert!(again.is_err());
    h.now += HOUR;
    h.open("weekly_clean");
}
