use super::*;

fn due_printer(float: u128) -> H {
    let mut h = H::wired(float);
    h.settle_all();
    h.telemetry(&[
        ("nozzle_seconds", 2000),
        ("jobs_total", 60),
        ("filament_used_mm", 400_000),
    ]);
    h
}

// ---- open_upkeep_task ----

#[test]
fn open_upkeep_task_metric_due() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    let task = h.task(t);
    assert_eq!(task.status, TaskStatus::Open);
    assert_eq!(task.kind, UpkeepKind::Maintenance);
    assert_eq!(task.due_value_at_open, 2000);
    assert_eq!(task.opened_by, agent());
    assert!(!task.manual && task.requires_verification_test);
    assert_eq!(h.c.open_task_by_rule.get("nozzle_clean"), Some(&t));
    assert_eq!(h.c.period.rights_reserved, 2);
    let e = &events("task_opened")[0];
    assert_eq!(e["kind"], "Maintenance");
    assert_eq!(e["due_value"], 2000);
}

#[test]
fn open_upkeep_task_reserves_cash() {
    let mut h = due_printer(N);
    let t = h.open("bed_level");
    assert_eq!(h.c.ledger.float_free, N - N / 10);
    assert_eq!(h.c.ledger.rewards_reserved, N / 10);
    assert!(!h.task(t).needs_council);
    assert!(h.invariant_ok());
}

#[test]
#[should_panic(expected = "E_RULE_NOT_DUE")]
fn open_upkeep_task_rejects_metric_not_due() {
    let mut h = H::wired(0);
    h.telemetry(&[("nozzle_seconds", 1799)]);
    h.open("nozzle_clean");
}

#[test]
#[should_panic(expected = "E_RULE_NOT_DUE")]
fn open_upkeep_task_rejects_report_not_due() {
    let mut h = H::wired(0);
    h.open("fault_repair");
}

#[test]
#[should_panic(expected = "E_RULE_NOT_FOUND")]
fn open_upkeep_task_rejects_unknown_rule() {
    let mut h = H::wired(0);
    h.open("nope");
}

#[test]
#[should_panic(expected = "E_TASK_ALREADY_OPEN")]
fn open_upkeep_task_rejects_second_open_task() {
    let mut h = due_printer(0);
    h.open("nozzle_clean");
    h.open("nozzle_clean");
}

#[test]
#[should_panic(expected = "E_NOT_AGENT")]
fn open_upkeep_task_rejects_other_accounts() {
    let mut h = due_printer(0);
    h.call(&alice(), 0, |c| {
        c.open_upkeep_task("nozzle_clean".to_string(), "x".to_string(), None)
    });
}

#[test]
#[should_panic(expected = "E_UNAUTHORIZED")]
fn open_upkeep_task_agent_cannot_pass_manual() {
    let mut h = H::wired(0);
    h.call(&agent(), 0, |c| {
        c.open_upkeep_task("nozzle_clean".to_string(), "x".to_string(), Some(true))
    });
}

#[test]
fn open_upkeep_task_council_manual_bypass_is_recorded() {
    let mut h = H::wired(0);
    let t = h
        .call(&council(), 0, |c| {
            c.open_upkeep_task(
                "nozzle_clean".to_string(),
                "visible clog".to_string(),
                Some(true),
            )
        })
        .0;
    assert!(h.task(t).manual);
    assert_eq!(h.task(t).opened_by, council());
}

#[test]
#[should_panic(expected = "E_RULE_NOT_DUE")]
fn open_upkeep_task_council_without_manual_needs_due() {
    let mut h = H::wired(0);
    h.call(&council(), 0, |c| {
        c.open_upkeep_task("nozzle_clean".to_string(), "x".to_string(), None)
    });
}

#[test]
#[should_panic(expected = "E_INSUFFICIENT_FLOAT")]
fn open_upkeep_task_rejects_cash_above_float() {
    let mut h = due_printer(0);
    h.open("bed_level");
}

#[test]
#[should_panic(expected = "E_CASH_CAP_EXCEEDED")]
fn open_upkeep_task_rejects_cash_above_cap() {
    let mut h = due_printer(3 * N);
    h.c.profile.rules[1].reward_cash = U128(2 * N); // bypasses validation on purpose
    h.open("bed_level");
}

