//! TEST_PLAN §2 invariant tests (exact names) against a real Sputnik DAO in the sandbox.
#![allow(unused_must_use)]

mod common;

use anyhow::Result;
use common::*;
use near_workspaces::Contract;
use serde_json::{json, Value};

async fn reservation_id(r: near_workspaces::result::ExecutionFinalResult) -> Result<u64> {
    Ok(u64_of(&ok(r)?.json::<Value>()?))
}

/// alice earns the printer's nozzle_clean rights (2 cards in makerlab-fab).
async fn earn_printer_rights(env: &Env) -> Result<(u64, Vec<String>)> {
    env.telemetry(&env.printer, json!([["nozzle_seconds", 720_001]]))
        .await?;
    let t = env
        .submitted_task(&env.printer, "nozzle_clean", &env.alice, None)
        .await?;
    env.pass_test(&env.printer, t).await?;
    ok(env
        .call(
            &env.verifier,
            &env.printer,
            "approve_task",
            json!({"task_id": t.to_string()}),
        )
        .await?)?;
    let task = env.task(&env.printer, t).await?;
    assert_eq!(task["status"], "Rewarded", "{task:#}");
    let ids = task["minted_right_ids"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().to_string())
        .collect();
    Ok((t, ids))
}

/// trainer trains `who` for laser_safety, verifier approves.
async fn give_laser_credential(env: &Env, who: &near_workspaces::Account) -> Result<()> {
    let r = ok(env
        .trainer
        .call(env.commons.id(), "propose_credential")
        .args_json(json!({"trainee": who.id(), "kind": "laser_safety", "notes_hash": null}))
        .transact()
        .await?)?;
    let training: Value = r.json()?;
    ok(env
        .verifier
        .call(env.commons.id(), "approve_credential")
        .args_json(json!({"training_id": training}))
        .max_gas()
        .transact()
        .await?)?;
    Ok(())
}

async fn refresh_policy(env: &Env, asset: &Contract) -> Result<()> {
    ok(env
        .call(&env.alice, asset, "refresh_dao_policy", json!({}))
        .await?)?;
    Ok(())
}

// ---------------------------------------------------------------------------------------------

#[tokio::test]
async fn inv_custody_float_cap_sweeps_excess() -> Result<()> {
    let env = Env::new().await?;
    let dao_before = env.balance(env.dao.id()).await?;
    env.fund_float(&env.printer, 10 * N).await?;
    let l = env.ledger(&env.printer).await?;
    assert_eq!(u128_of(&l["float_free"]), 3 * N, "float capped: {l:#}");
    let swept = u128_of(&l["total_swept"]);
    assert!(swept >= 7 * N, "excess swept: {l:#}");
    assert_eq!(u128_of(&l["pending_out"]), 0);
    // the DAO paid 10 N and got the sweep back (gas noise < 0.01 N)
    let dao_after = env.balance(env.dao.id()).await?;
    let net = dao_before as i128 - 10 * N as i128 + swept as i128;
    assert!(
        (dao_after as i128 - net).abs() < GAS_SLACK as i128,
        "dao {dao_after} vs {net}"
    );
    // a fee arriving at a full float is swept too
    let start = env.now_slot(&env.printer).await? + 2;
    reservation_id(
        env.reserve(&env.printer, &env.alice, start, 1, None)
            .await?,
    )
    .await?;
    let l2 = env.ledger(&env.printer).await?;
    assert_eq!(u128_of(&l2["float_free"]), 3 * N);
    assert_eq!(u128_of(&l2["total_swept"]), swept + N / 4);
    env.assert_invariant(&env.printer).await
}

#[tokio::test]
/// Deposits never fund bonds or cash rewards: with 2 N of deposits held and a short float,
/// neither an escalation bond nor a task's cash reward can be reserved; a large inflow is
/// swept without touching the deposits; once funded, the cash reward is paid from the float.
async fn inv_custody_deposits_never_swept() -> Result<()> {
    let env = Env::with(EnvOptions {
        tweak: bed_level_cash,
    })
    .await?;
    let start = env.now_slot(&env.printer).await? + 2;
    reservation_id(
        env.reserve(&env.printer, &env.alice, start, 1, None)
            .await?,
    )
    .await?;
    let l = env.ledger(&env.printer).await?;
    assert_eq!(u128_of(&l["deposits_held"]), 2 * N);
    assert!(u128_of(&l["float_free"]) < N / 2);
    // a bond can only come from the float
    refresh_policy(&env, &env.printer).await?;
    let r = env
        .call(
            &env.agent,
            &env.printer,
            "escalate",
            json!({"kind": "purchase", "receiver": env.carol.id(),
                   "amount": N.to_string(), "reason": "new nozzle", "task_id": null}),
        )
        .await?;
    fails_with(&r, "E_INSUFFICIENT_FLOAT");
    // a cash reward can only be reserved from the float
    env.telemetry(&env.printer, json!([["jobs_total", 51]]))
        .await?;
    let open = || {
        env.call(
            &env.agent,
            &env.printer,
            "open_upkeep_task",
            json!({"rule_id": "bed_level", "rationale": "50 jobs"}),
        )
    };
    fails_with(&open().await?, "E_INSUFFICIENT_FLOAT");
    let l = env.ledger(&env.printer).await?;
    assert_eq!(u128_of(&l["deposits_held"]), 2 * N);
    assert_eq!(u128_of(&l["rewards_reserved"]), 0);
    // sweeping a large inflow leaves the deposit liability untouched
    env.fund_float(&env.printer, 10 * N).await?;
    let l = env.ledger(&env.printer).await?;
    assert_eq!(u128_of(&l["deposits_held"]), 2 * N);
    assert_eq!(u128_of(&l["float_free"]), 3 * N);
    assert!(u128_of(&l["total_swept"]) >= 7 * N);
    // now the cash reward is reserved and paid from the float
    let t = u64_of(&ok(open().await?)?.json::<Value>()?);
    ok(env
        .call(
            &env.bob,
            &env.printer,
            "claim_task",
            json!({"task_id": t.to_string()}),
        )
        .await?)?;
    ok(env
        .call(
            &env.bob,
            &env.printer,
            "submit_task",
            json!({"task_id": t.to_string(), "evidence_hash": HASH}),
        )
        .await?)?;
    env.pass_test(&env.printer, t).await?;
    ok(env
        .call(
            &env.verifier,
            &env.printer,
            "approve_task",
            json!({"task_id": t.to_string()}),
        )
        .await?)?;
    // 0.5 N is above council_threshold_cash (0.25 N): council approval completes it
    assert_eq!(env.task(&env.printer, t).await?["status"], "Submitted");
    ok(env
        .call(
            &env.council[0],
            &env.printer,
            "council_approve_task",
            json!({"task_id": t.to_string()}),
        )
        .await?)?;
    assert_eq!(env.task(&env.printer, t).await?["status"], "Rewarded");
    let l = env.ledger(&env.printer).await?;
    assert_eq!(u128_of(&l["total_rewards_paid"]), N / 2);
    assert_eq!(u128_of(&l["deposits_held"]), 2 * N);
    assert_eq!(u128_of(&l["float_free"]), 3 * N - N / 2);
    env.assert_invariant(&env.printer).await
}

