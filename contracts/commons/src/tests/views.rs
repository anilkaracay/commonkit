//! Views (CONTRACT_SPEC §5.2).

use super::*;

#[test]
fn version_and_wiring() {
    let mut c = setup_full();
    mint(&mut c, &printer(), &alice(), 1, 2);
    assert_eq!(c.version(), CONTRACT_VERSION);
    let w = c.get_wiring();
    assert_eq!(w.roles_version, U64(3));
    assert_eq!(w.next_token_seq, U64(3));
    assert_eq!(w.total_supply, U64(2));
    assert_eq!(w.next_training_id, U64(1));
    assert_eq!(w.version, CONTRACT_VERSION);
}

#[test]
fn get_assets_and_groups() {
    let c = setup_full();
    let all = c.get_assets(None, None);
    assert_eq!(all.len(), 3);
    assert_eq!(all[0].asset_id, printer());
    assert_eq!(all[2].entry.group_id, "makerlab-wash");
    let page = c.get_assets(Some(1), Some(1));
    assert_eq!(page.len(), 1);
    assert_eq!(page[0].asset_id, laser());
    assert_eq!(c.get_group("makerlab-fab".into()), vec![printer(), laser()]);
    assert!(c.get_group("unknown".into()).is_empty());
    assert_eq!(c.get_groups(), vec!["makerlab-fab", "makerlab-wash"]);
    assert!(c.get_asset(alice()).is_none());
}

#[test]
fn get_roles_views() {
    let c = setup_full();
    assert_eq!(c.get_roles(trainer()), vec!["trainer"]);
    assert!(c.get_roles(alice()).is_empty());
    let all = c.get_all_roles(None, None);
    assert_eq!(all.len(), 3);
    assert_eq!(all[1].account_id, verifier());
    assert_eq!(c.get_all_roles(Some(2), Some(5))[0].roles, vec!["council"]);
}

#[test]
fn get_trainings_views() {
    let mut c = setup_full();
    grant_credential(&mut c, &alice());
    grant_credential(&mut c, &bob());
    let all = c.get_trainings(None, None);
    assert_eq!(all.len(), 2);
    assert_eq!(all[1].trainee, bob());
    assert_eq!(c.get_trainings(Some(1), Some(1)).len(), 1);
    assert!(c.get_training(U64(3)).is_none());
}

#[test]
fn has_credential_and_cards_for_owner() {
    let mut c = setup_full();
    assert!(!c.has_credential(alice(), "laser_safety".into()));
    let cred = grant_credential(&mut c, &alice());
    let right = mint(&mut c, &printer(), &alice(), 1, 1)[0].clone();
    assert!(c.has_credential(alice(), "laser_safety".into()));
    let cards = c.get_cards_for_owner(alice());
    assert_eq!(cards.len(), 2);
    assert_eq!(cards[0].card.token_id, cred);
    assert_eq!(cards[1].card.token_id, right);
    assert!(!cards[1].expired);
    ctx_at(&alice(), T0 + 31 * DAY_NS);
    let cards = c.get_cards_for_owner(alice());
    assert!(cards[1].expired);
    assert!(!cards[0].expired);
    assert!(c.get_card(right).unwrap().expired);
    assert!(c.get_cards_for_owner(bob()).is_empty());
    // JSON shape: card fields are flattened next to `expired`.
    let v = near_sdk::serde_json::to_value(&cards[1]).unwrap();
    assert_eq!(v["token_id"], "right-3");
    assert_eq!(v["kind"]["type"], "UsageRight");
    assert_eq!(v["kind"]["status"]["state"], "Active");
    assert_eq!(v["expired"], true);
}

#[test]
fn get_mint_receipt_view() {
    let mut c = setup_full();
    assert!(c.get_mint_receipt(format!("{}:1", printer())).is_none());
    let ids = mint(&mut c, &printer(), &alice(), 1, 1);
    assert_eq!(c.get_mint_receipt(format!("{}:1", printer())), Some(ids));
}