#[test]
#[should_panic(expected = "E_QUOTA_EXCEEDED")]
fn open_upkeep_task_rejects_quota_overrun() {
    let mut h = due_printer(N);
    h.c.profile.period_reward_quota = 3;
    h.open("nozzle_clean"); // 2 rights reserved
    h.open("filament_spool"); // 1 right → 3
    h.open("bed_level"); // would be 4
}

#[test]
fn open_upkeep_task_quota_frees_after_period() {
    let mut h = due_printer(N);
    h.c.profile.period_reward_quota = 2;
    h.c.period.rights_minted = 2;
    h.now += 31 * DAY;
    h.open("nozzle_clean");
    assert_eq!(h.c.period.rights_minted, 0);
    assert_eq!(h.c.period.started_at, U64(h.now));
}

#[test]
fn open_upkeep_task_needs_council_above_threshold() {
    let mut h = due_printer(3 * N);
    h.c.profile.rules[1].reward_cash = U128(N);
    let t = h.open("bed_level");
    assert!(h.task(t).needs_council);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn open_upkeep_task_rejects_long_rationale() {
    let mut h = due_printer(0);
    h.call(&agent(), 0, |c| {
        c.open_upkeep_task("nozzle_clean".to_string(), "x".repeat(1001), None)
    });
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn open_upkeep_task_rejects_empty_rationale() {
    let mut h = due_printer(0);
    h.call(&agent(), 0, |c| {
        c.open_upkeep_task("nozzle_clean".to_string(), String::new(), None)
    });
}

// ---- annotate / claim / unclaim / expire ----

#[test]
fn annotate_task_emits_event() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.call(&agent(), 0, |c| {
        c.annotate_task(U64(t), "still due".to_string())
    });
    assert_eq!(events("task_annotated")[0]["note"], "still due");
}

#[test]
#[should_panic(expected = "E_NOT_AGENT")]
fn annotate_task_rejects_non_agent() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.call(&council(), 0, |c| c.annotate_task(U64(t), "x".to_string()));
}

#[test]
fn claim_task_by_member() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.claim(t, &alice());
    let task = h.task(t);
    assert_eq!(
        (task.status, task.claimer),
        (TaskStatus::Claimed, Some(alice()))
    );
}

#[test]
#[should_panic(expected = "E_UNAUTHORIZED")]
fn claim_task_rejects_agent() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.claim(t, &agent());
}

#[test]
#[should_panic(expected = "E_UNAUTHORIZED")]
fn claim_task_rejects_bridge() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.claim(t, &bridge());
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn claim_task_rejects_claimed() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.claim(t, &alice());
    h.claim(t, &bob());
}

#[test]
#[should_panic(expected = "E_NOT_FOUND")]
fn claim_task_rejects_unknown() {
    let mut h = due_printer(0);
    h.claim(9, &alice());
}

#[test]
fn unclaim_task_by_claimer() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.claim(t, &alice());
    h.call(&alice(), 0, |c| c.unclaim_task(U64(t)));
    assert_eq!(h.task(t).status, TaskStatus::Open);
    assert!(h.task(t).claimer.is_none());
}

#[test]
fn unclaim_task_by_anyone_after_timeout() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.claim(t, &alice());
    h.now += 24 * HOUR;
    h.call(&bob(), 0, |c| c.unclaim_task(U64(t)));
    assert_eq!(events("task_unclaimed")[0]["timed_out"], true);
}

#[test]
#[should_panic(expected = "E_UNAUTHORIZED")]
fn unclaim_task_rejects_others_before_timeout() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.claim(t, &alice());
    h.call(&bob(), 0, |c| c.unclaim_task(U64(t)));
}

#[test]
fn expire_task_after_timeout() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.claim(t, &alice());
    h.now += 25 * HOUR;
    h.call(&bob(), 0, |c| c.expire_task(U64(t)));
    assert_eq!(h.task(t).status, TaskStatus::Open);
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn expire_task_rejects_before_timeout() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.claim(t, &alice());
    h.call(&bob(), 0, |c| c.expire_task(U64(t)));
}

// ---- submit / verification ----