#[tokio::test]
async fn inv_no_retroactive_revocation() -> Result<()> {
    let env = Env::new().await?;
    let (_, ids) = earn_printer_rights(&env).await?;
    give_laser_credential(&env, &env.alice).await?;
    let cred = env
        .cards(&env.alice)
        .await?
        .into_iter()
        .find(|c| c["kind"]["type"] == "Credential")
        .map(|c| c["token_id"].as_str().unwrap().to_string())
        .unwrap();
    let rights_before: Vec<Value> = env
        .cards(&env.alice)
        .await?
        .into_iter()
        .filter(|c| c["kind"]["type"] == "UsageRight")
        .collect();
    assert_eq!(rights_before.len(), 2);
    let state = |id: &str| {
        let id = id.to_string();
        let env = &env;
        async move {
            let c = env
                .view(&env.commons, "get_card", json!({"token_id": id}))
                .await?;
            anyhow::Ok(c["kind"]["status"]["state"].as_str().unwrap().to_string())
        }
    };

    // 1. The DAO cannot suspend a usage right: the proposal executes and fails.
    let kind = json!({"FunctionCall": {"receiver_id": env.commons.id(), "actions": [
        action("suspend_credential", json!({"token_id": ids[0], "reason": "take it back"}), 0, 20)
    ]}});
    let (pid, vote) = env.propose_kind_and_vote(kind, "revoke attempt").await?;
    assert_eq!(env.proposal(pid).await?["status"], "Failed");
    assert!(
        receipt_failed_with(&vote, "E_NO_REVOCATION"),
        "{:?}",
        vote.receipt_failures()
    );

    // 2. Council members acting directly: no DAO power, no asset power.
    let r = env.council[0]
        .call(env.commons.id(), "suspend_credential")
        .args_json(json!({"token_id": ids[0], "reason": "x"}))
        .transact()
        .await?;
    fails_with(&r, "E_NOT_DAO");
    let r = env.council[0]
        .call(env.commons.id(), "finalize_right")
        .args_json(json!({"token_id": ids[0], "reservation_id": "0"}))
        .transact()
        .await?;
    fails_with(&r, "E_BAD_STATE");
    // releasing an Active right is a harmless no-op for anyone
    let r = env.council[0]
        .call(env.commons.id(), "release_right")
        .args_json(json!({"token_id": ids[0], "reservation_id": "0"}))
        .transact()
        .await?;
    assert!(!ok(r)?.json::<bool>()?);
    assert_eq!(state(&ids[0]).await?, "Active");
    // 3. The asset itself cannot consume an Active right; releasing one is a no-op.
    let r = env
        .printer
        .as_account()
        .call(env.commons.id(), "finalize_right")
        .args_json(json!({"token_id": ids[0], "reservation_id": "0"}))
        .transact()
        .await?;
    fails_with(&r, "E_BAD_STATE");
    // 4. No revoke/burn method exists.
    for m in ["revoke_right", "nft_burn", "burn", "delete_card"] {
        let r = env.council[0]
            .call(env.commons.id(), m)
            .args_json(json!({"token_id": ids[0]}))
            .transact()
            .await?;
        fails_with(&r, "MethodNotFound");
    }

    // 5. Lock ids[0] in a booking, then the DAO changes everything it can around it.
    let s = env.now_slot(&env.printer).await? + 4;
    let rid = reservation_id(
        env.reserve(&env.printer, &env.alice, s, 1, Some(&ids[0]))
            .await?,
    )
    .await?;
    assert_eq!(state(&ids[0]).await?, "Locked");
    env.propose_and_pass(
        env.commons.id(),
        vec![
            action(
                "set_credential_kind",
                json!({"config": {
                "kind": "laser_safety", "title": "Laser safety v2", "validity_days": 1,
                "reward_group": "makerlab-fab", "trainer_reward_rights": 0,
                "right_max_slots": 1, "right_validity_days": 1}}),
                0,
                10,
            ),
            action(
                "suspend_credential",
                json!({"token_id": cred, "reason": "safety review"}),
                0,
                10,
            ),
            action(
                "set_roles",
                json!({"account": env.alice.id(), "roles": []}),
                0,
                100,
            ),
            action(
                "deactivate_asset",
                json!({"asset_id": env.printer.id()}),
                0,
                10,
            ),
        ],
        "change everything",
    )
    .await?;
    let mut p = env.view(&env.printer, "get_profile", json!({})).await?;
    p["right_validity_days"] = json!(1);
    p["right_max_slots"] = json!(1);
    env.set_profile(&env.printer, p).await?;
    assert_eq!(
        state(&ids[0]).await?,
        "Locked",
        "a locked right is not revoked"
    );
    assert_eq!(state(&ids[1]).await?, "Active");

    // 6. A council cancel_task (false alarm) touches no rights.
    let t = u64_of(
        &ok(env
            .call(
                &env.council[0],
                &env.printer,
                "open_upkeep_task",
                json!({"rule_id": "bed_level", "rationale": "manual check", "manual": true}),
            )
            .await?)?
        .json::<Value>()?,
    );
    ok(env
        .call(
            &env.council[0],
            &env.printer,
            "cancel_task",
            json!({"task_id": t.to_string(), "reason": "false alarm"}),
        )
        .await?)?;

    // 7. Out of service: the holder cancels and gets the right back Active (not Consumed).
    ok(env
        .call(
            &env.steward,
            &env.printer,
            "set_out_of_service",
            json!({"out": true, "reason_hash": HASH}),
        )
        .await?)?;
    let r = env
        .call(
            &env.council[0],
            &env.printer,
            "cancel_reservation",
            json!({"id": rid.to_string()}),
        )
        .await?;
    fails_with(&r, "E_UNAUTHORIZED");
    ok(env
        .call(
            &env.alice,
            &env.printer,
            "cancel_reservation",
            json!({"id": rid.to_string()}),
        )
        .await?)?;
    assert_eq!(state(&ids[0]).await?, "Active");

    // 8. Issued cards are unchanged in every field the DAO touched.
    let rights_after: Vec<Value> = env
        .cards(&env.alice)
        .await?
        .into_iter()
        .filter(|c| c["kind"]["type"] == "UsageRight")
        .collect();
    assert_eq!(
        rights_before, rights_after,
        "usage rights unchanged after suspend/roles/profile/kind changes"
    );

    // 9. Back in service and re-registered: the other right still books.
    env.propose_and_pass(
        env.commons.id(),
        vec![action(
            "register_asset",
            json!({"asset_id": env.printer.id(), "group_id": "makerlab-fab"}),
            0,
            45,
        )],
        "re-register",
    )
    .await?;
    ok(env
        .call(
            &env.council[0],
            &env.printer,
            "set_out_of_service",
            json!({"out": false, "reason_hash": HASH}),
        )
        .await?)?;
    let s2 = env.now_slot(&env.printer).await? + 6;
    let rid2 = reservation_id(
        env.reserve(&env.printer, &env.alice, s2, 1, Some(&ids[1]))
            .await?,
    )
    .await?;
    assert_eq!(
        env.reservation(&env.printer, rid2).await?["status"],
        "Confirmed"
    );
    assert_eq!(state(&ids[1]).await?, "Locked");
    Ok(())
}

