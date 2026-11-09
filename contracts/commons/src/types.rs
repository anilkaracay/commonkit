//! Stored types of the commons contract (CONTRACT_SPEC §4).
//!
//! Fields that are exposed in JSON use `U64` so ids and timestamps are strings in JSON.

use commonkit_types::commons_iface::{CredentialKind, GroupId, RightSource, RightStatus, TokenId};
use near_sdk::json_types::U64;
use near_sdk::{near, AccountId};

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AssetEntry {
    pub group_id: GroupId,
    pub active: bool,
    pub registered_at: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CredentialKindConfig {
    pub kind: CredentialKind,
    pub title: String,
    /// 0 = no expiry.
    pub validity_days: u32,
    pub reward_group: GroupId,
    pub trainer_reward_rights: u32,
    pub right_max_slots: u32,
    /// 0 = no expiry.
    pub right_validity_days: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum CardKind {
    UsageRight {
        group_id: GroupId,
        max_slots: u32,
        source: RightSource,
        status: RightStatus,
    },
    Credential {
        kind: CredentialKind,
        issued_by_training: U64,
        suspended: bool,
    },
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Card {
    /// `"right-<seq>"` | `"cred-<seq>"`
    pub token_id: TokenId,
    pub owner_id: AccountId,
    pub kind: CardKind,
    pub issued_at: U64,
    pub expires_at: Option<U64>,
}

impl Card {
    pub fn is_expired(&self, now: u64) -> bool {
        matches!(self.expires_at, Some(e) if now >= e.0)
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TrainingStatus {
    Proposed,
    Approved,
    Rejected,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Training {
    pub id: U64,
    pub trainer: AccountId,
    pub trainee: AccountId,
    pub kind: CredentialKind,
    pub notes_hash: Option<String>,
    pub status: TrainingStatus,
    /// Verifier who approved or rejected it.
    pub approver: Option<AccountId>,
    pub minted: Vec<TokenId>,
    pub created_at: U64,
}

/// NEP-177 contract metadata.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NftContractMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

/// NEP-177 token metadata (computed at view time from the card, never stored).
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<String>,
    pub copies: Option<u64>,
    pub issued_at: Option<String>,
    pub expires_at: Option<String>,
    pub starts_at: Option<String>,
    pub updated_at: Option<String>,
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

/// NEP-171 token view. `approved_account_ids` is always empty (cards cannot be approved).
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JsonToken {
    pub token_id: TokenId,
    pub owner_id: AccountId,
    pub metadata: Option<TokenMetadata>,
    pub approved_account_ids: std::collections::HashMap<AccountId, u64>,
}

/// Typed card view returned by `get_cards_for_owner` (richer than NEP-171).
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CardView {
    #[serde(flatten)]
    pub card: Card,
    pub expired: bool,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AssetView {
    pub asset_id: AccountId,
    #[serde(flatten)]
    pub entry: AssetEntry,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RoleEntry {
    pub account_id: AccountId,
    pub roles: Vec<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Wiring {
    pub dao_id: AccountId,
    pub name: String,
    pub roles_version: U64,
    pub next_training_id: U64,
    pub next_token_seq: U64,
    pub total_supply: U64,
    pub version: String,
}
