//! D-211: `#[private]` callbacks refuse every external caller (only the contract itself).
#![allow(unused_must_use)]

mod common;

use anyhow::Result;
use common::*;
use serde_json::json;

#[tokio::test]
async fn private_callbacks_reject_external_callers() -> Result<()> {
    let env = Env::new().await?;
    let asset_callbacks = [
        ("on_authorized", json!({"reservation_id": "0"})),
        ("on_op_result", json!({"op_id": "0"})),
        ("on_rights_minted", json!({"task_id": "0"})),
        ("on_escalation_submitted", json!({"escalation_id": "0"})),
        ("on_escalation_synced", json!({"escalation_id": "0"})),
        ("on_dao_policy", json!({})),
    ];
    for caller in [
        &env.alice,
        &env.bridge,
        &env.agent,
        env.dao.as_account(),
        env.commons.as_account(),
    ] {
        for (method, args) in &asset_callbacks {
            let r = caller
                .call(env.printer.id(), method)
                .args_json(args.clone())
                .gas(tgas(100))
                .transact()
                .await?;
            fails_with(&r, &format!("Method {method} is private"));
        }
    }
    let r = env
        .alice
        .call(env.commons.id(), "on_roles_synced")
        .args_json(json!({"asset_id": env.printer.id(), "version": "1"}))
        .transact()
        .await?;
    fails_with(&r, "Method on_roles_synced is private");
    Ok(())
}