#[tokio::test]
async fn inv_no_self_verification_task() -> Result<()> {
    let env = Env::new().await?;
    env.fund_float(&env.printer, 2 * N).await?;
    // a reimbursement above council_threshold_cash needs verifier + council
    env.telemetry(
        &env.printer,
        json!([["filament_used_mm", 330_001], ["jobs_total", 51]]),
    )
    .await?;
    let t = env
        .submitted_task(&env.printer, "filament_spool", &env.alice, Some(2 * N / 5))
        .await?;
    let approve = |who| {
        env.call(
            who,
            &env.printer,
            "approve_task",
            json!({"task_id": t.to_string()}),
        )
    };
    fails_with(&approve(&env.agent).await?, "E_SELF_VERIFY");
    fails_with(&approve(&env.bridge).await?, "E_SELF_VERIFY");
    fails_with(&approve(&env.alice).await?, "E_SELF_VERIFY");
    ok(approve(&env.council[1]).await?)?; // as verifier
    let council_approve = |who| {
        env.call(
            who,
            &env.printer,
            "council_approve_task",
            json!({"task_id": t.to_string()}),
        )
    };
    fails_with(&council_approve(&env.council[1]).await?, "E_SELF_VERIFY");
    ok(council_approve(&env.council[0]).await?)?;
    assert_eq!(env.task(&env.printer, t).await?["status"], "Rewarded");
    // a verifier who claimed a task cannot approve it
    let t2 = env
        .submitted_task(&env.printer, "bed_level", &env.verifier, None)
        .await?;
    env.pass_test(&env.printer, t2).await?;
    fails_with(
        &env.call(
            &env.verifier,
            &env.printer,
            "approve_task",
            json!({"task_id": t2.to_string()}),
        )
        .await?,
        "E_SELF_VERIFY",
    );
    Ok(())
}

#[tokio::test]
async fn inv_no_self_verification_training() -> Result<()> {
    let env = Env::new().await?;
    // give trainer and trainee the verifier role so the self-check (not the role check) decides
    env.propose_and_pass(
        env.commons.id(),
        vec![
            action(
                "set_roles",
                json!({"account": env.trainer.id(), "roles": ["trainer", "verifier"]}),
                0,
                100,
            ),
            action(
                "set_roles",
                json!({"account": env.alice.id(), "roles": ["verifier"]}),
                0,
                100,
            ),
        ],
        "roles",
    )
    .await?;
    let r = ok(env
        .trainer
        .call(env.commons.id(), "propose_credential")
        .args_json(json!({"trainee": env.alice.id(), "kind": "laser_safety", "notes_hash": null}))
        .transact()
        .await?)?;
    let training: Value = r.json()?;
    for who in [&env.trainer, &env.alice] {
        let r = who
            .call(env.commons.id(), "approve_credential")
            .args_json(json!({"training_id": training}))
            .max_gas()
            .transact()
            .await?;
        fails_with(&r, "E_SELF_VERIFY");
    }
    let r = env
        .trainer
        .call(env.commons.id(), "propose_credential")
        .args_json(json!({"trainee": env.trainer.id(), "kind": "laser_safety", "notes_hash": null}))
        .transact()
        .await?;
    fails_with(&r, "E_SELF_VERIFY");
    ok(env
        .verifier
        .call(env.commons.id(), "approve_credential")
        .args_json(json!({"training_id": training}))
        .max_gas()
        .transact()
        .await?)?;
    let has: bool = env
        .commons
        .view("has_credential")
        .args_json(json!({"account": env.alice.id(), "kind": "laser_safety"}))
        .await?
        .json()?;
    assert!(has);
    Ok(())
}

/// Mint failure is forced by deactivating the asset in commons (mint_rights then panics
/// `E_ASSET_NOT_REGISTERED`); re-registering it lets `retry_reward` succeed.
#[tokio::test]
/// The ambiguous case: commons minted, the asset never learned it. The first mint attempt
/// fails (asset deactivated, no receipt); after re-registration the rights are minted directly
/// by the asset account ("the success whose result was lost"); `retry_reward` then receives the
/// stored ids from the commons receipt and nothing is minted twice.
async fn inv_exactly_once_reward_retry() -> Result<()> {
    let env = Env::new().await?;
    env.telemetry(&env.printer, json!([["nozzle_seconds", 720_001]]))
        .await?;
    let t = env
        .submitted_task(&env.printer, "nozzle_clean", &env.alice, None)
        .await?;
    env.pass_test(&env.printer, t).await?;
    env.propose_and_pass(
        env.commons.id(),
        vec![action(
            "deactivate_asset",
            json!({"asset_id": env.printer.id()}),
            0,
            10,
        )],
        "deactivate",
    )
    .await?;
    let r = env
        .call(
            &env.verifier,
            &env.printer,
            "approve_task",
            json!({"task_id": t.to_string()}),
        )
        .await?;
    assert!(r.is_success());
    assert!(
        receipt_failed_with(&r, "E_ASSET_NOT_REGISTERED"),
        "{:?}",
        r.receipt_failures()
    );
    let task = env.task(&env.printer, t).await?;
    assert_eq!(
        task["reward_state"]["Failed"]["reason"], "E_MINT_FAILED",
        "{task:#}"
    );
    assert!(env.cards(&env.alice).await?.is_empty());
    env.propose_and_pass(
        env.commons.id(),
        vec![action(
            "register_asset",
            json!({"asset_id": env.printer.id(), "group_id": "makerlab-fab"}),
            0,
            45,
        )],
        "re-register",
    )
    .await?;
    env.assert_invariant(&env.printer).await?;
    // the "lost" success: commons mints for (printer, t) without the asset recording it
    let lost = ok(env
        .printer
        .as_account()
        .call(env.commons.id(), "mint_rights")
        .args_json(json!({"holder": env.alice.id(), "count": 2, "max_slots": 2, "validity_days": 60,
            "source": {"type": "Maintenance", "asset": env.printer.id(), "task_id": t.to_string()}}))
        .max_gas()
        .transact()
        .await?)?;
    let lost_ids: Value = lost.json()?;
    assert_eq!(env.cards(&env.alice).await?.len(), 2);
    // the retry gets exactly those ids back; nothing new is minted
    ok(env
        .call(
            &env.bob,
            &env.printer,
            "retry_reward",
            json!({"task_id": t.to_string()}),
        )
        .await?)?;
    let task = env.task(&env.printer, t).await?;
    assert_eq!(task["status"], "Rewarded");
    assert_eq!(task["minted_right_ids"], lost_ids);
    assert_eq!(env.cards(&env.alice).await?.len(), 2);
    let receipt = env
        .view(
            &env.commons,
            "get_mint_receipt",
            json!({"key": format!("{}:{t}", env.printer.id())}),
        )
        .await?;
    assert_eq!(receipt, lost_ids);
    // a second retry is refused
    fails_with(
        &env.call(
            &env.bob,
            &env.printer,
            "retry_reward",
            json!({"task_id": t.to_string()}),
        )
        .await?,
        "E_ALREADY_REWARDED",
    );
    assert_eq!(env.cards(&env.alice).await?.len(), 2);
    let period = env.view(&env.printer, "get_period", json!({})).await?;
    assert_eq!(period["rights_minted"], 2);
    let rep = env
        .view(
            &env.printer,
            "get_reputation",
            json!({"account": env.alice.id()}),
        )
        .await?;
    assert_eq!(rep["upkeeps"], 1);
    Ok(())
}

