use super::*;

#[test]
fn new_stores_wiring() {
    let mut h = H::new();
    let w = h.view(|c| c.get_wiring());
    assert_eq!(w.dao_id, dao());
    assert_eq!(w.commons_id, commons());
    assert_eq!(w.profile_version, 1);
    assert!(w.bridge_id.is_none() && w.agent_id.is_none());
    assert_eq!(h.view(|c| c.get_profile()), profile());
}

#[test]
fn set_profile_by_dao_bumps_version() {
    let mut h = H::new();
    let mut p = profile();
    p.price_per_slot = U128(N);
    h.call(&dao(), 0, |c| c.set_profile(p.clone()));
    assert_eq!(h.c.profile_version, 2);
    assert_eq!(h.c.profile.price_per_slot, U128(N));
    assert_eq!(events("profile_updated").len(), 1);
}

#[test]
fn set_profile_keeps_existing_reservation_amounts() {
    let mut h = H::wired(0);
    let id = h.confirmed(&alice(), h.now_slot() + 4, 2);
    let mut p = profile();
    p.price_per_slot = U128(N);
    p.deposit = U128(3 * N);
    h.call(&dao(), 0, |c| c.set_profile(p));
    assert_eq!(h.res(id).fee_paid, U128(N / 2));
    assert_eq!(h.res(id).deposit_paid, U128(2 * N));
}

#[test]
#[should_panic(expected = "E_NOT_DAO")]
fn set_profile_rejects_non_dao() {
    let mut h = H::new();
    h.call(&alice(), 0, |c| c.set_profile(profile()));
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn set_profile_rejects_invalid() {
    let mut h = H::new();
    let mut p = profile();
    p.float_cap = U128(0);
    h.call(&dao(), 0, |c| c.set_profile(p));
}

#[test]
fn set_operators_sets_and_clears() {
    let mut h = H::new();
    h.set_operators();
    assert_eq!(h.c.bridge_id, Some(bridge()));
    assert_eq!(h.c.agent_id, Some(agent()));
    assert_eq!(events("operators_updated").len(), 1);
    h.call(&dao(), 0, |c| c.set_operators(None, None));
    assert!(h.c.bridge_id.is_none() && h.c.agent_id.is_none());
}

#[test]
#[should_panic(expected = "E_NOT_DAO")]
fn set_operators_rejects_non_dao() {
    let mut h = H::new();
    h.call(&agent(), 0, |c| {
        c.set_operators(Some(bridge()), Some(agent()))
    });
}

#[test]
fn fund_float_credits_float_up_to_cap_and_sweeps_excess() {
    let mut h = H::new();
    h.call(&dao(), 5 * N, |c| c.fund_float());
    assert_eq!(h.c.ledger.float_free, 3 * N);
    let sweep = h.last_op();
    assert_eq!(sweep.kind, OpKind::Sweep);
    assert_eq!(sweep.to, dao());
    assert_eq!(sweep.amount, U128(2 * N));
    assert_eq!(h.c.ledger.pending_out, 2 * N);
    assert_eq!(events("float_funded")[0]["to_float"], (5 * N).to_string());
    assert_eq!(events("swept").len(), 1);
    assert!(h.invariant_ok());
}

#[test]
fn fund_float_tops_up_storage_reserve_first() {
    let mut h = H::new();
    h.balance = STORAGE_RESERVE - N; // account is 1 N short of its reserve
    h.call(&dao(), 2 * N, |c| c.fund_float());
    assert_eq!(h.c.ledger.float_free, N);
    let e = &events("float_funded")[0];
    assert_eq!(e["to_float"], N.to_string());
    assert_eq!(e["to_storage_reserve"], N.to_string());
    assert!(h.invariant_ok());
}

#[test]
#[should_panic(expected = "E_WRONG_AMOUNT")]
fn fund_float_rejects_zero_deposit() {
    let mut h = H::new();
    h.call(&dao(), 0, |c| c.fund_float());
}

#[test]
fn set_telemetry_epoch_allows_one_reset() {
    let mut h = H::wired(0);
    h.telemetry(&[("nozzle_seconds", 5000)]);
    h.call(&dao(), 0, |c| c.set_telemetry_epoch(U64(1)));
    assert!(h.c.telemetry.reset_pending);
    h.telemetry(&[("nozzle_seconds", 10)]);
    assert_eq!(h.c.telemetry.value("nozzle_seconds"), 10);
    assert!(!h.c.telemetry.reset_pending);
}

#[test]
#[should_panic(expected = "E_NOT_DAO")]
fn set_telemetry_epoch_rejects_non_dao() {
    let mut h = H::wired(0);
    h.call(&bridge(), 0, |c| c.set_telemetry_epoch(U64(1)));
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn set_telemetry_epoch_rejects_non_increasing() {
    let mut h = H::wired(0);
    h.call(&dao(), 0, |c| c.set_telemetry_epoch(U64(0)));
}

#[test]
fn sync_roles_applies_snapshot_and_tombstones() {
    let mut h = H::new();
    h.roles(&[(alice(), &["steward", "verifier"]), (bob(), &["council"])]);
    assert_eq!(events("roles_synced").len(), 1);
    assert_eq!(
        h.view(|c| c.get_roles(alice())),
        vec!["steward", "verifier"]
    );
    h.roles(&[(alice(), &[]), (bob(), &["council"])]);
    assert!(h.view(|c| c.get_roles(alice())).is_empty());
    assert_eq!(h.c.roles_version, 2);
}

#[test]
fn sync_roles_ignores_stale_version() {
    let mut h = H::new();
    h.roles(&[(alice(), &["steward"])]);
    let applied = h.call(&commons(), 0, |c| {
        c.sync_roles(vec![(alice(), vec![])], U64(1))
    });
    assert!(!applied);
    assert_eq!(h.view(|c| c.get_roles(alice())), vec!["steward"]);
}

#[test]
fn sync_roles_drops_unknown_role_names() {
    let mut h = H::new();
    h.roles(&[(alice(), &["admin", "steward"])]);
    assert_eq!(h.view(|c| c.get_roles(alice())), vec!["steward"]);
}

#[test]
#[should_panic(expected = "E_NOT_COMMONS")]
fn sync_roles_rejects_non_commons() {
    let mut h = H::new();
    h.call(&dao(), 0, |c| c.sync_roles(vec![(alice(), vec![])], U64(1)));
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn sync_roles_rejects_oversized_snapshot() {
    let mut h = H::new();
    let updates = (0..101)
        .map(|i| (acc(&format!("u{i}.testnet")), vec!["steward".to_string()]))
        .collect();
    h.call(&commons(), 0, |c| c.sync_roles(updates, U64(1)));
}
