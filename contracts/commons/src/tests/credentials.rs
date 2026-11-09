//! set_credential_kind, propose/approve/reject_credential, suspend/unsuspend_credential.

use super::*;

fn propose(c: &mut CommonsContract, trainee: &AccountId) -> U64 {
    ctx(&trainer());
    c.propose_credential(trainee.clone(), "laser_safety".into(), Some("ab12".into()))
}

/// verifier role for an extra account (e.g. to show that holding the role is not enough).
fn give_roles(c: &mut CommonsContract, account: &AccountId, roles: &[&str]) {
    ctx(&dao());
    c.set_roles(
        account.clone(),
        roles.iter().map(|r| r.to_string()).collect(),
    );
}

// ---- set_credential_kind ----

#[test]
fn set_credential_kind_upserts() {
    let mut c = setup();
    c.set_credential_kind(laser_kind());
    assert_eq!(c.get_credential_kinds(), vec![laser_kind()]);
    assert_eq!(events("credential_kind_set")[0]["created"], true);
    let mut k = laser_kind();
    k.title = "Laser safety v2".into();
    c.set_credential_kind(k.clone());
    assert_eq!(c.get_credential_kinds(), vec![k]);
    assert_eq!(events("credential_kind_set")[1]["created"], false);
}

#[test]
#[should_panic(expected = "E_NOT_DAO")]
fn set_credential_kind_requires_dao() {
    let mut c = setup();
    ctx(&trainer());
    c.set_credential_kind(laser_kind());
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS: kind")]
fn set_credential_kind_rejects_bad_id() {
    let mut c = setup();
    let mut k = laser_kind();
    k.kind = "Laser Safety".into();
    c.set_credential_kind(k);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS: title")]
fn set_credential_kind_rejects_empty_title() {
    let mut c = setup();
    let mut k = laser_kind();
    k.title = "".into();
    c.set_credential_kind(k);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS: right_max_slots")]
fn set_credential_kind_rejects_zero_slots_with_rewards() {
    let mut c = setup();
    let mut k = laser_kind();
    k.right_max_slots = 0;
    c.set_credential_kind(k);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS: trainer_reward_rights")]
fn set_credential_kind_caps_trainer_rewards() {
    let mut c = setup();
    let mut k = laser_kind();
    k.trainer_reward_rights = 11;
    c.set_credential_kind(k);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS: validity_days")]
fn set_credential_kind_caps_validity() {
    let mut c = setup();
    let mut k = laser_kind();
    k.validity_days = 4000;
    c.set_credential_kind(k);
}

#[test]
fn credential_kind_change_leaves_issued_cards_intact() {
    let mut c = setup_full();
    let cred = grant_credential(&mut c, &alice());
    let before = c.tokens.get(&cred).unwrap().clone();
    ctx(&dao());
    let mut k = laser_kind();
    k.validity_days = 1;
    c.set_credential_kind(k);
    assert_eq!(c.tokens.get(&cred).unwrap(), &before);
    assert!(c.has_credential(alice(), "laser_safety".into()));
}

// ---- propose_credential ----

#[test]
fn propose_credential_creates_training() {
    let mut c = setup_full();
    let id = propose(&mut c, &alice());
    assert_eq!(id, U64(1));
    let t = c.get_training(id).unwrap();
    assert_eq!(t.trainer, trainer());
    assert_eq!(t.trainee, alice());
    assert_eq!(t.status, TrainingStatus::Proposed);
    assert_eq!(t.notes_hash.as_deref(), Some("ab12"));
    let ev = events("training_proposed");
    assert_eq!(ev[0]["training_id"], "1");
    assert_eq!(ev[0]["trainee"], alice().to_string());
}

#[test]
#[should_panic(expected = "E_MISSING_ROLE")]
fn propose_credential_requires_trainer() {
    let mut c = setup_full();
    ctx(&verifier());
    c.propose_credential(alice(), "laser_safety".into(), None);
}

#[test]
#[should_panic(expected = "E_SELF_VERIFY")]
fn propose_credential_trainer_cannot_train_self() {
    let mut c = setup_full();
    propose(&mut c, &trainer());
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS: unknown credential kind")]
fn propose_credential_unknown_kind() {
    let mut c = setup_full();
    ctx(&trainer());
    c.propose_credential(alice(), "forklift".into(), None);
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS: notes_hash")]
fn propose_credential_bad_hash() {
    let mut c = setup_full();
    ctx(&trainer());
    c.propose_credential(alice(), "laser_safety".into(), Some("not hex!".into()));
}

// ---- approve_credential ----

#[test]
fn approve_credential_mints_credential_and_trainer_rights() {
    let mut c = setup_full();
    let id = propose(&mut c, &alice());
    ctx(&verifier());
    let minted = c.approve_credential(id);
    assert_eq!(minted, vec!["cred-1", "right-2"]);

    let cred = c.tokens.get("cred-1").unwrap();
    assert_eq!(cred.owner_id, alice());
    assert_eq!(cred.expires_at, Some(U64(T0 + 365 * DAY_NS)));
    assert_eq!(
        cred.kind,
        CardKind::Credential {
            kind: "laser_safety".into(),
            issued_by_training: id,
            suspended: false
        }
    );
    let right = c.tokens.get("right-2").unwrap();
    assert_eq!(right.owner_id, trainer());
    assert_eq!(right.expires_at, Some(U64(T0 + 30 * DAY_NS)));
    assert_eq!(
        right.kind,
        CardKind::UsageRight {
            group_id: "makerlab-fab".into(),
            max_slots: 2,
            source: RightSource::Training { training_id: id },
            status: RightStatus::Active,
        }
    );
    let t = c.get_training(id).unwrap();
    assert_eq!(t.status, TrainingStatus::Approved);
    assert_eq!(t.approver, Some(verifier()));
    assert_eq!(t.minted, minted);
    assert_eq!(c.get_mint_receipt("training:1".into()), Some(minted));
    assert!(c.has_credential(alice(), "laser_safety".into()));

    let ev = events("training_approved");
    assert_eq!(ev[0]["credential_token_id"], "cred-1");
    assert_eq!(ev[0]["trainer_right_ids"][0], "right-2");
    assert_eq!(events("rights_minted")[0]["training_id"], "1");
    let nft = events("nft_mint");
    assert_eq!(nft.len(), 2);
    assert_eq!(nft[0]["owner_id"], alice().to_string());
    assert_eq!(nft[1]["owner_id"], trainer().to_string());
}

#[test]
fn approve_credential_without_trainer_rewards() {
    let mut c = setup_full();
    ctx(&dao());
    let mut k = laser_kind();
    k.trainer_reward_rights = 0;
    k.validity_days = 0;
    c.set_credential_kind(k);
    let id = propose(&mut c, &alice());
    ctx(&verifier());
    assert_eq!(c.approve_credential(id), vec!["cred-1"]);
    assert_eq!(c.tokens.get("cred-1").unwrap().expires_at, None);
    assert!(events("rights_minted").is_empty());
}

#[test]
fn approve_credential_twice_mints_once() {
    let mut c = setup_full();
    let id = propose(&mut c, &alice());
    ctx(&verifier());
    let first = c.approve_credential(id);
    let supply = c.nft_total_supply();
    let second = c.approve_credential(id);
    assert_eq!(first, second);
    assert_eq!(c.nft_total_supply(), supply);
    assert_eq!(events("training_approved").len(), 1);
}

#[test]
#[should_panic(expected = "E_MISSING_ROLE")]
fn approve_credential_requires_verifier() {
    let mut c = setup_full();
    let id = propose(&mut c, &alice());
    ctx(&bob());
    c.approve_credential(id);
}

#[test]
#[should_panic(expected = "E_SELF_VERIFY: the trainer")]
fn approve_credential_trainer_cannot_approve() {
    let mut c = setup_full();
    give_roles(&mut c, &trainer(), &["trainer", "verifier"]);
    let id = propose(&mut c, &alice());
    ctx(&trainer());
    c.approve_credential(id);
}

#[test]
#[should_panic(expected = "E_SELF_VERIFY: the trainee")]
fn approve_credential_trainee_cannot_approve() {
    let mut c = setup_full();
    give_roles(&mut c, &alice(), &["verifier"]);
    let id = propose(&mut c, &alice());
    ctx(&alice());
    c.approve_credential(id);
}

#[test]
fn inv_no_self_verification_training() {
    let mut c = setup_full();
    give_roles(&mut c, &trainer(), &["trainer", "verifier"]);
    give_roles(&mut c, &alice(), &["verifier"]);
    let id = propose(&mut c, &alice());
    for who in [trainer(), alice()] {
        ctx(&who);
        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.approve_credential(id);
        }));
        assert!(r.is_err(), "{who} must not approve");
    }
    ctx(&trainer());
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.reject_credential(id, "nope".into());
    }));
    assert!(r.is_err(), "trainer must not reject own training");
    ctx(&verifier());
    assert_eq!(c.get_training(id).unwrap().status, TrainingStatus::Proposed);
    assert!(!c.has_credential(alice(), "laser_safety".into()));
    // An independent verifier can.
    c.approve_credential(id);
    assert!(c.has_credential(alice(), "laser_safety".into()));
}

#[test]
#[should_panic(expected = "E_NOT_FOUND")]
fn approve_credential_unknown_training() {
    let mut c = setup_full();
    ctx(&verifier());
    c.approve_credential(U64(9));
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn approve_credential_after_reject() {
    let mut c = setup_full();
    let id = propose(&mut c, &alice());
    ctx(&verifier());
    c.reject_credential(id, "incomplete".into());
    c.approve_credential(id);
}

// ---- reject_credential ----

#[test]
fn reject_credential_records_reason() {
    let mut c = setup_full();
    let id = propose(&mut c, &alice());
    ctx(&verifier());
    c.reject_credential(id, "incomplete".into());
    let t = c.get_training(id).unwrap();
    assert_eq!(t.status, TrainingStatus::Rejected);
    assert_eq!(t.approver, Some(verifier()));
    let ev = events("training_rejected");
    assert_eq!(ev[0]["reason"], "incomplete");
    assert_eq!(c.nft_total_supply().0, 0);
}

#[test]
#[should_panic(expected = "E_MISSING_ROLE")]
fn reject_credential_requires_verifier() {
    let mut c = setup_full();
    let id = propose(&mut c, &alice());
    ctx(&trainer());
    c.reject_credential(id, "x".into());
}

#[test]
#[should_panic(expected = "E_SELF_VERIFY")]
fn reject_credential_trainer_cannot_reject() {
    let mut c = setup_full();
    give_roles(&mut c, &trainer(), &["trainer", "verifier"]);
    let id = propose(&mut c, &alice());
    ctx(&trainer());
    c.reject_credential(id, "x".into());
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS: reason")]
fn reject_credential_requires_reason() {
    let mut c = setup_full();
    let id = propose(&mut c, &alice());
    ctx(&verifier());
    c.reject_credential(id, "".into());
}

#[test]
#[should_panic(expected = "E_BAD_STATE")]
fn reject_credential_after_approve() {
    let mut c = setup_full();
    let id = propose(&mut c, &alice());
    ctx(&verifier());
    c.approve_credential(id);
    c.reject_credential(id, "late".into());
}

#[test]
#[should_panic(expected = "E_NOT_FOUND")]
fn reject_credential_unknown_training() {
    let mut c = setup_full();
    ctx(&verifier());
    c.reject_credential(U64(4), "x".into());
}

// ---- suspend / unsuspend ----

#[test]
fn suspend_and_unsuspend_credential() {
    let mut c = setup_full();
    let cred = grant_credential(&mut c, &alice());
    let trainer_right = c.get_mint_receipt("training:1".into()).unwrap()[1].clone();
    ctx(&dao());
    c.suspend_credential(cred.clone(), "unsafe use reported".into());
    assert!(!c.has_credential(alice(), "laser_safety".into()));
    let ev = events("credential_suspended");
    assert_eq!(ev[0]["token_id"], cred);
    assert_eq!(ev[0]["reason"], "unsafe use reported");
    // The card still exists and the trainer's reward right is untouched.
    assert_eq!(c.nft_supply_for_owner(alice()).0, 1);
    assert_eq!(right_status(&c, &trainer_right), RightStatus::Active);

    c.unsuspend_credential(cred.clone(), "retrained".into());
    assert!(c.has_credential(alice(), "laser_safety".into()));
    assert_eq!(events("credential_unsuspended")[0]["reason"], "retrained");
}

#[test]
#[should_panic(expected = "E_NOT_DAO")]
fn suspend_credential_requires_dao() {
    let mut c = setup_full();
    let cred = grant_credential(&mut c, &alice());
    ctx(&verifier());
    c.suspend_credential(cred, "x".into());
}

#[test]
#[should_panic(expected = "E_INVALID_ARGS: reason")]
fn suspend_credential_requires_reason() {
    let mut c = setup_full();
    let cred = grant_credential(&mut c, &alice());
    ctx(&dao());
    c.suspend_credential(cred, " ".into());
}

#[test]
#[should_panic(expected = "E_BAD_STATE: credential already suspended")]
fn suspend_credential_twice() {
    let mut c = setup_full();
    let cred = grant_credential(&mut c, &alice());
    ctx(&dao());
    c.suspend_credential(cred.clone(), "x".into());
    c.suspend_credential(cred, "x".into());
}

#[test]
#[should_panic(expected = "E_NOT_FOUND")]
fn suspend_credential_unknown_token() {
    let mut c = setup_full();
    c.suspend_credential("cred-77".into(), "x".into());
}

#[test]
#[should_panic(expected = "E_BAD_STATE: credential is not suspended")]
fn unsuspend_credential_not_suspended() {
    let mut c = setup_full();
    let cred = grant_credential(&mut c, &alice());
    ctx(&dao());
    c.unsuspend_credential(cred, "x".into());
}

#[test]
#[should_panic(expected = "E_NOT_DAO")]
fn unsuspend_credential_requires_dao() {
    let mut c = setup_full();
    let cred = grant_credential(&mut c, &alice());
    ctx(&dao());
    c.suspend_credential(cred.clone(), "x".into());
    ctx(&alice());
    c.unsuspend_credential(cred, "x".into());
}
