//! Types the commons contract exposes to assets (CONTRACT_SPEC §4–§5).
//!
//! Assets call commons with named JSON arguments. The `*Args` structs below serialize to
//! exactly the argument objects the commons methods accept, so an asset can build a call with
//! `serde_json::to_vec(&AuthorizeReservationArgs { .. })`.
//!
//! | Method (on commons)       | Args                         | Returns          | Panics on                            |
//! | :------------------------ | :--------------------------- | :--------------- | :----------------------------------- |
//! | `authorize_reservation`   | [`AuthorizeReservationArgs`] | [`AuthResult`]   | caller not a registered asset        |
//! | `release_right`           | [`RightRefArgs`]             | `bool` (changed) | not locked by this asset+reservation |
//! | `finalize_right`          | [`RightRefArgs`]             | `bool` (changed) | not locked by this asset+reservation |
//! | `mint_rights`             | [`MintRightsArgs`]           | `Vec<TokenId>`   | caller not the registered active `source.asset` |
//!
//! Business failures of `authorize_reservation` (missing credential, right not active, wrong group,
//! expired, too many slots, asset deactivated) return `AuthResult { ok: false, reason: Some(code) }`
//! instead of panicking, so the asset can refund cleanly (spec §5).
//!
//! `mint_rights` is idempotent on `(source.asset, source.task_id)`: a repeated call returns the
//! token ids stored in the first successful call and mints nothing.
//!
//! The commons contract pushes roles to assets by calling `sync_roles` on the asset
//! (payload type is owned by the asset contract, see `asset_iface`). Each push carries the
//! **full** role snapshot of the community (accounts whose roles were removed appear with an
//! empty list), so an asset may ignore any push whose `version <= roles_version` without losing
//! data (DECISIONS D-302).

use near_sdk::json_types::U64;
use near_sdk::{near, AccountId, Gas};

pub type AssetId = AccountId;
pub type GroupId = String;
pub type CredentialKind = String;
pub type Role = String;
pub type TokenId = String;

/// Role names accepted by `commons.set_roles`.
pub const ROLE_STEWARD: &str = "steward";
pub const ROLE_VERIFIER: &str = "verifier";
pub const ROLE_TRAINER: &str = "trainer";
pub const ROLE_COUNCIL: &str = "council";
pub const ALL_ROLES: [&str; 4] = [ROLE_STEWARD, ROLE_VERIFIER, ROLE_TRAINER, ROLE_COUNCIL];

/// Method names on the commons contract that assets call.
pub const METHOD_AUTHORIZE_RESERVATION: &str = "authorize_reservation";
pub const METHOD_RELEASE_RIGHT: &str = "release_right";
pub const METHOD_FINALIZE_RIGHT: &str = "finalize_right";
pub const METHOD_MINT_RIGHTS: &str = "mint_rights";

/// Suggested gas to attach when an asset calls commons. Starting values (spec §8);
/// final values are measured on sandbox/testnet and recorded in DECISIONS.
pub const GAS_AUTHORIZE: Gas = Gas::from_tgas(15);
pub const GAS_RELEASE_RIGHT: Gas = Gas::from_tgas(10);
pub const GAS_FINALIZE_RIGHT: Gas = Gas::from_tgas(10);
/// Covers `MAX_MINT_PER_CALL` cards.
pub const GAS_MINT: Gas = Gas::from_tgas(30);

/// Upper bound on `MintRightsArgs::count` accepted by commons.
pub const MAX_MINT_PER_CALL: u32 = 10;

/// Reason codes returned in `AuthResult::reason` (subset of CONTRACT_SPEC §10).
pub const REASON_CREDENTIAL_MISSING: &str = "E_CREDENTIAL_MISSING";
pub const REASON_RIGHT_NOT_ACTIVE: &str = "E_RIGHT_NOT_ACTIVE";
pub const REASON_RIGHT_WRONG_GROUP: &str = "E_RIGHT_WRONG_GROUP";
pub const REASON_RIGHT_EXPIRED: &str = "E_RIGHT_EXPIRED";
pub const REASON_TOO_MANY_SLOTS: &str = "E_TOO_MANY_SLOTS";
pub const REASON_ASSET_NOT_REGISTERED: &str = "E_ASSET_NOT_REGISTERED";
pub const REASON_UNAUTHORIZED: &str = "E_UNAUTHORIZED";

