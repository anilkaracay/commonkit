//! Storage measurement for sizing `storage_reserve` (D-217). Prints `STORAGE ...` lines:
//! the deployed baseline (code + empty state), a demo-like run, and per-item growth.
#![allow(unused_must_use)]

mod common;

use anyhow::Result;
use common::*;
use near_workspaces::Contract;
use serde_json::{json, Value};

async fn usage(env: &Env, asset: &Contract) -> Result<u64> {
    Ok(u64_of(&env.ledger(asset).await?["storage_usage"]))
}

/// Confirmed future reservations (no session), `k` of them, by rotating holders.
async fn future_reservations(env: &Env, asset: &Contract, k: u64, offset: u64) -> Result<()> {
    let base = env.now_slot(asset).await? + 10 + offset;
    let who = [&env.alice, &env.bob, &env.carol];
    for i in 0..k {
        ok(env
            .reserve(asset, who[(i % 3) as usize], base + i, 1, None)
            .await?)?;
    }
    Ok(())
}

async fn rejected_reservations(env: &Env, asset: &Contract, k: u64, offset: u64) -> Result<()> {
    let base = env.now_slot(asset).await? + 10 + offset;
    for i in 0..k {
        let amount = env.amount_due(asset, &env.alice, 1, true).await?;
        ok(env
            .alice
            .call(asset.id(), "reserve")
            .args_json(
                json!({"start_slot": (base + i).to_string(), "slots": 1, "right_id": "right-404"}),
            )
            .deposit(yocto(amount))
            .gas(tgas(150))
            .transact()
            .await?)?;
    }
    Ok(())
}

/// Rewarded tasks of a Metric rule (`k` rounds; the counter grows by `step` each round).
async fn rewarded_tasks(
    env: &Env,
    asset: &Contract,
    rule: &str,
    metric: &str,
    step: u64,
    k: u64,
    test: bool,
) -> Result<()> {
    let start = env.view(asset, "get_telemetry", json!({})).await?["metrics"]
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m[0] == metric)
        .map(|m| m[1].as_u64().unwrap())
        .unwrap_or(0);
    for i in 1..=k {
        env.telemetry(asset, json!([[metric, start + i * step + 1]]))
            .await?;
        let t = env.submitted_task(asset, rule, &env.alice, None).await?;
        if test {
            env.pass_test(asset, t).await?;
        }
        ok(env
            .verifier
            .call(asset.id(), "approve_task")
            .args_json(json!({"task_id": t.to_string()}))
            .gas(tgas(200))
            .transact()
            .await?)?;
        assert_eq!(env.task(asset, t).await?["status"], "Rewarded");
    }
    Ok(())
}

async fn escalations(env: &Env, asset: &Contract, k: u64) -> Result<()> {
    for _ in 0..k {
        let r = ok(env
            .agent
            .call(asset.id(), "escalate")
            .args_json(json!({"kind": "purchase", "receiver": env.carol.id(), "amount": (N / 10).to_string(),
                              "reason": "spare part for the asset", "task_id": null}))
            .gas(tgas(100))
            .transact()
            .await?)?;
        let e: Value = r.json()?;
        let esc = env.view(asset, "get_escalation", json!({"id": e})).await?;
        let pid = u64_of(&esc["proposal_id"]);
        ok(env.vote(pid, 0, "VoteApprove").await?)?;
        ok(env.vote(pid, 1, "VoteApprove").await?)?;
        ok(env
            .call(
                &env.bob,
                asset,
                "sync_escalation",
                json!({"escalation_id": e}),
            )
            .await?)?;
    }
    Ok(())
}

fn per(label: &str, before: u64, after: u64, k: u64) -> u64 {
    let each = (after - before).div_ceil(k);
    println!(
        "STORAGE per {label}: {each} bytes (k={k}, total {} bytes)",
        after - before
    );
    each
}

#[tokio::test]
async fn measure_asset_storage_growth() -> Result<()> {
    let env = Env::new().await?;
    for (asset, name) in [(&env.printer, "printer"), (&env.washer, "washer")] {
        let base = usage(&env, asset).await?;
        println!("STORAGE {name} deployed (code + empty state): {base} bytes");
        env.fund_float(asset, 3 * N).await?;
        ok(env
            .call(&env.bob, asset, "refresh_dao_policy", json!({}))
            .await?)?;

        // demo-like run: a session with return, future + rejected bookings, telemetry, a
        // rewarded task, a fault report + repair, an out-of-service period, an escalation
        let a = usage(&env, asset).await?;
        let id = env
            .session(asset, &env.alice, json!([["jobs_total", 1], ["cycles", 1]]))
            .await?;
        ok(env
            .call(
                &env.steward,
                asset,
                "confirm_return",
                json!({"id": id.to_string(), "result": "Clean"}),
            )
            .await?)?;
        let session_bytes = per(
            &format!("{name} full session (reserve+session+return)"),
            a,
            usage(&env, asset).await?,
            1,
        );

        let a = usage(&env, asset).await?;
        future_reservations(&env, asset, 6, 0).await?;
        let res_bytes = per(
            &format!("{name} confirmed reservation"),
            a,
            usage(&env, asset).await?,
            6,
        );

        let a = usage(&env, asset).await?;
        rejected_reservations(&env, asset, 4, 20).await?;
        let rej_bytes = per(
            &format!("{name} rejected reservation"),
            a,
            usage(&env, asset).await?,
            4,
        );

        let a = usage(&env, asset).await?;
        let (rule, metric, step, test) = if name == "printer" {
            ("bed_level", "jobs_total", 50, true)
        } else {
            ("filter_clean", "cycles", 30, true)
        };
        rewarded_tasks(&env, asset, rule, metric, step, 3, test).await?;
        let task_bytes = per(
            &format!("{name} rewarded task"),
            a,
            usage(&env, asset).await?,
            3,
        );

        let a = usage(&env, asset).await?;
        ok(env
            .call(
                &env.alice,
                asset,
                "report_fault",
                json!({"rule_id": null, "note_hash": HASH}),
            )
            .await?)?;
        let fault_bytes = per(
            &format!("{name} fault report"),
            a,
            usage(&env, asset).await?,
            1,
        );

        let a = usage(&env, asset).await?;
        ok(env
            .call(
                &env.steward,
                asset,
                "set_out_of_service",
                json!({"out": true, "reason_hash": HASH}),
            )
            .await?)?;
        ok(env
            .call(
                &env.council[0],
                asset,
                "set_out_of_service",
                json!({"out": false, "reason_hash": HASH}),
            )
            .await?)?;
        let oos_bytes = per(
            &format!("{name} out-of-service period"),
            a,
            usage(&env, asset).await?,
            1,
        );

        let a = usage(&env, asset).await?;
        escalations(&env, asset, 2).await?;
        let esc_bytes = per(
            &format!("{name} escalation (+ bond op)"),
            a,
            usage(&env, asset).await?,
            2,
        );

        let total = usage(&env, asset).await?;
        println!(
            "STORAGE {name} after demo-like run: {total} bytes (+{} over deployed)",
            total - base
        );
        println!(
            "STORAGE {name} SUMMARY base={base} session={session_bytes} reservation={res_bytes} rejected={rej_bytes} task={task_bytes} fault={fault_bytes} oos={oos_bytes} escalation={esc_bytes}"
        );
        env.assert_invariant(asset).await?;
    }
    Ok(())
}
