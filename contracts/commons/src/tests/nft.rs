//! NEP-171/177/181 surface and non-transferability.

use super::*;
use near_sdk::base64::Engine;
use near_sdk::json_types::U128;

fn decode_svg(media: &str) -> String {
    let b64 = media
        .strip_prefix("data:image/svg+xml;base64,")
        .expect("svg data uri");
    String::from_utf8(
        near_sdk::base64::engine::general_purpose::STANDARD
            .decode(b64)
            .unwrap(),
    )
    .unwrap()
}

#[test]
#[should_panic(expected = "E_NON_TRANSFERABLE")]
fn inv_non_transferable_nft_transfer() {
    let mut c = setup_full();
    mint(&mut c, &printer(), &alice(), 1, 1);
    ctx_deposit(&alice(), 1);
    c.nft_transfer();
}

#[test]
#[should_panic(expected = "E_NON_TRANSFERABLE")]
fn inv_non_transferable_nft_transfer_call() {
    let mut c = setup_full();
    mint(&mut c, &printer(), &alice(), 1, 1);
    ctx_deposit(&alice(), 1);
    c.nft_transfer_call();
}

#[test]
#[should_panic(expected = "E_NON_TRANSFERABLE")]
fn inv_non_transferable_nft_approve() {
    let mut c = setup_full();
    mint(&mut c, &printer(), &alice(), 1, 1);
    ctx_deposit(&alice(), 1);
    c.nft_approve();
}

#[test]
#[should_panic(expected = "E_NON_TRANSFERABLE")]
fn nft_revoke_refused() {
    let mut c = setup_full();
    ctx(&dao());
    c.nft_revoke();
}

#[test]
#[should_panic(expected = "E_NON_TRANSFERABLE")]
fn nft_revoke_all_refused() {
    let mut c = setup_full();
    ctx(&dao());
    c.nft_revoke_all();
}

#[test]
fn nft_is_approved_always_false() {
    let mut c = setup_full();
    let id = mint(&mut c, &printer(), &alice(), 1, 1)[0].clone();
    assert!(!c.nft_is_approved(id, bob(), None));
}

#[test]
fn nft_token_usage_right_metadata() {
    let mut c = setup_full();
    let id = mint(&mut c, &printer(), &alice(), 3, 1)[0].clone();
    let t = c.nft_token(id.clone()).unwrap();
    assert_eq!(t.token_id, id);
    assert_eq!(t.owner_id, alice());
    assert!(t.approved_account_ids.is_empty());
    let m = t.metadata.unwrap();
    assert_eq!(m.title.as_deref(), Some("Makerlab · makerlab-fab access"));
    let desc = m.description.unwrap();
    assert!(desc.contains("maintenance task #3 on printer.makerlab.testnet"));
    assert!(desc.contains("up to 2 slot(s)"));
    assert_eq!(m.issued_at, Some((T0 / 1_000_000).to_string()));
    assert_eq!(
        m.expires_at,
        Some(((T0 + 30 * DAY_NS) / 1_000_000).to_string())
    );
    assert_eq!(m.copies, Some(1));
    let extra: near_sdk::serde_json::Value =
        near_sdk::serde_json::from_str(&m.extra.unwrap()).unwrap();
    assert_eq!(extra["kind"], "usage_right");
    assert_eq!(extra["status"]["state"], "Active");
    assert_eq!(extra["expired"], false);
    let media = m.media.unwrap();
    assert!(media.len() < 2048, "inline media stays small");
    let svg = decode_svg(&media);
    assert!(svg.starts_with("<svg"));
    assert!(svg.contains("ACTIVE"));
}

#[test]
fn nft_token_status_follows_lifecycle() {
    let mut c = setup_full();
    let id = mint(&mut c, &printer(), &alice(), 1, 1)[0].clone();
    ctx(&printer());
    assert!(
        c.authorize_reservation(alice(), printer(), None, Some(id.clone()), U64(2), 1)
            .ok
    );
    let svg = decode_svg(
        &c.nft_token(id.clone())
            .unwrap()
            .metadata
            .unwrap()
            .media
            .unwrap(),
    );
    assert!(svg.contains("LOCKED"));
    c.finalize_right(id.clone(), U64(2));
    let m = c.nft_token(id).unwrap().metadata.unwrap();
    assert!(decode_svg(m.media.as_ref().unwrap()).contains("USED"));
    assert!(m.extra.unwrap().contains("Consumed"));
}

#[test]
fn nft_token_credential_metadata() {
    let mut c = setup_full();
    let cred = grant_credential(&mut c, &alice());
    let m = c.nft_token(cred.clone()).unwrap().metadata.unwrap();
    assert_eq!(m.title.as_deref(), Some("Laser safety credential"));
    assert!(m.description.unwrap().contains("training #1"));
    assert!(decode_svg(m.media.as_ref().unwrap()).contains("VALID"));
    ctx(&dao());
    c.suspend_credential(cred.clone(), "x".into());
    let m = c.nft_token(cred.clone()).unwrap().metadata.unwrap();
    assert!(decode_svg(m.media.as_ref().unwrap()).contains("SUSPENDED"));
    assert!(m.extra.unwrap().contains("\"suspended\":true"));
    ctx_at(&alice(), T0 + 366 * DAY_NS);
    let m = c.nft_token(cred).unwrap().metadata.unwrap();
    assert!(m.extra.unwrap().contains("\"expired\":true"));
}

#[test]
fn nft_token_unknown_is_none() {
    let c = setup_full();
    assert!(c.nft_token("right-1".into()).is_none());
}

#[test]
fn nft_enumeration() {
    let mut c = setup_full();
    mint(&mut c, &printer(), &alice(), 1, 3);
    mint(&mut c, &laser(), &bob(), 1, 2);
    assert_eq!(c.nft_total_supply(), U128(5));
    let all = c.nft_tokens(None, None);
    assert_eq!(all.len(), 5);
    let page = c.nft_tokens(Some(U128(3)), Some(1));
    assert_eq!(page[0].token_id, "right-4");
    assert!(c.nft_tokens(Some(U128(10)), None).is_empty());
    assert_eq!(c.nft_supply_for_owner(alice()), U128(3));
    assert_eq!(c.nft_supply_for_owner(acc("nobody.testnet")), U128(0));
    let bobs = c.nft_tokens_for_owner(bob(), None, None);
    assert_eq!(
        bobs.iter().map(|t| t.token_id.as_str()).collect::<Vec<_>>(),
        vec!["right-4", "right-5"]
    );
    let page = c.nft_tokens_for_owner(alice(), Some(U128(1)), Some(1));
    assert_eq!(page.len(), 1);
    assert_eq!(page[0].token_id, "right-2");
    assert!(c
        .nft_tokens_for_owner(acc("nobody.testnet"), None, None)
        .is_empty());
}

#[test]
fn nft_metadata_view() {
    let c = setup();
    assert_eq!(c.nft_metadata().spec, "nft-1.0.0");
    assert_eq!(c.nft_metadata().symbol, "MKLAB");
}

#[test]
fn humanize_and_svg_escape() {
    assert_eq!(crate::nft::humanize("laser_safety"), "Laser safety");
    assert_eq!(crate::nft::humanize("cnc-router"), "Cnc router");
    let uri = crate::nft::svg_data_uri("a<b & 'c'", "x", "ok", "#000");
    let svg = decode_svg(&uri);
    assert!(svg.contains("a&lt;b &amp; &apos;c&apos;"));
    let long = crate::nft::svg_data_uri(&"x".repeat(100), "y", "ok", "#000");
    assert!(decode_svg(&long).contains('…'));
}
