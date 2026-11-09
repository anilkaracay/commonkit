//! Unit tests for the commons contract. One file per area; helpers here.

mod credentials;
mod nft;
mod registry;
mod rights;
mod views;

use crate::*;
use commonkit_types::commons_iface::{RightSource, ROLE_COUNCIL, ROLE_TRAINER, ROLE_VERIFIER};
use near_sdk::serde_json::Value;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, NearToken};

pub(crate) const T0: u64 = 1_700_000_000_000_000_000;

pub(crate) fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
pub(crate) fn commons_id() -> AccountId {
    acc("commons.makerlab.testnet")
}
pub(crate) fn dao() -> AccountId {
    acc("makerlab.sputnikv2.testnet")
}
pub(crate) fn printer() -> AccountId {
    acc("printer.makerlab.testnet")
}
pub(crate) fn laser() -> AccountId {
    acc("laser.makerlab.testnet")
}
pub(crate) fn washer() -> AccountId {
    acc("washer.makerlab.testnet")
}
pub(crate) fn alice() -> AccountId {
    acc("alice.testnet")
}
pub(crate) fn bob() -> AccountId {
    acc("bob.testnet")
}
pub(crate) fn trainer() -> AccountId {
    acc("trainer.testnet")
}
pub(crate) fn verifier() -> AccountId {
    acc("verifier.testnet")
}

pub(crate) fn builder(pred: &AccountId, ts: u64) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id(commons_id())
        .predecessor_account_id(pred.clone())
        .signer_account_id(pred.clone())
        .block_timestamp(ts);
    b
}

pub(crate) fn ctx_at(pred: &AccountId, ts: u64) {
    testing_env!(builder(pred, ts).build());
}

pub(crate) fn ctx(pred: &AccountId) {
    ctx_at(pred, T0);
}

pub(crate) fn ctx_deposit(pred: &AccountId, yocto: u128) {
    testing_env!(builder(pred, T0)
        .attached_deposit(NearToken::from_yoctonear(yocto))
        .build());
}

pub(crate) fn metadata() -> NftContractMetadata {
    NftContractMetadata {
        spec: "nft-1.0.0".into(),
        name: "Makerlab cards".into(),
        symbol: "MKLAB".into(),
        icon: None,
        base_uri: None,
        reference: None,
        reference_hash: None,
    }
}

pub(crate) fn setup() -> CommonsContract {
    ctx(&dao());
    CommonsContract::new(dao(), "Makerlab".into(), metadata())
}

pub(crate) fn laser_kind() -> CredentialKindConfig {
    CredentialKindConfig {
        kind: "laser_safety".into(),
        title: "Laser safety".into(),
        validity_days: 365,
        reward_group: "makerlab-fab".into(),
        trainer_reward_rights: 1,
        right_max_slots: 2,
        right_validity_days: 30,
    }
}

/// printer + laser in `makerlab-fab`, washer in `makerlab-wash`; trainer, verifier, council
/// roles; `laser_safety` kind.
pub(crate) fn setup_full() -> CommonsContract {
    let mut c = setup();
    c.register_asset(printer(), "makerlab-fab".into());
    c.register_asset(laser(), "makerlab-fab".into());
    c.register_asset(washer(), "makerlab-wash".into());
    c.set_roles(trainer(), vec![ROLE_TRAINER.into()]);
    c.set_roles(verifier(), vec![ROLE_VERIFIER.into()]);
    c.set_roles(acc("council.testnet"), vec![ROLE_COUNCIL.into()]);
    c.set_credential_kind(laser_kind());
    c
}

pub(crate) fn maintenance(asset: &AccountId, task_id: u64) -> RightSource {
    RightSource::Maintenance {
        asset: asset.clone(),
        task_id: U64(task_id),
    }
}

/// Mint `count` rights (2 slots, 30 days) for `holder` from `asset` task `task_id`.
pub(crate) fn mint(
    c: &mut CommonsContract,
    asset: &AccountId,
    holder: &AccountId,
    task_id: u64,
    count: u32,
) -> Vec<TokenId> {
    ctx(asset);
    c.mint_rights(holder.clone(), count, 2, 30, maintenance(asset, task_id))
}

/// Trainer proposes and verifier approves a `laser_safety` credential for `trainee`.
/// Returns the credential token id.
pub(crate) fn grant_credential(c: &mut CommonsContract, trainee: &AccountId) -> TokenId {
    ctx(&trainer());
    let id = c.propose_credential(trainee.clone(), "laser_safety".into(), None);
    ctx(&verifier());
    c.approve_credential(id)[0].clone()
}

/// `data[0]` of every COMMONKIT/NEP-171 event named `name` logged in the current context.
pub(crate) fn events(name: &str) -> Vec<Value> {
    get_logs()
        .iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .filter_map(|j| near_sdk::serde_json::from_str::<Value>(j).ok())
        .filter(|v| v["event"] == name)
        .map(|v| {
            if v["standard"] == "nep171" {
                assert_eq!(v["version"], "1.0.0");
            } else {
                assert_eq!(v["standard"], "commonkit");
                assert_eq!(v["version"], "1.0.0");
            }
            v["data"][0].clone()
        })
        .collect()
}

pub(crate) fn right_status(c: &CommonsContract, token_id: &str) -> RightStatus {
    match &c.tokens.get(token_id).unwrap().kind {
        CardKind::UsageRight { status, .. } => status.clone(),
        CardKind::Credential { .. } => panic!("not a right"),
    }
}

use commonkit_types::commons_iface::RightStatus;