#[test]
fn submit_task_stores_evidence() {
    let mut h = due_printer(0);
    let t = h.submitted("nozzle_clean", 0);
    let task = h.task(t);
    assert_eq!(task.status, TaskStatus::Submitted);
    assert_eq!(task.evidence_hash.as_deref(), Some(HASH));
    assert_eq!(task.expense, U128(0));
}

#[test]
fn submit_task_restock_with_expense() {
    let mut h = due_printer(0);
    let t = h.submitted("filament_spool", N / 4);
    let task = h.task(t);
    assert_eq!(task.expense, U128(N / 4));
    assert_eq!(task.receipt_hash.as_deref(), Some(HASH));
    assert_eq!(task.expense_state, ExpenseState::None);
    assert_eq!(h.c.ledger.rewards_reserved, 0, "nothing reserved at submit");
}

#[test]
#[should_panic(expected = "E_NOT_REIMBURSABLE")]
fn submit_task_rejects_expense_on_maintenance() {
    let mut h = due_printer(0);
    h.submitted("nozzle_clean", 1);
}

#[test]
#[should_panic(expected = "E_EXPENSE_CAP")]
fn submit_task_rejects_expense_above_cap() {
    let mut h = due_printer(0);
    h.submitted("filament_spool", 3 * N + 1);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn submit_task_rejects_expense_without_receipt() {
    let mut h = due_printer(0);
    let t = h.open("filament_spool");
    h.claim(t, &alice());
    h.call(&alice(), 0, |c| {
        c.submit_task(U64(t), HASH.to_string(), None, Some(U128(1)), None)
    });
}

#[test]
#[should_panic(expected = "E_UNAUTHORIZED")]
fn submit_task_rejects_non_claimer() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.claim(t, &alice());
    h.submit(t, &bob(), 0);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn submit_task_rejects_bad_hash() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.claim(t, &alice());
    h.call(&alice(), 0, |c| {
        c.submit_task(U64(t), "abc".to_string(), None, None, None)
    });
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn submit_task_rejects_open_task() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.c.tasks.get_mut(&t).unwrap().claimer = Some(alice());
    h.submit(t, &alice(), 0);
}

#[test]
fn submit_verification_result_by_bridge() {
    let mut h = due_printer(0);
    let t = h.submitted("nozzle_clean", 0);
    h.pass_test(t);
    assert!(h.task(t).verification.unwrap().passed);
    assert_eq!(events("verification_reported").len(), 1);
}

#[test]
#[should_panic(expected = "E_NOT_BRIDGE")]
fn submit_verification_result_rejects_non_bridge() {
    let mut h = due_printer(0);
    let t = h.submitted("nozzle_clean", 0);
    h.call(&agent(), 0, |c| {
        c.submit_verification_result(U64(t), true, HASH.to_string())
    });
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn submit_verification_result_rejects_unsubmitted() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.pass_test(t);
}

// ---- approve / council / reject / cancel ----

