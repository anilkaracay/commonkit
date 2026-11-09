use super::*;

#[test]
fn version_names_the_crate() {
    let mut h = H::new();
    assert!(h.view(|c| c.version()).starts_with("commonkit-asset "));
}

#[test]
fn get_wiring_reports_operators_and_versions() {
    let mut h = H::wired(0);
    let w = h.view(|c| c.get_wiring());
    assert_eq!(w.bridge_id, Some(bridge()));
    assert_eq!(w.agent_id, Some(agent()));
    assert_eq!(w.roles_version, U64(1));
    assert!(w.dao_proposal_bond.is_none());
}

#[test]
fn get_ledger_reports_balance_and_storage() {
    let mut h = H::wired(2 * N);
    let l = h.view(|c| c.get_ledger());
    assert_eq!(l.float_free, U128(2 * N));
    assert_eq!(l.float_cap, U128(3 * N));
    assert_eq!(l.storage_reserve, U128(STORAGE_RESERVE));
    assert_eq!(l.balance, U128(STORAGE_RESERVE + 2 * N));
    assert!(l.invariant_ok);
    assert_eq!(
        l.storage_cost.0,
        u128::from(l.storage_usage.0) * l.storage_byte_cost.0
    );
}

#[test]
fn get_ledger_flags_shortfall() {
    let mut h = H::wired(2 * N);
    h.balance -= N;
    assert!(!h.view(|c| c.get_ledger()).invariant_ok);
}

#[test]
fn get_reservations_paginates_by_id() {
    let mut h = H::wired(0);
    let base = h.now_slot() + 1;
    for i in 0..3 {
        h.reserve(&alice(), base + i, 1);
    }
    h.reserve(&bob(), base + 5, 1);
    let all = h.view(|c| c.get_reservations(None, None));
    assert_eq!(all.len(), 4);
    let page = h.view(|c| c.get_reservations(Some(U64(1)), Some(2)));
    assert_eq!(page.iter().map(|r| r.id.0).collect::<Vec<_>>(), vec![1, 2]);
    let bobs = h.view(|c| c.get_reservations_by_holder(bob(), None, None));
    assert_eq!(bobs.len(), 1);
    let alices = h.view(|c| c.get_reservations_by_holder(alice(), Some(U64(2)), Some(5)));
    assert_eq!(alices[0].id, U64(2));
    assert_eq!(h.view(|c| c.get_reservation(U64(9))), None);
}

#[test]
fn get_slot_owner_and_availability() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 2;
    let id = h.reserve(&alice(), start, 2);
    assert_eq!(h.view(|c| c.get_slot_owner(U64(start + 1))), Some(U64(id)));
    let slots = h.view(|c| c.get_availability(U64(start - 1), 4));
    let owners: Vec<_> = slots.iter().map(|s| s.reservation_id).collect();
    assert_eq!(owners, vec![None, Some(U64(id)), Some(U64(id)), None]);
    assert_eq!(h.view(|c| c.get_availability(U64(0), 10_000)).len(), 500);
}

#[test]
fn can_access_follows_window_and_holder() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 1;
    let id = h.confirmed(&alice(), start, 2);
    let early = h.view(|c| c.can_access(alice(), U64(id)));
    assert_eq!((early.ok, early.reason.as_str()), (false, "too_early"));
    h.now = start * SLOT + MIN;
    let ok = h.view(|c| c.can_access(alice(), U64(id)));
    assert!(ok.ok);
    assert_eq!(ok.window_start, U64(start * SLOT));
    assert_eq!(ok.window_end, U64(start * SLOT + 15 * MIN));
    assert_eq!(
        h.view(|c| c.can_access(bob(), U64(id))).reason,
        "not_holder"
    );
    h.call(&bridge(), 0, |c| c.mark_session_started(U64(id)));
    h.now = start * SLOT + 50 * MIN;
    let session = h.view(|c| c.can_access(alice(), U64(id)));
    assert_eq!(
        (session.ok, session.reason.as_str()),
        (true, "session_active")
    );
    h.now = (start + 2) * SLOT;
    assert_eq!(
        h.view(|c| c.can_access(alice(), U64(id))).reason,
        "reservation_ended"
    );
    assert_eq!(
        h.view(|c| c.can_access(alice(), U64(42))).reason,
        "unknown_reservation"
    );
}

#[test]
fn can_access_denies_closed_window_and_pending() {
    let mut h = H::wired(0);
    let start = h.now_slot() + 1;
    let pending = h.reserve(&bob(), start + 3, 1);
    assert_eq!(
        h.view(|c| c.can_access(bob(), U64(pending))).reason,
        "pending_authorization"
    );
    let id = h.confirmed(&alice(), start, 1);
    h.now = start * SLOT + 16 * MIN;
    assert_eq!(
        h.view(|c| c.can_access(alice(), U64(id))).reason,
        "start_window_closed"
    );
}

#[test]
fn get_tasks_filters_by_status() {
    let mut h = H::wired(0);
    h.telemetry(&[("nozzle_seconds", 2000), ("filament_used_mm", 400_000)]);
    let a = h.open("nozzle_clean");
    h.open("filament_spool");
    h.claim(a, &alice());
    let claimed = h.view(|c| c.get_tasks(None, None, Some(TaskStatus::Claimed)));
    assert_eq!(claimed.len(), 1);
    assert_eq!(h.view(|c| c.get_tasks(None, None, None)).len(), 2);
    assert_eq!(
        h.view(|c| c.get_task(U64(a))).unwrap().claimer,
        Some(alice())
    );
}

#[test]
fn get_ops_filters_by_status() {
    let mut h = H::new();
    h.call(&dao(), 5 * N, |c| c.fund_float());
    assert_eq!(
        h.view(|c| c.get_ops(None, None, Some(OpStatus::Pending)))
            .len(),
        1
    );
    h.settle_all();
    assert!(h
        .view(|c| c.get_ops(None, None, Some(OpStatus::Pending)))
        .is_empty());
    assert_eq!(
        h.view(|c| c.get_op(U64(0))).unwrap().status,
        OpStatus::Succeeded
    );
}

#[test]
fn get_reputation_and_log() {
    let mut h = H::wired(0);
    h.session(&alice());
    assert_eq!(h.view(|c| c.get_reputation(alice())).sessions, 1);
    assert_eq!(h.view(|c| c.get_reputation(bob())), Reputation::default());
    let log = h.view(|c| c.get_reputation_log(None, None));
    assert_eq!(log.len(), 1);
    assert_eq!(log[0].kind, "session");
    assert_eq!(h.view(|c| c.get_last_session_at(alice())), Some(U64(h.now)));
}

#[test]
fn get_escalations_lists_records() {
    let mut h = H::wired(3 * N);
    h.c.dao_proposal_bond = Some(N);
    h.call(&agent(), 0, |c| {
        c.escalate("other".to_string(), bob(), U128(N), "r".to_string(), None)
    });
    assert_eq!(h.view(|c| c.get_escalations(None, None)).len(), 1);
    assert!(h.view(|c| c.get_escalation(U64(0))).is_some());
}

#[test]
fn get_period_telemetry_and_profile() {
    let mut h = H::wired(0);
    h.telemetry(&[("nozzle_seconds", 5)]);
    assert_eq!(h.view(|c| c.get_period()).rights_minted, 0);
    assert_eq!(h.view(|c| c.get_telemetry()).value("nozzle_seconds"), 5);
    assert_eq!(h.view(|c| c.get_profile()).rules.len(), 5);
}
