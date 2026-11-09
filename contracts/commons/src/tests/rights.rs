//! authorize_reservation, release_right, finalize_right, mint_rights and the rights invariants.

use super::*;
use commonkit_types::commons_iface::AuthResult;

fn authorize(
    c: &mut CommonsContract,
    asset: &AccountId,
    holder: &AccountId,
    credential: Option<&str>,
    right_id: Option<&str>,
    reservation_id: u64,
    slots: u32,
) -> AuthResult {
    ctx(asset);
    c.authorize_reservation(
        holder.clone(),
        asset.clone(),
        credential.map(String::from),
        right_id.map(String::from),
        U64(reservation_id),
        slots,
    )
}

fn assert_denied(r: &AuthResult, code: &str) {
    assert!(!r.ok, "expected denial {code}");
    assert_eq!(r.reason.as_deref(), Some(code));
    assert!(r.locked_right_id.is_none());
}

// ---- authorize_reservation ----

#[test]
fn authorize_without_requirements_ok() {
    let mut c = setup_full();
    let r = authorize(&mut c, &printer(), &alice(), None, None, 1, 3);
    assert_eq!(
        r,
        AuthResult {
            ok: true,
            reason: None,
            credential_token_id: None,
            locked_right_id: None
        }
    );
}

#[test]
#[should_panic(expected = "E_ASSET_NOT_REGISTERED")]
fn authorize_requires_registered_caller() {
    let mut c = setup_full();
    authorize(&mut c, &alice(), &alice(), None, None, 1, 1);
}

#[test]
#[should_panic(expected = "E_UNAUTHORIZED")]
fn authorize_asset_arg_must_be_caller() {
    let mut c = setup_full();
    ctx(&printer());
    c.authorize_reservation(alice(), laser(), None, None, U64(1), 1);
}

#[test]
fn authorize_inactive_asset_denied() {
    let mut c = setup_full();
    ctx(&dao());
    c.deactivate_asset(printer());
    let r = authorize(&mut c, &printer(), &alice(), None, None, 1, 1);
    assert_denied(&r, "E_ASSET_NOT_REGISTERED");
}

#[test]
fn authorize_credential_missing_denied() {
    let mut c = setup_full();
    let r = authorize(&mut c, &laser(), &alice(), Some("laser_safety"), None, 1, 1);
    assert_denied(&r, "E_CREDENTIAL_MISSING");
}

#[test]
fn authorize_credential_held_ok() {
    let mut c = setup_full();
    let cred = grant_credential(&mut c, &alice());
    let r = authorize(&mut c, &laser(), &alice(), Some("laser_safety"), None, 1, 1);
    assert!(r.ok);
    assert_eq!(r.credential_token_id, Some(cred));
}

#[test]
fn authorize_credential_suspended_denied() {
    let mut c = setup_full();
    let cred = grant_credential(&mut c, &alice());
    ctx(&dao());
    c.suspend_credential(cred, "unsafe use reported".into());
    let r = authorize(&mut c, &laser(), &alice(), Some("laser_safety"), None, 1, 1);
    assert_denied(&r, "E_CREDENTIAL_MISSING");
}

#[test]
fn authorize_credential_expired_denied() {
    let mut c = setup_full();
    grant_credential(&mut c, &alice());
    ctx_at(&laser(), T0 + 365 * DAY_NS);
    let r = c.authorize_reservation(
        alice(),
        laser(),
        Some("laser_safety".into()),
        None,
        U64(1),
        1,
    );
    assert_denied(&r, "E_CREDENTIAL_MISSING");
}

#[test]
fn authorize_other_kind_credential_does_not_count() {
    let mut c = setup_full();
    grant_credential(&mut c, &alice());
    let r = authorize(&mut c, &laser(), &alice(), Some("cnc_safety"), None, 1, 1);
    assert_denied(&r, "E_CREDENTIAL_MISSING");
}

#[test]
fn authorize_right_locks_it() {
    let mut c = setup_full();
    let id = mint(&mut c, &printer(), &alice(), 1, 1)[0].clone();
    let r = authorize(&mut c, &laser(), &alice(), None, Some(&id), 7, 2);
    assert!(r.ok);
    assert_eq!(r.locked_right_id.as_deref(), Some(id.as_str()));
    assert_eq!(
        right_status(&c, &id),
        RightStatus::Locked {
            asset: laser(),
            reservation_id: U64(7)
        }
    );
    let ev = events("right_locked");
    assert_eq!(ev[0]["token_id"], id);
    assert_eq!(ev[0]["reservation_id"], "7");
    assert_eq!(ev[0]["asset_id"], laser().to_string());
}