#[test]
fn approve_task_starts_reward_mint() {
    let mut h = due_printer(0);
    let t = h.submitted("nozzle_clean", 0);
    h.pass_test(t);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    let task = h.task(t);
    assert_eq!(task.status, TaskStatus::Approved);
    assert_eq!(task.reward_state, RewardState::RightsPending);
    assert_eq!(task.verifier, Some(verifier()));
    assert_eq!(task.metric_value_at_approval, Some(2000));
    let mint = calls()
        .into_iter()
        .find(|c| c.method == "mint_rights")
        .unwrap();
    assert_eq!(mint.receiver, commons());
    assert_eq!(mint.args["holder"], "alice.testnet");
    assert_eq!(mint.args["count"], 2);
    assert_eq!(mint.args["max_slots"], 2);
    assert_eq!(mint.args["validity_days"], 90);
    assert_eq!(mint.args["source"]["type"], "Maintenance");
    assert_eq!(mint.args["source"]["asset"], asset().as_str());
    assert_eq!(mint.args["source"]["task_id"], t.to_string());
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn approve_task_requires_passed_test() {
    let mut h = due_printer(0);
    let t = h.submitted("nozzle_clean", 0);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn approve_task_rejects_failed_test() {
    let mut h = due_printer(0);
    let t = h.submitted("nozzle_clean", 0);
    h.call(&bridge(), 0, |c| {
        c.submit_verification_result(U64(t), false, HASH.to_string())
    });
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
}

#[test]
#[should_panic(expected = "E_SELF_VERIFY")]
fn approve_task_rejects_claimer_with_verifier_role() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.claim(t, &verifier());
    h.submit(t, &verifier(), 0);
    h.pass_test(t);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
}

#[test]
#[should_panic(expected = "E_SELF_VERIFY")]
fn approve_task_rejects_agent() {
    let mut h = due_printer(0);
    h.roles(&[(agent(), &["verifier"])]);
    let t = h.submitted("nozzle_clean", 0);
    h.pass_test(t);
    h.call(&agent(), 0, |c| c.approve_task(U64(t)));
}

#[test]
#[should_panic(expected = "E_SELF_VERIFY")]
fn approve_task_rejects_bridge() {
    let mut h = due_printer(0);
    h.roles(&[(bridge(), &["verifier"])]);
    let t = h.submitted("nozzle_clean", 0);
    h.pass_test(t);
    h.call(&bridge(), 0, |c| c.approve_task(U64(t)));
}

#[test]
#[should_panic(expected = "E_MISSING_ROLE")]
fn approve_task_rejects_non_verifier() {
    let mut h = due_printer(0);
    let t = h.submitted("nozzle_clean", 0);
    h.pass_test(t);
    h.call(&bob(), 0, |c| c.approve_task(U64(t)));
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn approve_task_rejects_second_approval() {
    let mut h = due_printer(N);
    h.c.profile.first_task_needs_council = true;
    let t = h.submitted("bed_level", 0);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    h.call(&council2(), 0, |c| c.approve_task(U64(t)));
}

#[test]
fn approve_task_first_task_waits_for_council() {
    let mut h = due_printer(N);
    h.c.profile.first_task_needs_council = true;
    let t = h.submitted("bed_level", 0);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    let task = h.task(t);
    assert_eq!(task.status, TaskStatus::Submitted);
    assert!(task.needs_council);
    assert_eq!(events("task_approved")[0]["awaiting_council"], true);
    h.call(&council(), 0, |c| c.council_approve_task(U64(t)));
    assert_eq!(h.task(t).status, TaskStatus::Approved);
    assert_eq!(h.task(t).council_approver, Some(council()));
}

#[test]
#[should_panic(expected = "E_SELF_VERIFY")]
fn council_approve_task_rejects_verifier() {
    let mut h = due_printer(N);
    h.c.profile.first_task_needs_council = true;
    let t = h.submitted("bed_level", 0);
    h.call(&council2(), 0, |c| c.approve_task(U64(t)));
    h.call(&council2(), 0, |c| c.council_approve_task(U64(t)));
}

#[test]
#[should_panic(expected = "E_SELF_VERIFY")]
fn council_approve_task_rejects_claimer() {
    let mut h = due_printer(N);
    h.c.profile.first_task_needs_council = true;
    let t = h.open("bed_level");
    h.claim(t, &council());
    h.submit(t, &council(), 0);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    h.call(&council(), 0, |c| c.council_approve_task(U64(t)));
}

#[test]
#[should_panic(expected = "E_MISSING_ROLE")]
fn council_approve_task_rejects_non_council() {
    let mut h = due_printer(N);
    h.c.profile.first_task_needs_council = true;
    let t = h.submitted("bed_level", 0);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    h.call(&steward(), 0, |c| c.council_approve_task(U64(t)));
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn council_approve_task_rejects_without_verifier() {
    let mut h = due_printer(N);
    let t = h.submitted("bed_level", 0);
    h.call(&council(), 0, |c| c.council_approve_task(U64(t)));
}

#[test]
fn reject_task_releases_cash_and_rule() {
    let mut h = due_printer(N);
    let t = h.submitted("bed_level", 0);
    h.call(&verifier(), 0, |c| {
        c.reject_task(U64(t), "not level".to_string())
    });
    assert_eq!(h.task(t).status, TaskStatus::Rejected);
    assert_eq!(h.c.ledger.float_free, N);
    assert_eq!(h.c.ledger.rewards_reserved, 0);
    assert_eq!(h.c.period.rights_reserved, 0);
    assert!(h.c.open_task_by_rule.get("bed_level").is_none());
    h.open("bed_level"); // the rule can be reopened
}

#[test]
#[should_panic(expected = "E_SELF_VERIFY")]
fn reject_task_rejects_claimer() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.claim(t, &verifier());
    h.submit(t, &verifier(), 0);
    h.call(&verifier(), 0, |c| c.reject_task(U64(t), "x".to_string()));
}

#[test]
#[should_panic(expected = "E_MISSING_ROLE")]
fn reject_task_rejects_without_role() {
    let mut h = due_printer(0);
    let t = h.submitted("nozzle_clean", 0);
    h.call(&steward(), 0, |c| c.reject_task(U64(t), "x".to_string()));
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn reject_task_rejects_open_task() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.call(&verifier(), 0, |c| c.reject_task(U64(t), "x".to_string()));
}

#[test]
fn cancel_task_by_council_releases_reservations() {
    let mut h = due_printer(N);
    let t = h.open("bed_level");
    h.call(&council(), 0, |c| {
        c.cancel_task(U64(t), "false alarm".to_string())
    });
    assert_eq!(h.task(t).status, TaskStatus::Cancelled);
    assert_eq!(h.c.ledger.float_free, N);
    assert!(h.c.open_task_by_rule.get("bed_level").is_none());
}

#[test]
#[should_panic(expected = "E_UNAUTHORIZED")]
fn cancel_task_rejects_agent() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.call(&agent(), 0, |c| c.cancel_task(U64(t), "x".to_string()));
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn cancel_task_rejects_submitted() {
    let mut h = due_printer(0);
    let t = h.submitted("nozzle_clean", 0);
    h.call(&dao(), 0, |c| c.cancel_task(U64(t), "x".to_string()));
}

// ---- expenses at approval ----

#[test]
fn approve_task_reserves_small_expense_from_float() {
    let mut h = due_printer(N);
    let t = h.submitted("filament_spool", N / 4);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    let task = h.task(t);
    assert_eq!(task.expense_state, ExpenseState::Reserved);
    assert_eq!(task.status, TaskStatus::Approved);
    assert_eq!(h.c.ledger.float_free, N - N / 4);
    assert_eq!(h.c.ledger.rewards_reserved, N / 4);
}

#[test]
fn approve_task_expense_above_council_threshold_waits_for_council() {
    let mut h = due_printer(N);
    let t = h.submitted("filament_spool", 3 * N / 4);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    let task = h.task(t);
    assert!(task.needs_council);
    assert_eq!(task.expense_state, ExpenseState::None);
    assert_eq!(h.c.ledger.rewards_reserved, 0);
    h.call(&council(), 0, |c| c.council_approve_task(U64(t)));
    assert_eq!(h.task(t).expense_state, ExpenseState::Reserved);
    assert_eq!(h.c.ledger.rewards_reserved, 3 * N / 4);
}

#[test]
fn approve_task_expense_above_float_waits_for_council() {
    let mut h = due_printer(N / 10);
    let t = h.submitted("filament_spool", N / 4);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    assert!(h.task(t).needs_council);
}

#[test]
#[should_panic(expected = "E_INSUFFICIENT_FLOAT")]
fn council_approve_task_rejects_expense_above_float() {
    let mut h = due_printer(N / 10);
    let t = h.submitted("filament_spool", N / 4);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    h.call(&council(), 0, |c| c.council_approve_task(U64(t)));
}

#[test]
fn approve_task_expense_above_cash_cap_needs_escalation() {
    let mut h = due_printer(3 * N);
    let t = h.submitted("filament_spool", 2 * N);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    let task = h.task(t);
    assert_eq!(task.expense_state, ExpenseState::NeedsEscalation);
    assert_eq!(task.status, TaskStatus::Approved);
    assert_eq!(h.c.ledger.float_free, 3 * N);
}

#[test]
fn reject_task_releases_reserved_expense() {
    let mut h = due_printer(N);
    h.c.profile.first_task_needs_council = true;
    let t = h.submitted("filament_spool", N / 4);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    assert_eq!(h.task(t).expense_state, ExpenseState::Reserved);
    h.call(&council(), 0, |c| {
        c.reject_task(U64(t), "no receipt".to_string())
    });
    assert_eq!(h.task(t).expense_state, ExpenseState::None);
    assert_eq!(h.c.ledger.float_free, N);
    assert_eq!(h.c.ledger.rewards_reserved, 0);
}

// ---- verifier fixes (D-213) ----

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn approve_task_requires_reward_gas() {
    let mut h = due_printer(N);
    let t = h.submitted("bed_level", 0);
    h.gas_tgas = 100;
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn council_approve_task_requires_reward_gas() {
    let mut h = due_printer(N);
    h.c.profile.first_task_needs_council = true;
    let t = h.submitted("bed_level", 0);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    h.gas_tgas = 100;
    h.call(&council(), 0, |c| c.council_approve_task(U64(t)));
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn submit_verification_result_rejects_after_verifier_approval() {
    let mut h = due_printer(N);
    h.c.profile.first_task_needs_council = true;
    let t = h.submitted("bed_level", 0);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    h.pass_test(t);
}

#[test]
fn cancel_task_false_alarm_resets_baseline_and_faults() {
    let mut h = due_printer(0);
    let t = h.open("nozzle_clean");
    h.call(&council(), 0, |c| {
        c.cancel_task(U64(t), "sensor glitch".to_string())
    });
    assert_eq!(h.c.rule_baselines.get("nozzle_clean"), Some(&2000));
    let again = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| h.open("nozzle_clean")));
    assert!(again.is_err(), "not due again right after a false alarm");
    // Report rule: faults cleared
    h.session(&bob());
    h.session(&alice());
    for who in [alice(), bob()] {
        h.call(&who, 0, |c| c.report_fault(None, HASH.to_string()));
    }
    let t = h.open("fault_repair");
    h.call(&dao(), 0, |c| {
        c.cancel_task(U64(t), "duplicate".to_string())
    });
    assert!(h.c.faults.get("fault_repair").is_none());
}

#[test]
fn reject_task_keeps_baseline() {
    let mut h = due_printer(0);
    let t = h.submitted("filament_spool", 0);
    h.call(&verifier(), 0, |c| {
        c.reject_task(U64(t), "no spool".to_string())
    });
    assert!(h.c.rule_baselines.get("filament_spool").is_none());
    h.open("filament_spool");
}

#[test]
fn reject_task_resets_needs_escalation() {
    let mut h = due_printer(3 * N);
    h.c.profile.first_task_needs_council = true;
    let t = h.submitted("filament_spool", 2 * N);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    assert_eq!(h.task(t).expense_state, ExpenseState::NeedsEscalation);
    assert_eq!(h.task(t).status, TaskStatus::Submitted);
    h.c.dao_proposal_bond = Some(N);
    let early = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        h.call(&agent(), 0, |c| {
            c.escalate(
                "reimbursement".to_string(),
                alice(),
                U128(2 * N),
                "x".to_string(),
                Some(U64(t)),
            )
        })
    }));
    assert!(early.is_err(), "escalation needs an approved task");
    h.call(&council(), 0, |c| {
        c.reject_task(U64(t), "no receipt".to_string())
    });
    assert_eq!(h.task(t).expense_state, ExpenseState::None);
}

#[test]
fn close_failed_reward_releases_reservations() {
    let mut h = due_printer(N);
    let t = h.submitted("bed_level", 0);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    h.callback(PromiseResult::Failed, |c| c.on_rights_minted(U64(t)));
    h.call(&dao(), 0, |c| {
        c.close_failed_reward(U64(t), "asset left commons".to_string())
    });
    assert_eq!(h.task(t).status, TaskStatus::Cancelled);
    assert_eq!(h.c.ledger.rewards_reserved, 0);
    assert_eq!(h.c.ledger.float_free, N);
    assert_eq!(h.c.period.rights_reserved, 0);
    assert!(h.c.open_task_by_rule.get("bed_level").is_none());
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn close_failed_reward_rejects_pending_reward() {
    let mut h = due_printer(N);
    let t = h.submitted("bed_level", 0);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    h.call(&dao(), 0, |c| {
        c.close_failed_reward(U64(t), "x".to_string())
    });
}

#[test]
#[should_panic(expected = "E_NOT_DAO")]
fn close_failed_reward_rejects_non_dao() {
    let mut h = due_printer(N);
    h.call(&council(), 0, |c| {
        c.close_failed_reward(U64(0), "x".to_string())
    });
}
