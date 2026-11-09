use super::*;

fn printer(float: u128) -> H {
    let mut h = H::wired(float);
    h.settle_all();
    h.telemetry(&[
        ("nozzle_seconds", 2000),
        ("jobs_total", 60),
        ("filament_used_mm", 400_000),
    ]);
    h
}

fn approved(h: &mut H, rule: &str, expense: u128) -> u64 {
    let t = h.submitted(rule, expense);
    if h.task(t).requires_verification_test {
        h.pass_test(t);
    }
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    t
}

#[test]
fn reward_rights_only_completes_on_mint() {
    let mut h = printer(0);
    let t = approved(&mut h, "nozzle_clean", 0);
    h.telemetry(&[("nozzle_seconds", 2500)]);
    assert!(h.minted(t, &["right-1", "right-2"]));
    let task = h.task(t);
    assert_eq!(task.status, TaskStatus::Rewarded);
    assert_eq!(task.reward_state, RewardState::Done);
    assert_eq!(task.minted_right_ids, vec!["right-1", "right-2"]);
    assert_eq!(h.c.period.rights_minted, 2);
    assert_eq!(h.c.period.rights_reserved, 0);
    // baseline = value at approval, not at mint time
    assert_eq!(h.c.rule_baselines.get("nozzle_clean"), Some(&2000));
    assert!(h.c.open_task_by_rule.get("nozzle_clean").is_none());
    assert_eq!(h.c.reputation.get(&alice()).unwrap().upkeeps, 1);
    assert_eq!(events("task_rewarded").len(), 1);
    assert_eq!(events("reputation_recorded")[0]["kind"], "upkeep");
}

#[test]
fn reward_mint_failure_then_retry_mints_once() {
    let mut h = printer(0);
    let t = approved(&mut h, "nozzle_clean", 0);
    assert!(!h.callback(PromiseResult::Failed, |c| c.on_rights_minted(U64(t))));
    assert!(matches!(h.task(t).reward_state, RewardState::Failed { .. }));
    assert_eq!(events("reward_failed")[0]["reason"], "E_MINT_FAILED");
    assert_eq!(h.c.period.rights_minted, 0);
    h.call(&bob(), 0, |c| c.retry_reward(U64(t)));
    assert_eq!(h.task(t).reward_state, RewardState::RightsPending);
    let mint = calls()
        .into_iter()
        .find(|c| c.method == "mint_rights")
        .unwrap();
    assert_eq!(mint.args["source"]["task_id"], t.to_string());
    assert!(h.minted(t, &["right-1", "right-2"]));
    assert_eq!(h.task(t).status, TaskStatus::Rewarded);
    assert_eq!(h.c.period.rights_minted, 2);
    // a late duplicate callback changes nothing
    assert!(!h.minted(t, &["right-1", "right-2"]));
    assert_eq!(h.c.period.rights_minted, 2);
    assert_eq!(h.c.reputation.get(&alice()).unwrap().upkeeps, 1);
}