/// The holder's account is deleted before the deposit refund, so the refund transfer bounces.
#[tokio::test]
async fn inv_failed_refund_keeps_claim() -> Result<()> {
    let env = Env::new().await?;
    let dave = env
        .root
        .create_subaccount("dave")
        .initial_balance(near(10))
        .transact()
        .await?
        .into_result()?;
    let id = env.session(&env.printer, &dave, json!([])).await?;
    let gone = dave.clone().delete_account(env.root.id()).await?;
    assert!(gone.is_success());
    // the call succeeds; its refund receipt bounces (AccountDoesNotExist)
    let r = env
        .call(
            &env.steward,
            &env.printer,
            "confirm_return",
            json!({"id": id.to_string(), "result": "Clean"}),
        )
        .await?;
    assert!(r.is_success());
    assert!(
        receipt_failed_with(&r, "AccountDoesNotExist"),
        "{:?}",
        r.receipt_failures()
    );
    let created = events(&r, "op_created");
    let op_id = created
        .iter()
        .find(|e| e["kind"] == "Refund")
        .map(|e| e["op_id"].as_str().unwrap().to_string())
        .unwrap();
    let op = env
        .view(&env.printer, "get_op", json!({"id": op_id}))
        .await?;
    assert_eq!(op["status"], "Failed", "{op:#}");
    let l = env.ledger(&env.printer).await?;
    assert_eq!(
        u128_of(&l["deposits_held"]),
        2 * N,
        "claim restored as liability"
    );
    assert_eq!(u128_of(&l["pending_out"]), 0);
    env.assert_invariant(&env.printer).await?;
    // the account comes back; anyone retries; it pays exactly once
    env.root
        .create_subaccount("dave")
        .initial_balance(near(1))
        .transact()
        .await?
        .into_result()?;
    let before = env.balance(dave.id()).await?;
    ok(env
        .call(&env.bob, &env.printer, "retry_op", json!({"op_id": op_id}))
        .await?)?;
    let op = env
        .view(&env.printer, "get_op", json!({"id": op_id}))
        .await?;
    assert_eq!(
        (op["status"].clone(), op["attempts"].clone()),
        (json!("Succeeded"), json!(2))
    );
    assert_eq!(env.balance(dave.id()).await? - before, 2 * N);
    fails_with(
        &env.call(&env.bob, &env.printer, "retry_op", json!({"op_id": op_id}))
            .await?,
        "E_OP_NOT_RETRYABLE",
    );
    let l = env.ledger(&env.printer).await?;
    assert_eq!(u128_of(&l["deposits_held"]), 0);
    assert_eq!(u128_of(&l["total_refunded"]), 2 * N);
    env.assert_invariant(&env.printer).await
}

#[tokio::test]
/// Two overlapping `reserve` txs whose function-call receipts execute in the same block:
/// exactly one wins. Retries with fresh slots until both land in one block (fails otherwise).
async fn inv_no_double_booking_concurrent() -> Result<()> {
    let env = Env::new().await?;
    for attempt in 0..5u64 {
        let start = env.now_slot(&env.printer).await? + 3 + attempt * 4;
        let alice_before = env.balance(env.alice.id()).await?;
        let bob_before = env.balance(env.bob.id()).await?;
        let (a, b) = tokio::join!(
            env.reserve(&env.printer, &env.alice, start, 2, None),
            env.reserve(&env.printer, &env.bob, start + 1, 2, None)
        );
        let (a, b) = (a?, b?);
        let block = |r: &near_workspaces::result::ExecutionFinalResult| {
            r.receipt_outcomes()
                .iter()
                .find(|o| o.executor_id == *env.printer.id())
                .map(|o| o.block_hash)
        };
        let same_block = block(&a).is_some() && block(&a) == block(&b);
        println!("attempt {attempt}: same block = {same_block}");
        assert!(a.is_success() ^ b.is_success(), "exactly one wins");
        let (winner, loser, loser_acc, loser_before) = if a.is_success() {
            (a, b, &env.bob, bob_before)
        } else {
            (b, a, &env.alice, alice_before)
        };
        fails_with(&loser, "E_SLOT_TAKEN");
        let id: Value = winner.json()?;
        let owner = env
            .view(
                &env.printer,
                "get_slot_owner",
                json!({"slot": (start + 1).to_string()}),
            )
            .await?;
        assert_eq!(owner, id);
        let spent = loser_before - env.balance(loser_acc.id()).await?;
        assert!(
            spent < GAS_SLACK,
            "loser's deposit came back; spent {spent}"
        );
        env.assert_invariant(&env.printer).await?;
        if same_block {
            return Ok(());
        }
    }
    anyhow::bail!("the two reserve receipts never executed in the same block")
}

#[tokio::test]
async fn inv_slots_released_on_rejection() -> Result<()> {
    let env = Env::new().await?;
    let start = env.now_slot(&env.laser).await? + 2;
    let id = reservation_id(env.reserve(&env.laser, &env.alice, start, 2, None).await?).await?;
    let r = env.reservation(&env.laser, id).await?;
    assert_eq!(r["status"], "Rejected");
    for s in [start, start + 1] {
        let owner = env
            .view(&env.laser, "get_slot_owner", json!({"slot": s.to_string()}))
            .await?;
        assert!(owner.is_null(), "slot {s} released");
    }
    give_laser_credential(&env, &env.carol).await?;
    let id2 = reservation_id(env.reserve(&env.laser, &env.carol, start, 2, None).await?).await?;
    assert_eq!(
        env.reservation(&env.laser, id2).await?["status"],
        "Confirmed"
    );
    env.assert_invariant(&env.laser).await
}

#[tokio::test]
async fn inv_agent_bounded_rule_not_due() -> Result<()> {
    let env = Env::new().await?;
    env.telemetry(&env.printer, json!([["nozzle_seconds", 719_999]]))
        .await?;
    for (asset, rule) in [
        (&env.printer, "nozzle_clean"),
        (&env.printer, "fault_repair"),
        (&env.laser, "monthly_safety_check"),
    ] {
        let r = env
            .call(
                &env.agent,
                asset,
                "open_upkeep_task",
                json!({"rule_id": rule, "rationale": "please"}),
            )
            .await?;
        fails_with(&r, "E_RULE_NOT_DUE");
    }
    let r = env
        .call(
            &env.agent,
            &env.printer,
            "open_upkeep_task",
            json!({"rule_id": "nozzle_clean", "rationale": "please", "manual": true}),
        )
        .await?;
    fails_with(&r, "E_UNAUTHORIZED");
    Ok(())
}

