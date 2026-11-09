//! register_asset, deactivate_asset, set_roles, resync_roles, on_roles_synced, fund_storage, new.

use super::*;
use commonkit_types::asset_iface::SyncRolesArgs;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::get_created_receipts;
use near_sdk::{test_vm_config, Gas, PromiseResult, RuntimeFeesConfig};

fn callback_ctx(pred: &AccountId, result: PromiseResult) {
    testing_env!(
        builder(pred, T0).build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        vec![result],
    );
}

/// `(receiver, args)` of every `sync_roles` call scheduled in the current context.
fn sync_pushes() -> Vec<(AccountId, SyncRolesArgs)> {
    get_created_receipts()
        .into_iter()
        .flat_map(|r| {
            let receiver = r.receiver_id.clone();
            r.actions.into_iter().filter_map(move |a| match a {
                MockAction::FunctionCallWeight {
                    method_name, args, ..
                } if method_name == b"sync_roles" => Some((
                    receiver.clone(),
                    near_sdk::serde_json::from_slice(&args).unwrap(),
                )),
                _ => None,
            })
        })
        .collect()
}

#[test]
fn new_sets_wiring() {
    let c = setup();
    let w = c.get_wiring();
    assert_eq!(w.dao_id, dao());
    assert_eq!(w.name, "Makerlab");
    assert_eq!(w.roles_version, U64(0));
    assert_eq!(w.total_supply, U64(0));
    assert_eq!(c.nft_metadata(), metadata());
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn new_rejects_bad_metadata_spec() {
    ctx(&dao());
    let mut m = metadata();
    m.spec = "erc721".into();
    CommonsContract::new(dao(), "Makerlab".into(), m);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn new_rejects_empty_name() {
    ctx(&dao());
    CommonsContract::new(dao(), " ".into(), metadata());
}

#[test]
fn register_asset_adds_to_group_and_pushes_full_snapshot() {
    let mut c = setup();
    c.set_roles(alice(), vec!["steward".into()]);
    ctx(&dao());
    c.register_asset(printer(), "makerlab-fab".into());
    let entry = c.get_asset(printer()).unwrap();
    assert!(entry.active);
    assert_eq!(entry.group_id, "makerlab-fab");
    assert_eq!(entry.registered_at, U64(T0));
    assert_eq!(c.get_group("makerlab-fab".into()), vec![printer()]);
    let ev = events("asset_registered");
    assert_eq!(ev.len(), 1);
    assert_eq!(ev[0]["asset_id"], printer().to_string());
    assert_eq!(ev[0]["reactivated"], false);
    let pushes = sync_pushes();
    assert_eq!(pushes.len(), 1);
    assert_eq!(pushes[0].0, printer());
    assert_eq!(pushes[0].1.version, U64(1));
    assert_eq!(
        pushes[0].1.updates,
        vec![(alice(), vec!["steward".to_string()])]
    );
}

#[test]
#[should_panic(expected = "E_NOT_DAO")]
fn register_asset_requires_dao() {
    let mut c = setup();
    ctx(&alice());
    c.register_asset(printer(), "makerlab-fab".into());
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS")]
fn register_asset_rejects_bad_group_id() {
    let mut c = setup();
    c.register_asset(printer(), "Makerlab Fab".into());
}

#[test]
fn register_asset_moves_group_and_reactivates() {
    let mut c = setup_full();
    let right = mint(&mut c, &printer(), &alice(), 1, 1)[0].clone();
    ctx(&dao());
    c.deactivate_asset(printer());
    ctx_at(&dao(), T0 + 5);
    c.register_asset(printer(), "makerlab-wash".into());
    let entry = c.get_asset(printer()).unwrap();
    assert!(entry.active);
    assert_eq!(entry.group_id, "makerlab-wash");
    assert_eq!(entry.registered_at, U64(T0), "first registration time kept");
    assert_eq!(c.get_group("makerlab-fab".into()), vec![laser()]);
    assert_eq!(
        c.get_group("makerlab-wash".into()),
        vec![washer(), printer()]
    );
    let ev = events("asset_registered");
    assert_eq!(ev[0]["previous_group_id"], "makerlab-fab");
    assert_eq!(ev[0]["reactivated"], true);
    // The issued right keeps its group and status.
    match &c.tokens.get(&right).unwrap().kind {
        CardKind::UsageRight {
            group_id, status, ..
        } => {
            assert_eq!(group_id, "makerlab-fab");
            assert_eq!(*status, RightStatus::Active);
        }
        _ => panic!(),
    }
}

#[test]
fn deactivate_asset_marks_inactive() {
    let mut c = setup_full();
    ctx(&dao());
    c.deactivate_asset(laser());
    assert!(!c.get_asset(laser()).unwrap().active);
    let ev = events("asset_deactivated");
    assert_eq!(ev[0]["asset_id"], laser().to_string());
    assert_eq!(ev[0]["group_id"], "makerlab-fab");
}

#[test]
#[should_panic(expected = "E_NOT_DAO")]
fn deactivate_asset_requires_dao() {
    let mut c = setup_full();
    ctx(&acc("council.testnet"));
    c.deactivate_asset(laser());
}

#[test]
#[should_panic(expected = "E_ASSET_NOT_REGISTERED")]
fn deactivate_asset_unknown() {
    let mut c = setup();
    c.deactivate_asset(laser());
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn deactivate_asset_twice() {
    let mut c = setup_full();
    ctx(&dao());
    c.deactivate_asset(laser());
    c.deactivate_asset(laser());
}

#[test]
fn set_roles_bumps_version_and_pushes_to_active_assets_only() {
    let mut c = setup_full();
    ctx(&dao());
    c.deactivate_asset(washer());
    let before = c.get_wiring().roles_version.0;
    c.set_roles(
        alice(),
        vec!["steward".into(), "verifier".into(), "steward".into()],
    );
    assert_eq!(c.get_roles(alice()), vec!["steward", "verifier"]);
    assert_eq!(c.get_wiring().roles_version.0, before + 1);
    let ev = events("roles_set");
    assert_eq!(ev[0]["account_id"], alice().to_string());
    assert_eq!(ev[0]["roles_version"], (before + 1).to_string());
    let pushes = sync_pushes();
    let receivers: Vec<AccountId> = pushes.iter().map(|p| p.0.clone()).collect();
    assert_eq!(receivers, vec![printer(), laser()]);
    // Full snapshot: trainer, verifier, council, alice.
    assert_eq!(pushes[0].1.updates.len(), 4);
    assert_eq!(pushes[0].1.version, U64(before + 1));
}

#[test]
fn set_roles_empty_keeps_tombstone_in_snapshot() {
    let mut c = setup_full();
    ctx(&dao());
    c.set_roles(trainer(), vec![]);
    assert!(c.get_roles(trainer()).is_empty());
    assert!(!c.has_role(&trainer(), ROLE_TRAINER));
    let snapshot = c.role_snapshot();
    assert!(snapshot.updates.contains(&(trainer(), vec![])));
    let ev = events("roles_set");
    assert_eq!(ev[0]["previous_roles"][0], "trainer");
}

#[test]
#[should_panic(expected = "E_NOT_DAO")]
fn set_roles_requires_dao() {
    let mut c = setup();
    ctx(&alice());
    c.set_roles(alice(), vec!["council".into()]);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS: unknown role")]
fn set_roles_rejects_unknown_role() {
    let mut c = setup();
    c.set_roles(alice(), vec!["admin".into()]);
}

#[test]
#[should_panic(expected = "E_BAD_STATE: role registry is full")]
fn set_roles_caps_role_accounts() {
    let mut c = setup();
    for i in 0..=MAX_ROLE_ACCOUNTS {
        ctx(&dao());
        c.set_roles(acc(&format!("m{i}.testnet")), vec!["steward".into()]);
    }
}

#[test]
fn resync_roles_anyone_pushes_current_snapshot() {
    let mut c = setup_full();
    ctx(&bob());
    c.resync_roles(laser());
    let pushes = sync_pushes();
    assert_eq!(pushes.len(), 1);
    assert_eq!(pushes[0].0, laser());
    assert_eq!(pushes[0].1, c.role_snapshot());
}

#[test]
#[should_panic(expected = "E_ASSET_NOT_REGISTERED")]
fn resync_roles_unknown_asset() {
    let mut c = setup_full();
    ctx(&bob());
    c.resync_roles(acc("other.testnet"));
}

#[test]
#[should_panic(expected = "E_ASSET_NOT_REGISTERED")]
fn resync_roles_inactive_asset() {
    let mut c = setup_full();
    ctx(&dao());
    c.deactivate_asset(laser());
    c.resync_roles(laser());
}

#[test]
fn push_without_gas_emits_role_sync_failed() {
    let mut c = setup_full();
    testing_env!(builder(&dao(), T0).prepaid_gas(Gas::from_tgas(30)).build());
    c.set_roles(alice(), vec!["steward".into()]);
    // 30 Tgas covers at most one push (25 + 10 reserve is not available even once).
    let failed = events("role_sync_failed");
    assert_eq!(failed.len() + sync_pushes().len(), 3);
    assert!(!failed.is_empty());
    assert_eq!(failed[0]["reason"], "insufficient_gas");
}

#[test]
fn on_roles_synced_failure_emits_event() {
    let mut c = setup_full();
    callback_ctx(&commons_id(), PromiseResult::Failed);
    assert!(!c.on_roles_synced(laser(), U64(3)));
    let ev = events("role_sync_failed");
    assert_eq!(ev[0]["asset_id"], laser().to_string());
    assert_eq!(ev[0]["roles_version"], "3");
    assert_eq!(ev[0]["reason"], "promise_failed");
}

#[test]
fn on_roles_synced_success_is_silent() {
    let mut c = setup_full();
    callback_ctx(&commons_id(), PromiseResult::Successful(b"true".to_vec()));
    assert!(c.on_roles_synced(laser(), U64(3)));
    assert!(events("role_sync_failed").is_empty());
}

#[test]
fn fund_storage_accepts_deposit() {
    let mut c = setup();
    ctx_deposit(&dao(), 5);
    c.fund_storage();
    let ev = events("storage_funded");
    assert_eq!(ev[0]["amount"], "5");
}

#[test]
#[should_panic(expected = "E_WRONG_AMOUNT")]
fn fund_storage_requires_deposit() {
    let mut c = setup();
    c.fund_storage();
}
