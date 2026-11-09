//! Gas measurement of the heavy paths (spec §8). Prints every receipt's burnt gas; the values
//! are recorded in DECISIONS (D-214). Assertions keep each path well under its budget.
#![allow(unused_must_use)]

mod common;

use anyhow::Result;
use common::*;
use near_workspaces::result::ExecutionFinalResult;
use serde_json::{json, Value};

fn report(label: &str, r: &ExecutionFinalResult) -> u64 {
    let total = r.total_gas_burnt.as_tgas();
    let parts: Vec<String> = r
        .receipt_outcomes()
        .iter()
        .map(|o| {
            format!(
                "{}={:.1}",
                o.executor_id,
                o.gas_burnt.as_gas() as f64 / 1e12
            )
        })
        .collect();
    println!("GAS {label}: total {total} Tgas | {}", parts.join(" "));
    total
}

fn spool_with_cash(file: &str, p: &mut Value) {
    if file == "printer_3d" {
        for r in p["rules"].as_array_mut().unwrap() {
            if r["rule_id"] == "filament_spool" {
                r["reward_cash"] = json!((N / 10).to_string());
            }
        }
    }
}

#[tokio::test]
async fn measure_gas_heavy_paths() -> Result<()> {
    let env = Env::with(EnvOptions {
        tweak: spool_with_cash,
    })
    .await?;
    env.fund_float(&env.printer, 3 * N).await?;

    // reserve → authorize → on_authorized (+ sweep)
    let s = env.now_slot(&env.printer).await? + 2;
    let r = ok(env.reserve(&env.printer, &env.alice, s, 2, None).await?)?;
    assert!(
        report(
            "reserve(printer, 2 slots) + authorize + on_authorized + sweep",
            &r
        ) < 60
    );

    // rejection path: credential missing → refund op
    let l = env.now_slot(&env.laser).await? + 2;
    let r = ok(env.reserve(&env.laser, &env.bob, l, 1, None).await?)?;
    assert!(report("reserve(laser) rejected + refund op", &r) < 60);

    // approve → mint → on_rights_minted → cash + reimbursement ops → on_op_result ×2
    env.telemetry(&env.printer, json!([["filament_used_mm", 330_001]]))
        .await?;
    let t = env
        .submitted_task(&env.printer, "filament_spool", &env.alice, Some(N / 5))
        .await?;
    let r = ok(env
        .verifier
        .call(env.printer.id(), "approve_task")
        .args_json(json!({"task_id": t.to_string()}))
        .gas(tgas(300))
        .transact()
        .await?)?;
    assert!(report("approve_task → mint(1) → cash + reimbursement", &r) < 125);
    assert_eq!(env.task(&env.printer, t).await?["status"], "Rewarded");

    // mint of the largest printer reward (2 rights)
    env.telemetry(&env.printer, json!([["nozzle_seconds", 720_001]]))
        .await?;
    let t = env
        .submitted_task(&env.printer, "nozzle_clean", &env.bob, None)
        .await?;
    env.pass_test(&env.printer, t).await?;
    let r = ok(env
        .verifier
        .call(env.printer.id(), "approve_task")
        .args_json(json!({"task_id": t.to_string()}))
        .gas(tgas(300))
        .transact()
        .await?)?;
    assert!(report("approve_task → mint(2)", &r) < 125);

    // escalate → add_proposal (bond) → on_escalation_submitted
    ok(env
        .call(&env.bob, &env.printer, "refresh_dao_policy", json!({}))
        .await?)
    .map(|r| report("refresh_dao_policy → get_policy → on_dao_policy", &r))?;
    let r = ok(env
        .agent
        .call(env.printer.id(), "escalate")
        .args_json(
            json!({"kind": "purchase", "receiver": env.carol.id(), "amount": N.to_string(),
                          "reason": "replacement hotend", "task_id": null}),
        )
        .gas(tgas(300))
        .transact()
        .await?)?;
    assert!(report("escalate → add_proposal → on_escalation_submitted", &r) < 80);
    let e = r.json::<Value>()?;
    let r = ok(env
        .call(
            &env.bob,
            &env.printer,
            "sync_escalation",
            json!({"escalation_id": e}),
        )
        .await?)?;
    report("sync_escalation → get_proposal → on_escalation_synced", &r);

    // set_roles pushed to 3 active assets inside a DAO proposal execution
    let (_, vote) = env
        .propose_and_pass(
            env.commons.id(),
            vec![action(
                "set_roles",
                json!({"account": env.carol.id(), "roles": ["steward"]}),
                0,
                100,
            )],
            "role push",
        )
        .await?;
    assert!(report("vote executing set_roles → sync_roles × 3 assets", &vote) < 150);

    // cancel with a right: refund op + release_right op
    let (_, ids) = {
        let task = env.task(&env.printer, t).await?;
        (t, task["minted_right_ids"].clone())
    };
    let right = ids[0].as_str().unwrap().to_string();
    let s2 = env.now_slot(&env.printer).await? + 6;
    ok(env
        .reserve(&env.printer, &env.bob, s2, 1, Some(&right))
        .await?)?;
    let res = env
        .view(
            &env.printer,
            "get_reservations_by_holder",
            json!({"account": env.bob.id()}),
        )
        .await?;
    let rid = res.as_array().unwrap().last().unwrap()["id"].clone();
    let r = ok(env
        .call(
            &env.bob,
            &env.printer,
            "cancel_reservation",
            json!({"id": rid}),
        )
        .await?)?;
    assert!(report("cancel_reservation (refund + release_right)", &r) < 80);
    Ok(())
}