#[tokio::test]
async fn inv_agent_bounded_quota() -> Result<()> {
    let env = Env::new().await?;
    let mut p = env.view(&env.printer, "get_profile", json!({})).await?;
    p["period_reward_quota"] = json!(2);
    env.set_profile(&env.printer, p).await?;
    env.telemetry(
        &env.printer,
        json!([["nozzle_seconds", 720_001], ["jobs_total", 50]]),
    )
    .await?;
    let open = |rule: &'static str| {
        env.call(
            &env.agent,
            &env.printer,
            "open_upkeep_task",
            json!({"rule_id": rule, "rationale": "due"}),
        )
    };
    ok(open("nozzle_clean").await?)?;
    fails_with(&open("bed_level").await?, "E_QUOTA_EXCEEDED");
    let period = env.view(&env.printer, "get_period", json!({})).await?;
    assert_eq!(period["rights_reserved"], 2);
    Ok(())
}

#[tokio::test]
async fn inv_agent_revoked() -> Result<()> {
    let env = Env::new().await?;
    env.telemetry(&env.printer, json!([["nozzle_seconds", 720_001]]))
        .await?;
    env.propose_and_pass(
        env.printer.id(),
        vec![action(
            "set_operators",
            json!({"bridge_id": env.bridge.id(), "agent_id": null}),
            0,
            10,
        )],
        "revoke agent",
    )
    .await?;
    let r = env
        .call(
            &env.agent,
            &env.printer,
            "open_upkeep_task",
            json!({"rule_id": "nozzle_clean", "rationale": "due"}),
        )
        .await?;
    fails_with(&r, "E_NOT_AGENT");
    let r = env
        .call(
            &env.agent,
            &env.printer,
            "escalate",
            json!({"kind": "purchase", "receiver": env.carol.id(), "amount": N.to_string(),
                   "reason": "x", "task_id": null}),
        )
        .await?;
    fails_with(&r, "E_NOT_AGENT");
    let r = env
        .call(
            &env.agent,
            &env.printer,
            "annotate_task",
            json!({"task_id": "0", "note": "x"}),
        )
        .await?;
    fails_with(&r, "E_NOT_AGENT");
    Ok(())
}

/// A full scenario on every asset; `invariant_ok` is checked after each step.
#[tokio::test]
async fn inv_ledger_balance_covers_obligations() -> Result<()> {
    let env = Env::new().await?;
    let all = [&env.printer, &env.laser, &env.washer];
    let check = || async {
        for a in all {
            env.assert_invariant(a).await?;
        }
        anyhow::Ok(())
    };
    check().await?;
    env.fund_float(&env.printer, 2 * N).await?;
    check().await?;
    let id = env
        .session(
            &env.printer,
            &env.alice,
            json!([["filament_used_mm", 330_001]]),
        )
        .await?;
    check().await?;
    ok(env
        .call(
            &env.steward,
            &env.printer,
            "confirm_return",
            json!({"id": id.to_string(), "result": "Clean"}),
        )
        .await?)?;
    check().await?;
    let t = env
        .submitted_task(&env.printer, "filament_spool", &env.alice, Some(N / 5))
        .await?;
    check().await?;
    ok(env
        .call(
            &env.verifier,
            &env.printer,
            "approve_task",
            json!({"task_id": t.to_string()}),
        )
        .await?)?;
    let task = env.task(&env.printer, t).await?;
    assert_eq!(task["expense_state"], "Paid");
    check().await?;
    // washer: a normal booking (deposit-free profile)
    let w = env.now_slot(&env.washer).await? + 2;
    reservation_id(env.reserve(&env.washer, &env.bob, w, 1, None).await?).await?;
    check().await?;
    // escalation with bond, approved and synced
    refresh_policy(&env, &env.printer).await?;
    let r = ok(env
        .call(
            &env.agent,
            &env.printer,
            "escalate",
            json!({"kind": "purchase", "receiver": env.carol.id(), "amount": (N / 10).to_string(),
                   "reason": "spare nozzle", "task_id": null}),
        )
        .await?)?;
    let e = r.json::<Value>()?;
    check().await?;
    let esc = env
        .view(&env.printer, "get_escalation", json!({"id": e}))
        .await?;
    let pid = u64_of(&esc["proposal_id"]);
    ok(env.vote(pid, 0, "VoteApprove").await?)?;
    ok(env.vote(pid, 1, "VoteApprove").await?)?;
    ok(env
        .call(
            &env.bob,
            &env.printer,
            "sync_escalation",
            json!({"escalation_id": e}),
        )
        .await?)?;
    check().await?;
    ok(env.call(&env.bob, &env.printer, "sweep", json!({})).await?)?;
    check().await
}

#[tokio::test]
async fn inv_rights_group_scope() -> Result<()> {
    let env = Env::new().await?;
    let (_, ids) = earn_printer_rights(&env).await?;
    // washer is in dorm-b-laundry: a makerlab-fab right is refused, the deposit comes back
    let w = env.now_slot(&env.washer).await? + 2;
    let r = ok(env
        .reserve(&env.washer, &env.alice, w, 1, Some(&ids[0]))
        .await?)?;
    let rejected = events(&r, "reservation_rejected")[0].clone();
    assert_eq!(rejected["reason"], "E_RIGHT_WRONG_GROUP");
    let id = u64_of(&r.json::<Value>()?);
    let res = env.reservation(&env.washer, id).await?;
    assert_eq!(res["status"], "Rejected");
    let paid = u128_of(&res["deposit_paid"]);
    let kept = u128_of(&res["storage_cost"]);
    assert_eq!(rejected["refund"], (paid - kept).to_string());
    let op = env
        .view(
            &env.washer,
            "get_op",
            json!({"id": rejected["refund_op_id"]}),
        )
        .await?;
    assert_eq!(op["status"], "Succeeded");
    assert_eq!(op["to"], env.alice.id().as_str());
    let l = env.ledger(&env.washer).await?;
    assert_eq!(u128_of(&l["total_refunded"]), paid - kept);
    let card = env
        .view(&env.commons, "get_card", json!({"token_id": ids[0]}))
        .await?;
    assert_eq!(card["kind"]["status"]["state"], "Active", "{card:#}");
    // the same right works on the printer (same group) and gets locked
    let p = env.now_slot(&env.printer).await? + 2;
    let id = reservation_id(
        env.reserve(&env.printer, &env.alice, p, 1, Some(&ids[0]))
            .await?,
    )
    .await?;
    let r = env.reservation(&env.printer, id).await?;
    assert_eq!(r["status"], "Confirmed");
    assert_eq!(r["fee_paid"], "0");
    let card = env
        .view(&env.commons, "get_card", json!({"token_id": ids[0]}))
        .await?;
    assert_eq!(card["kind"]["status"]["state"], "Locked", "{card:#}");
    env.assert_invariant(&env.washer).await
}