#[test]
fn authorize_right_and_credential_both_required() {
    let mut c = setup_full();
    let id = mint(&mut c, &printer(), &alice(), 1, 1)[0].clone();
    let r = authorize(
        &mut c,
        &laser(),
        &alice(),
        Some("laser_safety"),
        Some(&id),
        1,
        1,
    );
    assert_denied(&r, "E_CREDENTIAL_MISSING");
    assert_eq!(right_status(&c, &id), RightStatus::Active, "nothing locked");
}

#[test]
fn authorize_right_of_other_owner_denied() {
    let mut c = setup_full();
    let id = mint(&mut c, &printer(), &alice(), 1, 1)[0].clone();
    let r = authorize(&mut c, &printer(), &bob(), None, Some(&id), 1, 1);
    assert_denied(&r, "E_UNAUTHORIZED");
    assert_eq!(right_status(&c, &id), RightStatus::Active);
}

#[test]
fn inv_rights_group_scope() {
    let mut c = setup_full();
    let id = mint(&mut c, &printer(), &alice(), 1, 1)[0].clone();
    // washer is in makerlab-wash; the right is for makerlab-fab.
    let r = authorize(&mut c, &washer(), &alice(), None, Some(&id), 1, 1);
    assert_denied(&r, "E_RIGHT_WRONG_GROUP");
    assert_eq!(right_status(&c, &id), RightStatus::Active);
    // Same group, other asset: accepted.
    assert!(authorize(&mut c, &laser(), &alice(), None, Some(&id), 1, 1).ok);
}

#[test]
fn authorize_expired_right_denied() {
    let mut c = setup_full();
    let id = mint(&mut c, &printer(), &alice(), 1, 1)[0].clone();
    ctx_at(&printer(), T0 + 30 * DAY_NS);
    let r = c.authorize_reservation(alice(), printer(), None, Some(id.clone()), U64(1), 1);
    assert_denied(&r, "E_RIGHT_EXPIRED");
    assert_eq!(right_status(&c, &id), RightStatus::Active);
}

#[test]
fn authorize_locked_right_denied() {
    let mut c = setup_full();
    let id = mint(&mut c, &printer(), &alice(), 1, 1)[0].clone();
    assert!(authorize(&mut c, &printer(), &alice(), None, Some(&id), 1, 1).ok);
    let r = authorize(&mut c, &laser(), &alice(), None, Some(&id), 2, 1);
    assert_denied(&r, "E_RIGHT_NOT_ACTIVE");
}

#[test]
fn authorize_consumed_right_denied() {
    let mut c = setup_full();
    let id = mint(&mut c, &printer(), &alice(), 1, 1)[0].clone();
    assert!(authorize(&mut c, &printer(), &alice(), None, Some(&id), 1, 1).ok);
    assert!(c.finalize_right(id.clone(), U64(1)));
    let r = authorize(&mut c, &printer(), &alice(), None, Some(&id), 2, 1);
    assert_denied(&r, "E_RIGHT_NOT_ACTIVE");
}

#[test]
fn authorize_too_many_slots_denied() {
    let mut c = setup_full();
    let id = mint(&mut c, &printer(), &alice(), 1, 1)[0].clone();
    assert_denied(
        &authorize(&mut c, &printer(), &alice(), None, Some(&id), 1, 3),
        "E_TOO_MANY_SLOTS",
    );
    assert_denied(
        &authorize(&mut c, &printer(), &alice(), None, Some(&id), 1, 0),
        "E_TOO_MANY_SLOTS",
    );
    assert_eq!(right_status(&c, &id), RightStatus::Active);
}

#[test]
fn authorize_unknown_or_credential_token_as_right_denied() {
    let mut c = setup_full();
    let cred = grant_credential(&mut c, &alice());
    assert_denied(
        &authorize(&mut c, &printer(), &alice(), None, Some("right-999"), 1, 1),
        "E_RIGHT_NOT_ACTIVE",
    );
    assert_denied(
        &authorize(&mut c, &printer(), &alice(), None, Some(&cred), 1, 1),
        "E_RIGHT_NOT_ACTIVE",
    );
}

// ---- release_right / finalize_right ----

fn locked(c: &mut CommonsContract) -> TokenId {
    let id = mint(c, &printer(), &alice(), 1, 1)[0].clone();
    assert!(authorize(c, &printer(), &alice(), None, Some(&id), 5, 1).ok);
    id
}

