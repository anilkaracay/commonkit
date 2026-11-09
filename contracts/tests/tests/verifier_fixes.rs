//! Sandbox checks of the verifier review fixes (D-213 items 1, 2 and 5).
#![allow(unused_must_use)]

mod common;

use anyhow::Result;
use common::*;
use serde_json::{json, Value};

/// Item 1: a reservation with a right needs ≥ 0.01 NEAR; a bogus right keeps only the
/// measured storage cost.
#[tokio::test]
async fn right_reservation_needs_min_deposit_and_rejection_keeps_storage_cost() -> Result<()> {
    let env = Env::new().await?;
    let s = env.now_slot(&env.washer).await? + 2;
    let free = env
        .alice
        .call(env.washer.id(), "reserve")
        .args_json(json!({"start_slot": s.to_string(), "slots": 1, "right_id": "right-404"}))
        .gas(tgas(150))
        .transact()
        .await?;
    fails_with(&free, "E_WRONG_AMOUNT");
    let min = N / 100;
    let before = env.balance(env.alice.id()).await?;
    let r = ok(env
        .alice
        .call(env.washer.id(), "reserve")
        .args_json(json!({"start_slot": s.to_string(), "slots": 1, "right_id": "right-404"}))
        .deposit(yocto(min))
        .gas(tgas(150))
        .transact()
        .await?)?;
    let rejected = events(&r, "reservation_rejected");
    assert_eq!(rejected[0]["reason"], "E_RIGHT_NOT_ACTIVE", "{rejected:?}");
    let id = u64_of(&r.json::<Value>()?);
    let res = env.reservation(&env.washer, id).await?;
    let kept = u128_of(&res["storage_cost"]);
    assert!(kept > 0 && kept < min / 2, "kept {kept}");
    let spent = before - env.balance(env.alice.id()).await?;
    assert!(spent >= kept && spent < kept + GAS_SLACK, "spent {spent}");
    env.assert_invariant(&env.washer).await
}

fn cash_and_expense(file: &str, p: &mut Value) {
    if file == "printer_3d" {
        for r in p["rules"].as_array_mut().unwrap() {
            if r["rule_id"] == "filament_spool" {
                r["reward_cash"] = json!((N / 10).to_string());
            }
        }
    }
}

/// Item 2: approve needs ≥ 125 Tgas, and 125 Tgas is enough for the full reward
/// (mint + cash op + reimbursement op + their callbacks).
#[tokio::test]
async fn approve_with_minimum_gas_completes_the_whole_reward() -> Result<()> {
    let env = Env::with(EnvOptions {
        tweak: cash_and_expense,
    })
    .await?;
    env.fund_float(&env.printer, 3 * N).await?;
    env.telemetry(&env.printer, json!([["filament_used_mm", 330_001]]))
        .await?;
    let t = env
        .submitted_task(&env.printer, "filament_spool", &env.alice, Some(N / 5))
        .await?;
    let low = env
        .verifier
        .call(env.printer.id(), "approve_task")
        .args_json(json!({"task_id": t.to_string()}))
        .gas(tgas(120))
        .transact()
        .await?;
    fails_with(&low, "E_INVALID_ARGS");
    let r = ok(env
        .verifier
        .call(env.printer.id(), "approve_task")
        .args_json(json!({"task_id": t.to_string()}))
        .gas(tgas(125))
        .transact()
        .await?)?;
    println!(
        "approve (125 Tgas attached) burnt {} Tgas",
        r.total_gas_burnt.as_tgas()
    );
    let task = env.task(&env.printer, t).await?;
    assert_eq!(task["status"], "Rewarded", "{task:#}");
    assert_eq!(task["expense_state"], "Paid");
    assert_eq!(task["minted_right_ids"].as_array().unwrap().len(), 1);
    let l = env.ledger(&env.printer).await?;
    assert_eq!(u128_of(&l["total_rewards_paid"]), N / 10);
    assert_eq!(u128_of(&l["total_reimbursed"]), N / 5);
    env.assert_invariant(&env.printer).await
}

/// Item 5: out of service with a short float, the deposit comes back at once and the fee
/// is owed until the DAO tops up the float.
#[tokio::test]
async fn out_of_service_cancel_owes_fee_until_float_allows() -> Result<()> {
    let env = Env::new().await?;
    let s = env.now_slot(&env.printer).await? + 4;
    let r = ok(env.reserve(&env.printer, &env.alice, s, 1, None).await?)?;
    let id = u64_of(&r.json::<Value>()?);
    // spend the float: an approved restock expense (0.25 N, reserved from the float)
    env.telemetry(&env.printer, json!([["filament_used_mm", 330_001]]))
        .await?;
    let t = env
        .submitted_task(&env.printer, "filament_spool", &env.bob, Some(N / 4))
        .await?;
    ok(env
        .call(
            &env.verifier,
            &env.printer,
            "approve_task",
            json!({"task_id": t.to_string()}),
        )
        .await?)?;
    let float = u128_of(&env.ledger(&env.printer).await?["float_free"]);
    assert!(float < N / 4, "float {float}");
    ok(env
        .call(
            &env.steward,
            &env.printer,
            "set_out_of_service",
            json!({"out": true, "reason_hash": HASH}),
        )
        .await?)?;
    let before = env.balance(env.alice.id()).await?;
    ok(env
        .call(
            &env.alice,
            &env.printer,
            "cancel_reservation",
            json!({"id": id.to_string()}),
        )
        .await?)?;
    let got = env.balance(env.alice.id()).await? + GAS_SLACK - before;
    assert!(
        (2 * N..2 * N + N / 4 - N / 20).contains(&got),
        "deposit only: {got}"
    );
    let res = env.reservation(&env.printer, id).await?;
    assert_eq!(res["fee_refund_owed"], (N / 4).to_string());
    fails_with(
        &env.call(
            &env.bob,
            &env.printer,
            "claim_fee_refund",
            json!({"id": id.to_string()}),
        )
        .await?,
        "E_INSUFFICIENT_FLOAT",
    );
    env.fund_float(&env.printer, N).await?;
    let before = env.balance(env.alice.id()).await?;
    ok(env
        .call(
            &env.bob,
            &env.printer,
            "claim_fee_refund",
            json!({"id": id.to_string()}),
        )
        .await?)?;
    assert_eq!(env.balance(env.alice.id()).await? - before, N / 4);
    let l = env.ledger(&env.printer).await?;
    assert_eq!(u128_of(&l["fee_refunds_owed"]), 0);
    env.assert_invariant(&env.printer).await
}