#[tokio::test]
async fn inv_non_transferable() -> Result<()> {
    let env = Env::new().await?;
    let (_, ids) = earn_printer_rights(&env).await?;
    for (method, deposit) in [
        ("nft_transfer", 1),
        ("nft_transfer_call", 1),
        ("nft_approve", 1),
    ] {
        let r = env
            .alice
            .call(env.commons.id(), method)
            .args_json(
                json!({"receiver_id": env.bob.id(), "account_id": env.bob.id(),
                              "token_id": ids[0], "msg": "x"}),
            )
            .deposit(yocto(deposit))
            .transact()
            .await?;
        fails_with(&r, "E_NON_TRANSFERABLE");
    }
    let token = env
        .view(&env.commons, "nft_token", json!({"token_id": ids[0]}))
        .await?;
    assert_eq!(token["owner_id"], env.alice.id().as_str());
    Ok(())
}

#[tokio::test]
async fn inv_credential_required() -> Result<()> {
    let env = Env::new().await?;
    let before = env.balance(env.alice.id()).await?;
    let start = env.now_slot(&env.laser).await? + 2;
    let r = ok(env.reserve(&env.laser, &env.alice, start, 1, None).await?)?;
    assert_eq!(
        events(&r, "reservation_rejected")[0]["reason"],
        "E_CREDENTIAL_MISSING"
    );
    let id = reservation_id(r).await?;
    let res = env.reservation(&env.laser, id).await?;
    assert_eq!(res["status"], "Rejected");
    let spent = before - env.balance(env.alice.id()).await?;
    assert!(
        spent < GAS_SLACK,
        "refunded except gas and storage: spent {spent}"
    );
    let l = env.ledger(&env.laser).await?;
    assert_eq!(u128_of(&l["deposits_held"]), 0);
    let kept = u128_of(&res["storage_cost"]);
    assert_eq!(u128_of(&l["total_refunded"]), N / 10 + 3 * N - kept);
    give_laser_credential(&env, &env.alice).await?;
    let id = reservation_id(env.reserve(&env.laser, &env.alice, start, 1, None).await?).await?;
    assert_eq!(
        env.reservation(&env.laser, id).await?["status"],
        "Confirmed"
    );
    env.assert_invariant(&env.laser).await
}

// ---- D-017 invariants ----

#[tokio::test]
async fn inv_restock_expense_capped_and_not_from_deposits() -> Result<()> {
    let env = Env::with(EnvOptions {
        tweak: spool_up_to_2n,
    })
    .await?;
    // bob's future booking puts 2 N of deposits on the account; the float is ~0.3 N
    let s = env.now_slot(&env.printer).await? + 4;
    reservation_id(env.reserve(&env.printer, &env.bob, s, 1, None).await?).await?;
    env.telemetry(
        &env.printer,
        json!([["filament_used_mm", 330_001], ["nozzle_seconds", 720_001]]),
    )
    .await?;
    let open = |rule: &'static str| {
        env.call(
            &env.agent,
            &env.printer,
            "open_upkeep_task",
            json!({"rule_id": rule, "rationale": "due"}),
        )
    };
    let submit = |t: u64, amount: u128, receipt: Option<&'static str>| {
        env.call(
            &env.alice,
            &env.printer,
            "submit_task",
            json!({"task_id": t.to_string(), "evidence_hash": HASH,
                   "expense": amount.to_string(), "receipt_hash": receipt}),
        )
    };
    // only Restock/Repair tasks may claim an expense
    let tn = u64_of(&ok(open("nozzle_clean").await?)?.json::<Value>()?);
    ok(env
        .call(
            &env.alice,
            &env.printer,
            "claim_task",
            json!({"task_id": tn.to_string()}),
        )
        .await?)?;
    fails_with(
        &submit(tn, N / 10, Some(HASH2)).await?,
        "E_NOT_REIMBURSABLE",
    );
    // a restock expense needs a receipt and stays within reimbursable_max (2 N here)
    let t = u64_of(&ok(open("filament_spool").await?)?.json::<Value>()?);
    ok(env
        .call(
            &env.alice,
            &env.printer,
            "claim_task",
            json!({"task_id": t.to_string()}),
        )
        .await?)?;
    fails_with(&submit(t, N / 10, None).await?, "E_INVALID_ARGS");
    fails_with(&submit(t, 2 * N + 1, Some(HASH2)).await?, "E_EXPENSE_CAP");
    ok(submit(t, 9 * N / 20, Some(HASH2)).await?)?; // 0.45 N: above council threshold and the float
    ok(env
        .call(
            &env.verifier,
            &env.printer,
            "approve_task",
            json!({"task_id": t.to_string()}),
        )
        .await?)?;
    let r = env
        .call(
            &env.council[0],
            &env.printer,
            "council_approve_task",
            json!({"task_id": t.to_string()}),
        )
        .await?;
    fails_with(&r, "E_INSUFFICIENT_FLOAT");
    let l = env.ledger(&env.printer).await?;
    assert_eq!(u128_of(&l["deposits_held"]), 2 * N);
    assert_eq!(u128_of(&l["rewards_reserved"]), 0);
    // once the DAO funds the float, the expense is paid from it — deposits untouched
    env.fund_float(&env.printer, N).await?;
    let alice_before = env.balance(env.alice.id()).await?;
    ok(env
        .call(
            &env.council[0],
            &env.printer,
            "council_approve_task",
            json!({"task_id": t.to_string()}),
        )
        .await?)?;
    assert_eq!(env.task(&env.printer, t).await?["expense_state"], "Paid");
    assert!(env.balance(env.alice.id()).await? + GAS_SLACK > alice_before + 9 * N / 20);
    let l = env.ledger(&env.printer).await?;
    assert_eq!(u128_of(&l["deposits_held"]), 2 * N);
    assert_eq!(u128_of(&l["total_reimbursed"]), 9 * N / 20);
    // exactly one Reimbursement op; retries cannot add another
    let ops = env.view(&env.printer, "get_ops", json!({})).await?;
    let reimb: Vec<&Value> = ops
        .as_array()
        .unwrap()
        .iter()
        .filter(|o| {
            o["kind"] == "Reimbursement"
                && o["ref_id"].as_str().and_then(|r| r.parse::<u64>().ok()) == Some(t)
        })
        .collect();
    assert_eq!(reimb.len(), 1);
    assert_eq!(reimb[0]["status"], "Succeeded");
    fails_with(
        &env.call(
            &env.bob,
            &env.printer,
            "retry_reward",
            json!({"task_id": t.to_string()}),
        )
        .await?,
        "E_ALREADY_REWARDED",
    );
    fails_with(
        &env.call(
            &env.bob,
            &env.printer,
            "retry_op",
            json!({"op_id": reimb[0]["id"]}),
        )
        .await?,
        "E_OP_NOT_RETRYABLE",
    );
    // above auto_reward_cash_cap (0.5 N): only the DAO can pay — nothing leaves the float
    env.telemetry(&env.printer, json!([["filament_used_mm", 700_000]]))
        .await?;
    let float_before = u128_of(&env.ledger(&env.printer).await?["float_free"]);
    let t2 = u64_of(&ok(open("filament_spool").await?)?.json::<Value>()?);
    ok(env
        .call(
            &env.alice,
            &env.printer,
            "claim_task",
            json!({"task_id": t2.to_string()}),
        )
        .await?)?;
    ok(submit(t2, N, Some(HASH2)).await?)?;
    ok(env
        .call(
            &env.verifier,
            &env.printer,
            "approve_task",
            json!({"task_id": t2.to_string()}),
        )
        .await?)?;
    let task = env.task(&env.printer, t2).await?;
    assert_eq!(task["expense_state"], "NeedsEscalation");
    assert_eq!(task["status"], "Rewarded");
    let l = env.ledger(&env.printer).await?;
    assert_eq!(u128_of(&l["float_free"]), float_before);
    assert_eq!(u128_of(&l["total_reimbursed"]), 9 * N / 20);
    env.assert_invariant(&env.printer).await
}

