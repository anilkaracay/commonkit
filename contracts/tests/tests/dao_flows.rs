//! Real Sputnik DAO v2 flows: FunctionCall governance (C9), escalations with bond and sync
//! (D-102/D-210/D-213), reimbursement escalations.
#![allow(unused_must_use)]

mod common;

use anyhow::Result;
use common::*;
use near_workspaces::Contract;
use serde_json::{json, Value};

#[tokio::test]
async fn governance_function_call_executes_with_dao_as_predecessor() -> Result<()> {
    let env = Env::new().await?;
    // a council member calling directly is not the DAO (signer of the proposal vote is the
    // last voter, but only predecessor == DAO counts, D-104)
    let r = env
        .call(
            &env.council[0],
            &env.printer,
            "set_operators",
            json!({"bridge_id": null, "agent_id": null}),
        )
        .await?;
    fails_with(&r, "E_NOT_DAO");
    let mut p = env.view(&env.printer, "get_profile", json!({})).await?;
    p["price_per_slot"] = json!((N / 2).to_string());
    let (_, vote) = env
        .propose_and_pass(
            env.printer.id(),
            vec![action("set_profile", json!({"profile": p}), 0, 30)],
            "price",
        )
        .await?;
    assert_eq!(events(&vote, "profile_updated").len(), 1);
    let w = env.view(&env.printer, "get_wiring", json!({})).await?;
    assert_eq!(w["profile_version"], 2);
    // one vote is not enough (2 of 3, D-103)
    let r = ok(env.council[0]
        .call(env.dao.id(), "add_proposal")
        .args_json(json!({"proposal": {"description": "x", "kind": {"FunctionCall": {
            "receiver_id": env.printer.id(),
            "actions": [action("set_operators", json!({"bridge_id": null, "agent_id": null}), 0, 10)]}}}}))
        .deposit(yocto(BOND))
        .gas(tgas(50))
        .transact()
        .await?)?;
    let id: u64 = r.json()?;
    ok(env.vote(id, 0, "VoteApprove").await?)?;
    assert_eq!(env.proposal(id).await?["status"], "InProgress");
    let w = env.view(&env.printer, "get_wiring", json!({})).await?;
    assert_eq!(w["agent_id"], env.agent.id().as_str());
    Ok(())
}

async fn escalate(
    env: &Env,
    asset: &Contract,
    amount: u128,
    kind: &str,
    task: Option<u64>,
) -> Result<(u64, u64)> {
    let r = ok(env
        .call(
            &env.agent,
            asset,
            "escalate",
            json!({"kind": kind, "receiver": if kind == "reimbursement" { env.alice.id() } else { env.carol.id() },
                   "amount": amount.to_string(), "reason": "needs the treasury",
                   "task_id": task.map(|t| t.to_string())}),
        )
        .await?)?;
    let e = u64_of(&r.json::<Value>()?);
    let esc = env
        .view(asset, "get_escalation", json!({"id": e.to_string()}))
        .await?;
    assert_eq!(esc["status"], "Submitted", "{esc:#}");
    Ok((e, u64_of(&esc["proposal_id"])))
}

/// `sync_escalation`; the `get_proposal` receipt itself fails for a Removed proposal
/// (Sputnik panics `ERR_NO_PROPOSAL`), which the callback handles — only the call must succeed.
async fn sync(env: &Env, asset: &Contract, e: u64) -> Result<Value> {
    let r = env
        .call(
            &env.bob,
            asset,
            "sync_escalation",
            json!({"escalation_id": e.to_string()}),
        )
        .await?;
    assert!(r.is_success(), "{:?}", r.failures());
    env.view(asset, "get_escalation", json!({"id": e.to_string()}))
        .await
}

async fn policy(env: &Env, asset: &Contract) -> Result<()> {
    ok(env
        .call(&env.bob, asset, "refresh_dao_policy", json!({}))
        .await?)?;
    let w = env.view(asset, "get_wiring", json!({})).await?;
    assert_eq!(w["dao_proposal_bond"], BOND.to_string());
    assert_eq!(w["dao_proposal_period"], "604800000000000");
    Ok(())
}