/// Where a usage right came from. Used as the idempotency key of `mint_rights`
/// (`"<asset>:<task_id>"` or `"training:<id>"`).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum RightSource {
    Maintenance { asset: AccountId, task_id: U64 },
    Training { training_id: U64 },
}

impl RightSource {
    /// Key into `commons.mint_receipts`.
    pub fn receipt_key(&self) -> String {
        match self {
            RightSource::Maintenance { asset, task_id } => format!("{}:{}", asset, task_id.0),
            RightSource::Training { training_id } => format!("training:{}", training_id.0),
        }
    }
}

/// Lifecycle of a usage-right card. Only the locking asset can move it, and only
/// Locked → Active (release) or Locked → Consumed (finalize). No method downgrades an Active right.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(tag = "state")]
pub enum RightStatus {
    Active,
    Locked { asset: AccountId, reservation_id: U64 },
    Consumed { asset: AccountId, reservation_id: U64 },
}

/// Args of `commons.authorize_reservation`.
///
/// `asset` must equal the calling account. `slots` is the reservation length; when a right is
/// used, commons checks `slots <= card.max_slots` (spec §7; DECISIONS D-301).
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AuthorizeReservationArgs {
    pub holder: AccountId,
    pub asset: AccountId,
    pub credential: Option<CredentialKind>,
    pub right_id: Option<TokenId>,
    pub reservation_id: U64,
    pub slots: u32,
}

/// Result of `commons.authorize_reservation`.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AuthResult {
    pub ok: bool,
    /// Error code from CONTRACT_SPEC §10 when `ok == false`.
    pub reason: Option<String>,
    /// The credential card that satisfied `credential`, if one was required.
    pub credential_token_id: Option<TokenId>,
    /// The right that is now `Locked { asset, reservation_id }`, if `right_id` was given.
    pub locked_right_id: Option<TokenId>,
}

/// Args of `commons.release_right` and `commons.finalize_right`.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RightRefArgs {
    pub token_id: TokenId,
    pub reservation_id: U64,
}

/// Args of `commons.mint_rights`.
///
/// The group of the minted cards is the group the asset is registered in (commons is the
/// source of truth); `source` must be `Maintenance { asset: <caller>, task_id }`.
/// `validity_days == 0` means no expiry. `1 <= count <= MAX_MINT_PER_CALL`, `max_slots >= 1`.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MintRightsArgs {
    pub holder: AccountId,
    pub count: u32,
    pub max_slots: u32,
    pub validity_days: u32,
    pub source: RightSource,
}

/// NEP-297 envelope used by both contracts: `EVENT_JSON:{"standard":"commonkit","version":"1.0.0",
/// "event":<name>,"data":[<object>]}`. `data` is always a one-element array (NEP-171 style).
pub const EVENT_STANDARD: &str = "commonkit";
pub const EVENT_VERSION: &str = "1.0.0";

/// Emit a COMMONKIT NEP-297 event with a single data object.
pub fn emit_event(event: &str, data: near_sdk::serde_json::Value) {
    let envelope = near_sdk::serde_json::json!({
        "standard": EVENT_STANDARD,
        "version": EVENT_VERSION,
        "event": event,
        "data": [data],
    });
    near_sdk::env::log_str(&format!("EVENT_JSON:{}", envelope));
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::serde_json;

    #[test]
    fn receipt_keys() {
        let m = RightSource::Maintenance {
            asset: "printer.makerlab.testnet".parse().unwrap(),
            task_id: U64(7),
        };
        assert_eq!(m.receipt_key(), "printer.makerlab.testnet:7");
        let t = RightSource::Training {
            training_id: U64(3),
        };
        assert_eq!(t.receipt_key(), "training:3");
    }

    #[test]
    fn json_shapes() {
        let args = MintRightsArgs {
            holder: "alice.testnet".parse().unwrap(),
            count: 2,
            max_slots: 4,
            validity_days: 90,
            source: RightSource::Maintenance {
                asset: "printer.testnet".parse().unwrap(),
                task_id: U64(1),
            },
        };
        let v = serde_json::to_value(&args).unwrap();
        assert_eq!(v["source"]["type"], "Maintenance");
        assert_eq!(v["source"]["task_id"], "1");
        let s = RightStatus::Locked {
            asset: "a.testnet".parse().unwrap(),
            reservation_id: U64(9),
        };
        let v = serde_json::to_value(&s).unwrap();
        assert_eq!(v["state"], "Locked");
        assert_eq!(v["reservation_id"], "9");
    }
}