#[tokio::test]
async fn inv_out_of_service_blocks_access_and_refunds() -> Result<()> {
    let env = Env::new().await?;
    let (_, ids) = earn_printer_rights(&env).await?;
    // the current slot (already started: normally neither cancellable nor fee-refundable)
    let slot_ns = env.slot_ns(&env.printer).await?;
    let now = env.now().await?;
    let start = if (now / slot_ns + 1) * slot_ns - now < 120_000_000_000 {
        now / slot_ns + 1
    } else {
        now / slot_ns
    };
    let id = reservation_id(
        env.reserve(&env.printer, &env.alice, start, 2, None)
            .await?,
    )
    .await?;
    let with_right = reservation_id(
        env.reserve(&env.printer, &env.alice, start + 4, 1, Some(&ids[0]))
            .await?,
    )
    .await?;
    let before = env.balance(env.alice.id()).await?;
    ok(env
        .call(
            &env.steward,
            &env.printer,
            "set_out_of_service",
            json!({"out": true, "reason_hash": HASH}),
        )
        .await?)?;
    let s2 = env.now_slot(&env.printer).await? + 6;
    fails_with(
        &env.reserve(&env.printer, &env.bob, s2, 1, None).await?,
        "E_OUT_OF_SERVICE",
    );
    env.advance_to(start * slot_ns + 1).await?;
    let access = env
        .view(
            &env.printer,
            "can_access",
            json!({"account": env.alice.id(), "reservation_id": id.to_string()}),
        )
        .await?;
    assert_eq!(access["ok"], false);
    assert_eq!(access["reason"], "out_of_service");
    fails_with(
        &env.call(
            &env.bridge,
            &env.printer,
            "mark_session_started",
            json!({"id": id.to_string()}),
        )
        .await?,
        "E_OUT_OF_SERVICE",
    );
    // inside the start window, normally too late to get the fee back: full refund anyway
    let r = ok(env
        .call(
            &env.alice,
            &env.printer,
            "cancel_reservation",
            json!({"id": id.to_string()}),
        )
        .await?)?;
    let c = &events(&r, "reservation_cancelled")[0];
    assert_eq!(c["reason"], "out_of_service");
    assert_eq!(c["fee_refunded"], (N / 2).to_string());
    assert_eq!(c["deposit_refunded"], (2 * N).to_string());
    let got = env.balance(env.alice.id()).await? + GAS_SLACK - before;
    assert!(got >= N / 2 + 2 * N, "fee + deposit refunded: {got}");
    // a booking made with a right gives the right back (Active, not consumed)
    ok(env
        .call(
            &env.alice,
            &env.printer,
            "cancel_reservation",
            json!({"id": with_right.to_string()}),
        )
        .await?)?;
    let card = env
        .view(&env.commons, "get_card", json!({"token_id": ids[0]}))
        .await?;
    assert_eq!(card["kind"]["status"]["state"], "Active");
    // only council/DAO or a rewarded Repair restore service; a rewarded non-Repair does not
    fails_with(
        &env.call(
            &env.steward,
            &env.printer,
            "set_out_of_service",
            json!({"out": false, "reason_hash": HASH}),
        )
        .await?,
        "E_MISSING_ROLE",
    );
    env.telemetry(&env.printer, json!([["jobs_total", 51]]))
        .await?;
    let t = env
        .submitted_task(&env.printer, "bed_level", &env.bob, None)
        .await?;
    env.pass_test(&env.printer, t).await?;
    ok(env
        .call(
            &env.verifier,
            &env.printer,
            "approve_task",
            json!({"task_id": t.to_string()}),
        )
        .await?)?;
    assert_eq!(env.task(&env.printer, t).await?["status"], "Rewarded");
    let svc = env
        .view(&env.printer, "get_service_status", json!({}))
        .await?;
    assert_eq!(
        svc["in_service"], false,
        "a non-Repair reward does not restore service"
    );
    let repair = u64_of(&ok(env
        .call(&env.council[0], &env.printer, "open_upkeep_task",
              json!({"rule_id": "fault_repair", "rationale": "laser head misaligned", "manual": true}))
        .await?)?
    .json::<Value>()?);
    ok(env
        .call(
            &env.bob,
            &env.printer,
            "claim_task",
            json!({"task_id": repair.to_string()}),
        )
        .await?)?;
    ok(env
        .call(
            &env.bob,
            &env.printer,
            "submit_task",
            json!({"task_id": repair.to_string(), "evidence_hash": HASH}),
        )
        .await?)?;
    env.pass_test(&env.printer, repair).await?;
    ok(env
        .call(
            &env.verifier,
            &env.printer,
            "approve_task",
            json!({"task_id": repair.to_string()}),
        )
        .await?)?;
    assert_eq!(env.task(&env.printer, repair).await?["status"], "Rewarded");
    let svc = env
        .view(&env.printer, "get_service_status", json!({}))
        .await?;
    assert_eq!(svc["in_service"], true);
    let log = env.view(&env.printer, "get_service_log", json!({})).await?;
    assert_eq!(log[0]["started_by"], env.steward.id().as_str());
    assert_eq!(
        log[0]["ended_by"]["RepairRewarded"]["task_id"],
        repair.to_string()
    );
    env.assert_invariant(&env.printer).await
}