#[test]
#[should_panic(expected = "E_ALREADY_REWARDED")]
fn retry_reward_rejects_rewarded_task() {
    let mut h = printer(0);
    let t = approved(&mut h, "nozzle_clean", 0);
    h.minted(t, &["right-1", "right-2"]);
    h.call(&bob(), 0, |c| c.retry_reward(U64(t)));
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn retry_reward_rejects_pending_mint() {
    let mut h = printer(0);
    let t = approved(&mut h, "nozzle_clean", 0);
    h.call(&bob(), 0, |c| c.retry_reward(U64(t)));
}

#[test]
fn reward_unreadable_mint_result_is_a_failure() {
    let mut h = printer(0);
    let t = approved(&mut h, "nozzle_clean", 0);
    h.callback(PromiseResult::Successful(b"nope".to_vec()), |c| {
        c.on_rights_minted(U64(t))
    });
    assert!(matches!(h.task(t).reward_state, RewardState::Failed { .. }));
}

#[test]
fn reward_cash_after_mint_then_done_on_transfer() {
    let mut h = printer(N);
    let t = approved(&mut h, "bed_level", 0);
    h.minted(t, &["right-1"]);
    let task = h.task(t);
    assert_eq!(task.reward_state, RewardState::CashPending);
    let op = h.op(task.cash_op_id.unwrap().0);
    assert_eq!(
        (op.kind, op.to.clone(), op.amount.0),
        (OpKind::CashReward, alice(), N / 10)
    );
    assert_eq!(transfers(), vec![(alice(), N / 10)]);
    assert_eq!(h.c.ledger.rewards_reserved, 0);
    h.settle(op.id.0, true);
    assert_eq!(h.task(t).status, TaskStatus::Rewarded);
    assert_eq!(h.c.ledger.total_rewards_paid, N / 10);
    assert!(h.invariant_ok());
}

#[test]
fn reward_failed_cash_keeps_claim_and_retry_pays_once() {
    let mut h = printer(N);
    let t = approved(&mut h, "bed_level", 0);
    h.minted(t, &["right-1"]);
    let op = h.task(t).cash_op_id.unwrap();
    h.settle(op.0, false);
    // the task completes; the cash claim stays reserved and retryable
    assert_eq!(h.task(t).status, TaskStatus::Rewarded);
    assert_eq!(h.c.ledger.rewards_reserved, N / 10);
    assert!(h.invariant_ok());
    h.call(&bob(), 0, |c| c.retry_op(op));
    h.settle(op.0, true);
    assert_eq!(h.c.ledger.total_rewards_paid, N / 10);
    assert_eq!(h.c.ledger.rewards_reserved, 0);
    assert_eq!(h.c.reputation.get(&alice()).unwrap().upkeeps, 1);
}

#[test]
fn reward_restock_pays_reimbursement_separately() {
    let mut h = printer(N);
    let t = approved(&mut h, "filament_spool", N / 4);
    h.minted(t, &["right-1"]);
    let task = h.task(t);
    assert!(task.cash_op_id.is_none());
    let op = h.op(task.reimbursement_op_id.unwrap().0);
    assert_eq!((op.kind, op.amount.0), (OpKind::Reimbursement, N / 4));
    h.settle(op.id.0, true);
    let task = h.task(t);
    assert_eq!(task.expense_state, ExpenseState::Paid);
    assert_eq!(task.status, TaskStatus::Rewarded);
    assert_eq!(h.c.ledger.total_reimbursed, N / 4);
    assert_eq!(h.c.ledger.float_free, N - N / 4);
    assert!(h.invariant_ok());
}

#[test]
fn reward_failed_reimbursement_is_retryable() {
    let mut h = printer(N);
    let t = approved(&mut h, "filament_spool", N / 4);
    h.minted(t, &["right-1"]);
    let op = h.task(t).reimbursement_op_id.unwrap();
    h.settle(op.0, false);
    assert_eq!(h.task(t).expense_state, ExpenseState::Reserved);
    assert_eq!(h.c.ledger.rewards_reserved, N / 4);
    h.call(&bob(), 0, |c| c.retry_op(op));
    h.settle(op.0, true);
    assert_eq!(h.task(t).expense_state, ExpenseState::Paid);
}

#[test]
fn reward_schedule_resets_baseline_to_now() {
    let mut h = printer(0);
    h.now += 168 * HOUR;
    let t = approved(&mut h, "weekly_clean", 0);
    h.now += HOUR;
    h.minted(t, &["right-1"]);
    assert_eq!(h.c.rule_baselines.get("weekly_clean"), Some(&h.now));
}

#[test]
fn reward_report_clears_faults_and_repair_restores_service() {
    let mut h = printer(N);
    h.session(&alice());
    h.session(&bob());
    for who in [alice(), bob()] {
        h.call(&who, 0, |c| c.report_fault(None, HASH.to_string()));
    }
    h.call(&steward(), 0, |c| {
        c.set_out_of_service(true, HASH.to_string())
    });
    let t = h.open("fault_repair");
    h.claim(t, &steward());
    h.submit(t, &steward(), N / 5);
    h.call(&verifier(), 0, |c| c.approve_task(U64(t)));
    h.minted(t, &["right-1", "right-2"]);
    h.settle(h.task(t).reimbursement_op_id.unwrap().0, true);
    assert_eq!(h.task(t).status, TaskStatus::Rewarded);
    assert!(h.c.faults.get("fault_repair").is_none());
    assert!(h.c.service.in_service);
    let period = h.c.service_log.get(0).cloned().unwrap();
    assert_eq!(
        period.ended_by,
        Some(ServiceRestoredBy::RepairRewarded { task_id: U64(t) })
    );
    assert_eq!(events("service_restored").len(), 1);
}

#[test]
fn reward_with_no_rights_and_no_cash_finishes_immediately() {
    let mut h = printer(0);
    h.c.profile.rules[0].reward_rights = 0;
    let t = approved(&mut h, "nozzle_clean", 0);
    assert_eq!(h.task(t).status, TaskStatus::Rewarded);
    assert!(calls().iter().all(|c| c.method != "mint_rights"));
}

#[test]
fn escalate_reimbursement_for_large_expense() {
    let mut h = printer(3 * N);
    h.call(&bob(), 0, |c| c.refresh_dao_policy());
    let policy = format!(
        r#"{{"proposal_bond":"{N}","proposal_period":"{}"}}"#,
        7 * DAY
    );
    h.callback(PromiseResult::Successful(policy.into_bytes()), |c| {
        c.on_dao_policy()
    });
    let t = approved(&mut h, "filament_spool", 2 * N);
    assert_eq!(h.task(t).expense_state, ExpenseState::NeedsEscalation);
    let e = h
        .call(&agent(), 0, |c| {
            c.escalate(
                "reimbursement".to_string(),
                alice(),
                U128(2 * N),
                "filament spool receipt".to_string(),
                Some(U64(t)),
            )
        })
        .0;
    assert_eq!(
        h.task(t).expense_state,
        ExpenseState::Escalated {
            escalation_id: U64(e)
        }
    );
    // a failed submission returns the task to NeedsEscalation
    h.balance += N;
    h.callback(PromiseResult::Failed, |c| c.on_escalation_submitted(U64(e)));
    assert_eq!(h.task(t).expense_state, ExpenseState::NeedsEscalation);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn escalate_reimbursement_rejects_wrong_amount() {
    let mut h = printer(3 * N);
    h.c.dao_proposal_bond = Some(N);
    let t = approved(&mut h, "filament_spool", 2 * N);
    h.call(&agent(), 0, |c| {
        c.escalate(
            "reimbursement".to_string(),
            alice(),
            U128(3 * N),
            "x".to_string(),
            Some(U64(t)),
        )
    });
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn escalate_reimbursement_rejects_task_without_pending_expense() {
    let mut h = printer(3 * N);
    h.c.dao_proposal_bond = Some(N);
    let t = approved(&mut h, "nozzle_clean", 0);
    h.call(&agent(), 0, |c| {
        c.escalate(
            "reimbursement".to_string(),
            alice(),
            U128(N),
            "x".to_string(),
            Some(U64(t)),
        )
    });
}