#[test]
fn release_right_unlocks() {
    let mut c = setup_full();
    let id = locked(&mut c);
    ctx(&printer());
    assert!(c.release_right(id.clone(), U64(5)));
    assert_eq!(right_status(&c, &id), RightStatus::Active);
    let ev = events("right_released");
    assert_eq!(ev[0]["token_id"], id);
    assert_eq!(ev[0]["reservation_id"], "5");
    // Retry is a no-op.
    assert!(!c.release_right(id.clone(), U64(5)));
    assert_eq!(events("right_released").len(), 1);
    // Usable again.
    assert!(authorize(&mut c, &laser(), &alice(), None, Some(&id), 6, 1).ok);
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn release_right_by_other_asset_rejected() {
    let mut c = setup_full();
    let id = locked(&mut c);
    ctx(&laser());
    c.release_right(id, U64(5));
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn release_right_wrong_reservation_rejected() {
    let mut c = setup_full();
    let id = locked(&mut c);
    ctx(&printer());
    c.release_right(id, U64(6));
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn release_right_after_consume_rejected() {
    let mut c = setup_full();
    let id = locked(&mut c);
    ctx(&printer());
    c.finalize_right(id.clone(), U64(5));
    c.release_right(id, U64(5));
}

#[test]
#[should_panic(expected = "E_NOT_FOUND")]
fn release_right_unknown_token() {
    let mut c = setup_full();
    ctx(&printer());
    c.release_right("right-42".into(), U64(1));
}

#[test]
#[should_panic(expected = "E_BAD_STATE: token is not a usage right")]
fn release_right_on_credential_rejected() {
    let mut c = setup_full();
    let cred = grant_credential(&mut c, &alice());
    ctx(&printer());
    c.release_right(cred, U64(1));
}

#[test]
fn finalize_right_consumes_once() {
    let mut c = setup_full();
    let id = locked(&mut c);
    ctx(&printer());
    assert!(c.finalize_right(id.clone(), U64(5)));
    assert_eq!(
        right_status(&c, &id),
        RightStatus::Consumed {
            asset: printer(),
            reservation_id: U64(5)
        }
    );
    assert_eq!(events("right_consumed")[0]["token_id"], id);
    assert!(!c.finalize_right(id.clone(), U64(5)), "retry is a no-op");
    assert_eq!(events("right_consumed").len(), 1);
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn finalize_right_by_other_asset_rejected() {
    let mut c = setup_full();
    let id = locked(&mut c);
    ctx(&laser());
    c.finalize_right(id, U64(5));
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn finalize_active_right_rejected() {
    let mut c = setup_full();
    let id = mint(&mut c, &printer(), &alice(), 1, 1)[0].clone();
    ctx(&printer());
    c.finalize_right(id, U64(5));
}

// ---- mint_rights ----

#[test]
fn mint_rights_mints_cards_in_asset_group() {
    let mut c = setup_full();
    let ids = mint(&mut c, &laser(), &alice(), 4, 2);
    assert_eq!(ids, vec!["right-1", "right-2"]);
    for id in &ids {
        let card = c.tokens.get(id).unwrap();
        assert_eq!(card.owner_id, alice());
        assert_eq!(card.issued_at, U64(T0));
        assert_eq!(card.expires_at, Some(U64(T0 + 30 * DAY_NS)));
        assert_eq!(
            card.kind,
            CardKind::UsageRight {
                group_id: "makerlab-fab".into(),
                max_slots: 2,
                source: maintenance(&laser(), 4),
                status: RightStatus::Active,
            }
        );
    }
    assert_eq!(
        c.get_mint_receipt(format!("{}:4", laser())),
        Some(ids.clone())
    );
    let ev = events("rights_minted");
    assert_eq!(ev[0]["token_ids"][1], "right-2");
    assert_eq!(ev[0]["group_id"], "makerlab-fab");
    assert_eq!(ev[0]["task_id"], "4");
    let nft = events("nft_mint");
    assert_eq!(nft[0]["owner_id"], alice().to_string());
    assert_eq!(nft[0]["token_ids"][0], "right-1");
}

#[test]
fn mint_rights_zero_validity_never_expires() {
    let mut c = setup_full();
    ctx(&printer());
    let ids = c.mint_rights(alice(), 1, 1, 0, maintenance(&printer(), 1));
    assert_eq!(c.tokens.get(&ids[0]).unwrap().expires_at, None);
}

#[test]
fn inv_exactly_once_mint_idempotent() {
    let mut c = setup_full();
    let first = mint(&mut c, &printer(), &alice(), 9, 3);
    let supply = c.nft_total_supply();
    // Retry with identical (or even different) args returns the stored ids, mints nothing.
    ctx(&printer());
    let again = c.mint_rights(alice(), 3, 2, 30, maintenance(&printer(), 9));
    assert_eq!(again, first);
    let other = c.mint_rights(bob(), 1, 1, 1, maintenance(&printer(), 9));
    assert_eq!(other, first);
    assert_eq!(c.nft_total_supply(), supply);
    assert!(events("rights_minted").is_empty());
    assert!(events("nft_mint").is_empty());
    // Same task id on another asset is a different source.
    let laser_ids = mint(&mut c, &laser(), &alice(), 9, 1);
    assert_eq!(laser_ids, vec!["right-4"]);
}

#[test]
fn mint_rights_replay_works_after_deactivation() {
    let mut c = setup_full();
    let first = mint(&mut c, &printer(), &alice(), 1, 1);
    ctx(&dao());
    c.deactivate_asset(printer());
    assert_eq!(mint(&mut c, &printer(), &alice(), 1, 1), first);
}

#[test]
#[should_panic(expected = "E_ASSET_NOT_REGISTERED: asset is inactive")]
fn mint_rights_inactive_asset_rejected() {
    let mut c = setup_full();
    ctx(&dao());
    c.deactivate_asset(printer());
    mint(&mut c, &printer(), &alice(), 1, 1);
}

#[test]
#[should_panic(expected = "E_ASSET_NOT_REGISTERED")]
fn mint_rights_unregistered_caller_rejected() {
    let mut c = setup_full();
    ctx(&alice());
    c.mint_rights(alice(), 1, 1, 1, maintenance(&alice(), 1));
}

#[test]
#[should_panic(expected = "E_UNAUTHORIZED")]
fn mint_rights_source_must_be_caller() {
    let mut c = setup_full();
    ctx(&printer());
    c.mint_rights(alice(), 1, 1, 1, maintenance(&laser(), 1));
}

#[test]
#[should_panic(expected = "E_UNAUTHORIZED")]
fn mint_rights_training_source_rejected() {
    let mut c = setup_full();
    ctx(&printer());
    c.mint_rights(
        alice(),
        1,
        1,
        1,
        RightSource::Training {
            training_id: U64(1),
        },
    );
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS: count")]
fn mint_rights_zero_count_rejected() {
    let mut c = setup_full();
    mint(&mut c, &printer(), &alice(), 1, 0);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS: count")]
fn mint_rights_count_cap() {
    let mut c = setup_full();
    mint(&mut c, &printer(), &alice(), 1, 11);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS: max_slots")]
fn mint_rights_zero_slots_rejected() {
    let mut c = setup_full();
    ctx(&printer());
    c.mint_rights(alice(), 1, 0, 1, maintenance(&printer(), 1));
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS: validity_days")]
fn mint_rights_validity_cap() {
    let mut c = setup_full();
    ctx(&printer());
    c.mint_rights(alice(), 1, 1, 3651, maintenance(&printer(), 1));
}

// ---- invariant: no retroactive revocation ----

#[test]
fn inv_no_retroactive_revocation() {
    let mut c = setup_full();
    let right = mint(&mut c, &printer(), &alice(), 1, 1)[0].clone();
    let snapshot = c.tokens.get(&right).unwrap().clone();

    // DAO governance actions leave the right untouched.
    ctx(&dao());
    c.deactivate_asset(printer());
    c.register_asset(printer(), "makerlab-wash".into());
    c.set_roles(alice(), vec![]);
    let mut kind = laser_kind();
    kind.right_max_slots = 1;
    kind.right_validity_days = 1;
    c.set_credential_kind(kind);
    assert_eq!(c.tokens.get(&right).unwrap(), &snapshot);

    // Other assets cannot release or consume a right they did not lock (it is Active).
    ctx(&laser());
    assert!(!c.release_right(right.clone(), U64(1)), "no-op on Active");
    assert_eq!(c.tokens.get(&right).unwrap(), &snapshot);

    // The only DAO method touching cards refuses usage rights.
    ctx(&dao());
    let refused = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.suspend_credential(right.clone(), "try".into())
    }));
    assert!(refused.is_err());
    ctx(&dao());
    assert_eq!(c.tokens.get(&right).unwrap(), &snapshot);
    assert_eq!(c.nft_supply_for_owner(alice()).0, 1);
}

#[test]
fn inv_no_retroactive_revocation_finalize_active_fails() {
    let mut c = setup_full();
    let right = mint(&mut c, &printer(), &alice(), 1, 1)[0].clone();
    ctx(&printer());
    let consumed = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.finalize_right(right.clone(), U64(1))
    }));
    assert!(
        consumed.is_err(),
        "Active right cannot be consumed without a lock"
    );
    ctx(&printer());
    assert_eq!(right_status(&c, &right), RightStatus::Active);
}

#[test]
#[should_panic(expected = "E_NO_REVOCATION")]
fn suspend_usage_right_is_refused() {
    let mut c = setup_full();
    let right = mint(&mut c, &printer(), &alice(), 1, 1)[0].clone();
    ctx(&dao());
    c.suspend_credential(right, "revoke attempt".into());
}