#[tokio::test]
async fn escalation_approved_pays_receiver_and_returns_bond() -> Result<()> {
    let env = Env::new().await?;
    env.fund_float(&env.printer, 3 * N).await?;
    policy(&env, &env.printer).await?;
    let float0 = u128_of(&env.ledger(&env.printer).await?["float_free"]);
    let (e, pid) = escalate(&env, &env.printer, N / 2, "purchase", None).await?;
    let p = env.proposal(pid).await?;
    assert_eq!(
        p["proposer"],
        env.printer.id().as_str(),
        "the asset itself proposed (C8)"
    );
    assert_eq!(p["kind"]["Transfer"]["amount"], (N / 2).to_string());
    assert!(p["description"]
        .as_str()
        .unwrap()
        .starts_with("COMMONKIT escalation "));
    let l = env.ledger(&env.printer).await?;
    assert_eq!(u128_of(&l["bonds_outstanding"]), BOND);
    assert_eq!(u128_of(&l["float_free"]), float0 - BOND);
    env.assert_invariant(&env.printer).await?;
    let carol0 = env.balance(env.carol.id()).await?;
    ok(env.vote(pid, 0, "VoteApprove").await?)?;
    ok(env.vote(pid, 1, "VoteApprove").await?)?;
    assert_eq!(env.balance(env.carol.id()).await? - carol0, N / 2);
    let esc = sync(&env, &env.printer, e).await?;
    assert_eq!(esc["status"], "Approved");
    assert_eq!(esc["bond_settled"], true);
    let l = env.ledger(&env.printer).await?;
    assert_eq!(u128_of(&l["bonds_outstanding"]), 0);
    assert_eq!(u128_of(&l["total_bonds_returned"]), BOND);
    assert_eq!(u128_of(&l["float_free"]), float0);
    env.assert_invariant(&env.printer).await?;
    fails_with(
        &env.call(
            &env.bob,
            &env.printer,
            "sync_escalation",
            json!({"escalation_id": e.to_string()}),
        )
        .await?,
        "E_BAD_STATE",
    );
    Ok(())
}

#[tokio::test]
async fn escalation_rejected_by_vote_returns_bond() -> Result<()> {
    let env = Env::new().await?;
    env.fund_float(&env.printer, 3 * N).await?;
    policy(&env, &env.printer).await?;
    let (e, pid) = escalate(&env, &env.printer, N, "purchase", None).await?;
    ok(env.vote(pid, 0, "VoteReject").await?)?;
    ok(env.vote(pid, 1, "VoteReject").await?)?;
    let esc = sync(&env, &env.printer, e).await?;
    assert_eq!(esc["status"], "Rejected");
    assert_eq!(esc["bond_lost"], false);
    let l = env.ledger(&env.printer).await?;
    assert_eq!(u128_of(&l["float_free"]), 3 * N);
    env.assert_invariant(&env.printer).await
}

#[tokio::test]
async fn escalation_removed_proposal_loses_bond() -> Result<()> {
    let env = Env::new().await?;
    env.fund_float(&env.printer, 3 * N).await?;
    policy(&env, &env.printer).await?;
    let (e, pid) = escalate(&env, &env.printer, N, "other", None).await?;
    ok(env.vote(pid, 0, "VoteRemove").await?)?;
    ok(env.vote(pid, 1, "VoteRemove").await?)?;
    let esc = sync(&env, &env.printer, e).await?;
    assert_eq!(esc["status"], "Rejected");
    assert_eq!(esc["bond_lost"], true);
    assert_eq!(esc["dao_status"], "Removed");
    let l = env.ledger(&env.printer).await?;
    assert_eq!(u128_of(&l["bonds_outstanding"]), 0);
    assert_eq!(u128_of(&l["total_bonds_lost"]), BOND);
    assert_eq!(u128_of(&l["float_free"]), 2 * N);
    env.assert_invariant(&env.printer).await
}