#[tokio::test]
/// The 14-day expiry of fault-report eligibility is covered at unit level only
/// (`service::inv_fault_report_requires_recent_session`): fast-forwarding 14 days is not
/// practical in the sandbox.
async fn inv_fault_report_requires_recent_session() -> Result<()> {
    let env = Env::with(EnvOptions {
        tweak: repair_needs_two_reports,
    })
    .await?;
    let report = |who| {
        env.call(
            who,
            &env.printer,
            "report_fault",
            json!({"rule_id": null, "note_hash": HASH}),
        )
    };
    let open = || {
        env.call(
            &env.agent,
            &env.printer,
            "open_upkeep_task",
            json!({"rule_id": "fault_repair", "rationale": "reported"}),
        )
    };
    fails_with(&report(&env.bob).await?, "E_NO_RECENT_SESSION");
    fails_with(&report(&env.agent).await?, "E_UNAUTHORIZED");
    fails_with(&report(&env.bridge).await?, "E_UNAUTHORIZED");
    fails_with(&open().await?, "E_RULE_NOT_DUE");
    env.session(&env.printer, &env.bob, json!([])).await?;
    ok(report(&env.bob).await?)?;
    fails_with(&report(&env.bob).await?, "E_ALREADY_REPORTED");
    fails_with(&open().await?, "E_RULE_NOT_DUE"); // 1 of 2 distinct reporters
    env.session(&env.printer, &env.carol, json!([])).await?;
    ok(report(&env.carol).await?)?;
    let faults = env.view(&env.printer, "get_faults", json!({})).await?;
    assert_eq!(faults[0]["reports"].as_array().unwrap().len(), 2);
    let t = u64_of(&ok(open().await?)?.json::<Value>()?);
    ok(env
        .call(
            &env.steward,
            &env.printer,
            "claim_task",
            json!({"task_id": t.to_string()}),
        )
        .await?)?;
    ok(env
        .call(
            &env.steward,
            &env.printer,
            "submit_task",
            json!({"task_id": t.to_string(), "evidence_hash": HASH}),
        )
        .await?)?;
    env.pass_test(&env.printer, t).await?;
    ok(env
        .call(
            &env.verifier,
            &env.printer,
            "approve_task",
            json!({"task_id": t.to_string()}),
        )
        .await?)?;
    assert_eq!(env.task(&env.printer, t).await?["status"], "Rewarded");
    let faults = env.view(&env.printer, "get_faults", json!({})).await?;
    assert!(
        faults[0]["reports"].as_array().unwrap().is_empty(),
        "reports cleared on reward"
    );
    let rep = env
        .view(
            &env.printer,
            "get_reputation",
            json!({"account": env.bob.id()}),
        )
        .await?;
    assert_eq!(rep["fault_reports"], 1);
    fails_with(&open().await?, "E_RULE_NOT_DUE");
    Ok(())
}

/// The laser's `monthly_safety_check` (720 h) is shortened to 1 h for the sandbox via
/// `EnvOptions::tweak`, so the test fast-forwards one hour instead of a month.
#[tokio::test]
/// The laser's `monthly_safety_check` (720 h) is shortened to 1 h for the sandbox via
/// `EnvOptions::tweak`, so the test fast-forwards one hour instead of a month.
async fn inv_schedule_rule_due_only_after_interval() -> Result<()> {
    let env = Env::with(EnvOptions {
        tweak: hourly_safety_check,
    })
    .await?;
    // due one interval after `new` (the default baseline)
    let r0 = safety_check_row(&env).await?;
    let created = u64_of(&r0["baseline"]);
    let now = env.now().await?;
    assert!(
        created <= now && now - created < 600_000_000_000,
        "baseline = new() time"
    );
    let due_at = u64_of(&r0["next_due_estimate"]);
    assert_eq!(due_at, created + 3_600_000_000_000);
    assert_eq!(r0["due"], false);
    // a council member may bypass the due check; it is recorded on the task
    let m = u64_of(
        &ok(env
            .call(
                &env.council[0],
                &env.laser,
                "open_upkeep_task",
                json!({"rule_id": "lens_clean", "rationale": "visible residue", "manual": true}),
            )
            .await?)?
        .json::<Value>()?,
    );
    let manual = env.task(&env.laser, m).await?;
    assert_eq!(manual["manual"], true);
    assert_eq!(manual["opened_by"], env.council[0].id().as_str());
    let open = || {
        env.call(
            &env.agent,
            &env.laser,
            "open_upkeep_task",
            json!({"rule_id": "monthly_safety_check", "rationale": "monthly"}),
        )
    };
    fails_with(&open().await?, "E_RULE_NOT_DUE");
    env.advance_to(due_at - 120_000_000_000).await?; // two minutes early
    fails_with(&open().await?, "E_RULE_NOT_DUE");
    env.advance_to(due_at).await?;
    let t = u64_of(&ok(open().await?)?.json::<Value>()?);
    assert_eq!(env.task(&env.laser, t).await?["due_value_at_open"], 1);
    // the reward restarts the interval at reward time
    ok(env
        .call(
            &env.alice,
            &env.laser,
            "claim_task",
            json!({"task_id": t.to_string()}),
        )
        .await?)?;
    ok(env
        .call(
            &env.alice,
            &env.laser,
            "submit_task",
            json!({"task_id": t.to_string(), "evidence_hash": HASH}),
        )
        .await?)?;
    env.pass_test(&env.laser, t).await?;
    let before = env.now().await?;
    ok(env
        .call(
            &env.verifier,
            &env.laser,
            "approve_task",
            json!({"task_id": t.to_string()}),
        )
        .await?)?;
    let after = env.now().await?;
    assert_eq!(env.task(&env.laser, t).await?["status"], "Rewarded");
    let r1 = safety_check_row(&env).await?;
    let baseline = u64_of(&r1["baseline"]);
    assert!(
        baseline >= before && baseline <= after,
        "baseline = reward time"
    );
    assert_eq!(
        u64_of(&r1["next_due_estimate"]),
        baseline + 3_600_000_000_000
    );
    assert_eq!(r1["due"], false);
    fails_with(&open().await?, "E_RULE_NOT_DUE");
    Ok(())
}

// ---- profile tweaks used by single tests (sandbox only) ----

fn set_rule(p: &mut Value, rule: &str, field: &str, value: Value) {
    for r in p["rules"].as_array_mut().unwrap() {
        if r["rule_id"] == rule {
            r[field] = value.clone();
        }
    }
}

/// bed_level pays 0.5 N cash (= auto_reward_cash_cap) so a cash reward can be tested.
fn bed_level_cash(file: &str, p: &mut Value) {
    if file == "printer_3d" {
        set_rule(p, "bed_level", "reward_cash", json!((N / 2).to_string()));
    }
}

/// filament_spool may claim up to 2 N, above auto_reward_cash_cap (0.5 N).
fn spool_up_to_2n(file: &str, p: &mut Value) {
    if file == "printer_3d" {
        set_rule(
            p,
            "filament_spool",
            "reimbursable_max",
            json!((2 * N).to_string()),
        );
    }
}

/// fault_repair needs two distinct reporters.
fn repair_needs_two_reports(file: &str, p: &mut Value) {
    if file == "printer_3d" {
        set_rule(
            p,
            "fault_repair",
            "trigger",
            json!({"Report": {"min_reports": 2}}),
        );
    }
}

/// monthly_safety_check every hour instead of every 720 h (sandbox fast-forward cost).
fn hourly_safety_check(file: &str, p: &mut Value) {
    if file == "laser_cutter" {
        set_rule(
            p,
            "monthly_safety_check",
            "trigger",
            json!({"Schedule": {"every_hours": 1}}),
        );
    }
}

async fn safety_check_row(env: &Env) -> Result<Value> {
    let status = env.view(&env.laser, "get_rule_status", json!({})).await?;
    Ok(status
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["rule_id"] == "monthly_safety_check")
        .unwrap()
        .clone())
}
