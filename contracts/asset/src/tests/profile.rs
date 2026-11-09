use super::*;
use crate::profile::validate_profile;

fn check(f: impl FnOnce(&mut Profile)) {
    testing_env!(VMContextBuilder::new().build());
    let mut p = profile();
    f(&mut p);
    validate_profile(&p);
}

#[test]
fn validate_profile_accepts_default() {
    check(|_| {});
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_duplicate_rule_ids() {
    check(|p| p.rules[1].rule_id = p.rules[0].rule_id.clone());
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_cash_above_cap() {
    check(|p| p.rules[0].reward_cash = U128(2 * N));
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_trusted_deposit_above_deposit() {
    check(|p| p.deposit_trusted = U128(3 * N));
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_fee_above_max() {
    check(|p| {
        p.protocol_fee_bps = 201;
        p.protocol_fee_receiver = Some(feesink());
    });
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_fee_without_receiver() {
    check(|p| p.protocol_fee_bps = 10);
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_zero_slot_minutes() {
    check(|p| p.slot_minutes = 0);
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_zero_float_cap() {
    check(|p| p.float_cap = U128(0));
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_long_rule_id() {
    check(|p| p.rules[0].rule_id = "x".repeat(65));
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_long_title() {
    check(|p| p.rules[0].title = "x".repeat(201));
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_empty_display_name() {
    check(|p| p.display_name = String::new());
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_reward_rights_above_mint_limit() {
    check(|p| p.rules[0].reward_rights = 11);
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn new_rejects_invalid_profile() {
    let mut p = profile();
    p.slot_minutes = 0;
    H::with_profile(p);
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_reimbursable_on_cleaning() {
    check(|p| p.rules[3].reimbursable_max = U128(1));
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_zero_metric_threshold() {
    check(|p| p.rules[0].trigger = metric("nozzle_seconds", 0));
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_long_metric_name() {
    check(|p| p.rules[0].trigger = metric(&"m".repeat(33), 1));
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_zero_schedule() {
    check(|p| p.rules[3].trigger = Trigger::Schedule { every_hours: 0 });
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_zero_min_reports() {
    check(|p| p.rules[4].trigger = Trigger::Report { min_reports: 0 });
}

#[test]
fn profile_json_uses_serde_default_shapes() {
    let v = serde_json::to_value(profile()).unwrap();
    assert_eq!(v["rules"][2]["kind"], "Restock");
    assert_eq!(
        v["rules"][0]["trigger"]["Metric"]["metric"],
        "nozzle_seconds"
    );
    assert_eq!(v["rules"][0]["trigger"]["Metric"]["threshold"], 1800);
    assert_eq!(v["rules"][3]["trigger"]["Schedule"]["every_hours"], 168);
    assert_eq!(v["rules"][4]["trigger"]["Report"]["min_reports"], 2);
    assert_eq!(v["rules"][2]["reimbursable_max"], (3 * N).to_string());
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_free_deposit_free_reservations() {
    check(|p| {
        p.price_per_slot = U128(0);
        p.deposit_trusted = U128(0);
    });
}

#[test]
fn validate_profile_accepts_free_slots_with_deposit() {
    check(|p| p.price_per_slot = U128(0));
}

#[test]
#[should_panic(expected = "E_INVALID_PROFILE")]
fn validate_profile_rejects_right_validity_above_cap() {
    check(|p| p.right_validity_days = 3651);
}