fn big_spool(file: &str, p: &mut Value) {
    if file == "printer_3d" {
        for r in p["rules"].as_array_mut().unwrap() {
            if r["rule_id"] == "filament_spool" {
                r["reimbursable_max"] = json!((2 * N).to_string());
            }
        }
    }
}

async fn reimbursement_needing_dao(env: &Env) -> Result<u64> {
    env.telemetry(&env.printer, json!([["filament_used_mm", 330_001]]))
        .await?;
    let t = env
        .submitted_task(&env.printer, "filament_spool", &env.alice, Some(3 * N / 2))
        .await?;
    ok(env
        .call(
            &env.verifier,
            &env.printer,
            "approve_task",
            json!({"task_id": t.to_string()}),
        )
        .await?)?;
    let task = env.task(&env.printer, t).await?;
    assert_eq!(task["expense_state"], "NeedsEscalation", "{task:#}");
    assert_eq!(task["status"], "Rewarded");
    Ok(t)
}

/// Verifier #4: a reimbursement above `auto_reward_cash_cap` is paid by the DAO, and the
/// proposal's outcome flows back into the task.
#[tokio::test]
async fn reimbursement_escalation_outcome_updates_task() -> Result<()> {
    let env = Env::with(EnvOptions { tweak: big_spool }).await?;
    env.fund_float(&env.printer, 3 * N).await?;
    policy(&env, &env.printer).await?;
    let t = reimbursement_needing_dao(&env).await?;
    // wrong amount is refused
    let r = env
        .call(
            &env.agent,
            &env.printer,
            "escalate",
            json!({"kind": "reimbursement", "receiver": env.alice.id(),
            "amount": N.to_string(), "reason": "x", "task_id": t.to_string()}),
        )
        .await?;
    fails_with(&r, "E_INVALID_ARGS");
    // rejected by vote → Denied
    let (e, pid) = escalate(&env, &env.printer, 3 * N / 2, "reimbursement", Some(t)).await?;
    assert_eq!(
        env.task(&env.printer, t).await?["expense_state"]["Escalated"]["escalation_id"],
        e.to_string()
    );
    ok(env.vote(pid, 0, "VoteReject").await?)?;
    ok(env.vote(pid, 1, "VoteReject").await?)?;
    sync(&env, &env.printer, e).await?;
    assert_eq!(env.task(&env.printer, t).await?["expense_state"], "Denied");

    // a second task: removed → NeedsEscalation again → approved → Paid, paid by the DAO
    env.telemetry(&env.printer, json!([["filament_used_mm", 700_000]]))
        .await?;
    let t2 = env
        .submitted_task(&env.printer, "filament_spool", &env.alice, Some(3 * N / 2))
        .await?;
    ok(env
        .call(
            &env.verifier,
            &env.printer,
            "approve_task",
            json!({"task_id": t2.to_string()}),
        )
        .await?)?;
    let (e2, pid2) = escalate(&env, &env.printer, 3 * N / 2, "reimbursement", Some(t2)).await?;
    ok(env.vote(pid2, 0, "VoteRemove").await?)?;
    ok(env.vote(pid2, 1, "VoteRemove").await?)?;
    sync(&env, &env.printer, e2).await?;
    assert_eq!(
        env.task(&env.printer, t2).await?["expense_state"],
        "NeedsEscalation"
    );
    let (e3, pid3) = escalate(&env, &env.printer, 3 * N / 2, "reimbursement", Some(t2)).await?;
    let alice0 = env.balance(env.alice.id()).await?;
    ok(env.vote(pid3, 0, "VoteApprove").await?)?;
    ok(env.vote(pid3, 1, "VoteApprove").await?)?;
    assert_eq!(env.balance(env.alice.id()).await? - alice0, 3 * N / 2);
    sync(&env, &env.printer, e3).await?;
    assert_eq!(env.task(&env.printer, t2).await?["expense_state"], "Paid");
    let l = env.ledger(&env.printer).await?;
    assert_eq!(
        u128_of(&l["total_reimbursed"]),
        0,
        "never paid from the asset float"
    );
    env.assert_invariant(&env.printer).await
}
