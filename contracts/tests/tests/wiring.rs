mod common;
use common::*;
use serde_json::json;

#[tokio::test]
async fn env_wires_through_dao_proposals() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let w = env.view(&env.printer, "get_wiring", json!({})).await?;
    assert_eq!(w["bridge_id"], env.bridge.id().as_str());
    assert_eq!(w["agent_id"], env.agent.id().as_str());
    assert_eq!(w["roles_version"], "5");
    let roles = env
        .view(
            &env.washer,
            "get_roles",
            json!({"account": env.council[1].id()}),
        )
        .await?;
    assert_eq!(roles, json!(["council", "verifier"]));
    let p = env.proposal(0).await?;
    assert_eq!(p["status"], "Approved");
    let l = env.ledger(&env.printer).await?;
    println!("printer ledger after deploy: {l:#}");
    Ok(())
}
