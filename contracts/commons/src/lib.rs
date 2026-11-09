//! COMMONKIT `commons` contract: one per community (CONTRACT_SPEC §4–§5).
//!
//! Holds the asset registry and groups, member roles (pushed to assets), credential kinds,
//! trainings, and the non-transferable NEP-171 cards (usage rights and credentials).
//!
//! Invariants enforced here (CLAUDE.md §4):
//! - No retroactive revocation: no method deletes or downgrades an `Active` usage right. Only the
//!   asset that locked a right can move it, and only Locked → Active or Locked → Consumed.
//!   Credentials can be suspended by the DAO forward-only (D-005).
//! - No self-verification: a trainer cannot approve their own training; a trainee cannot approve
//!   their own credential.
//! - Exactly-once mint: `mint_rights` and `approve_credential` are idempotent on `mint_receipts`.

mod credentials;
mod nft;
mod registry;
mod rights;
mod types;
mod views;

#[cfg(test)]
mod tests;

pub use types::*;

use commonkit_types::commons_iface::{emit_event, CredentialKind, GroupId, Role, TokenId};
use near_sdk::json_types::U64;
use near_sdk::serde_json::json;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, Gas, PanicOnDefault};

pub const CONTRACT_VERSION: &str = "commonkit-commons/0.1.0";

/// Gas for one `asset.sync_roles` push and its callback (start values; measured in M1c/M2).
pub const GAS_SYNC_ROLES: Gas = Gas::from_tgas(20);
pub const GAS_ON_ROLES_SYNCED: Gas = Gas::from_tgas(5);
/// Gas kept back so the method that schedules pushes can finish.
pub const GAS_PUSH_RESERVE: Gas = Gas::from_tgas(10);

/// Max distinct accounts that ever held a role (bounds the full-snapshot push, D-302).
pub const MAX_ROLE_ACCOUNTS: u32 = 100;
pub const MAX_ID_LEN: usize = 64;
pub const MAX_TITLE_LEN: usize = 200;
pub const MAX_REASON_LEN: usize = 500;
pub const MAX_HASH_LEN: usize = 128;
pub const MAX_VALIDITY_DAYS: u32 = 3650;
pub const MAX_PAGE: u64 = 100;
pub const DAY_NS: u64 = 86_400 * 1_000_000_000;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Assets,
    Groups,
    Roles,
    CredentialKinds,
    Trainings,
    Tokens,
    TokensByOwner,
    MintReceipts,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct CommonsContract {
    dao_id: AccountId,
    name: String,
    assets: IterableMap<AccountId, AssetEntry>,
    groups: IterableMap<GroupId, Vec<AccountId>>,
    /// Accounts whose roles were removed stay with `[]` (tombstone, D-302).
    roles: IterableMap<AccountId, Vec<Role>>,
    roles_version: u64,
    credential_kinds: IterableMap<CredentialKind, CredentialKindConfig>,
    trainings: IterableMap<u64, Training>,
    next_training_id: u64,
    tokens: IterableMap<TokenId, Card>,
    /// Cards are never transferred or burned, so this list only grows.
    tokens_by_owner: LookupMap<AccountId, Vec<TokenId>>,
    /// `"<asset>:<task_id>"` or `"training:<id>"` → minted token ids (idempotency).
    mint_receipts: LookupMap<String, Vec<TokenId>>,
    next_token_seq: u64,
    metadata: NftContractMetadata,
}

#[near]
impl CommonsContract {
    #[init]
    pub fn new(dao_id: AccountId, name: String, metadata: NftContractMetadata) -> Self {
        require_text(&name, MAX_ID_LEN, "name");
        require!(
            metadata.spec.starts_with("nft-"),
            "E_INVALID_ARGS: metadata.spec must be an NEP-171 spec like nft-1.0.0"
        );
        require_text(&metadata.name, MAX_TITLE_LEN, "metadata.name");
        require_text(&metadata.symbol, MAX_ID_LEN, "metadata.symbol");
        Self {
            dao_id,
            name,
            assets: IterableMap::new(StorageKey::Assets),
            groups: IterableMap::new(StorageKey::Groups),
            roles: IterableMap::new(StorageKey::Roles),
            roles_version: 0,
            credential_kinds: IterableMap::new(StorageKey::CredentialKinds),
            trainings: IterableMap::new(StorageKey::Trainings),
            next_training_id: 1,
            tokens: IterableMap::new(StorageKey::Tokens),
            tokens_by_owner: LookupMap::new(StorageKey::TokensByOwner),
            mint_receipts: LookupMap::new(StorageKey::MintReceipts),
            next_token_seq: 1,
            metadata,
        }
    }

    /// Adds attached NEAR to the commons balance, which pays for its storage (spec §8).
    #[payable]
    pub fn fund_storage(&mut self) {
        let amount = env::attached_deposit();
        require!(
            !amount.is_zero(),
            "E_WRONG_AMOUNT: attach NEAR to fund storage"
        );
        emit_event(
            "storage_funded",
            json!({
                "account_id": env::predecessor_account_id(),
                "amount": amount.as_yoctonear().to_string(),
            }),
        );
    }
}

impl CommonsContract {
    pub(crate) fn assert_dao(&self) {
        require!(
            env::predecessor_account_id() == self.dao_id,
            "E_NOT_DAO: only the community DAO can call this"
        );
    }

    pub(crate) fn has_role(&self, account: &AccountId, role: &str) -> bool {
        self.roles
            .get(account)
            .is_some_and(|roles| roles.iter().any(|r| r == role))
    }

    pub(crate) fn assert_role(&self, account: &AccountId, role: &str) {
        if !self.has_role(account, role) {
            env::panic_str(&format!("E_MISSING_ROLE: requires role {role}"));
        }
    }

    pub(crate) fn next_seq(&mut self) -> u64 {
        let seq = self.next_token_seq;
        self.next_token_seq += 1;
        seq
    }
}

/// `now + days`, or `None` for `days == 0` (no expiry).
pub(crate) fn expiry_from_days(now: u64, days: u32) -> Option<U64> {
    if days == 0 {
        None
    } else {
        Some(U64(now.saturating_add(u64::from(days) * DAY_NS)))
    }
}

/// Lowercase ids such as group ids and credential kinds: `[a-z0-9_-]{1,64}`.
pub(crate) fn require_id(value: &str, field: &str) {
    let ok = !value.is_empty()
        && value.len() <= MAX_ID_LEN
        && value
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_' || b == b'-');
    if !ok {
        env::panic_str(&format!(
            "E_INVALID_ARGS: {field} must match [a-z0-9_-]{{1,{MAX_ID_LEN}}}"
        ));
    }
}

/// Non-empty text up to `max` bytes.
pub(crate) fn require_text(value: &str, max: usize, field: &str) {
    if value.trim().is_empty() || value.len() > max {
        env::panic_str(&format!(
            "E_INVALID_ARGS: {field} must be non-empty and at most {max} bytes"
        ));
    }
}

/// Hex digest up to `MAX_HASH_LEN` chars.
pub(crate) fn require_hex_hash(value: &str, field: &str) {
    let ok = !value.is_empty()
        && value.len() <= MAX_HASH_LEN
        && value.bytes().all(|b| b.is_ascii_hexdigit());
    if !ok {
        env::panic_str(&format!(
            "E_INVALID_ARGS: {field} must be a hex digest of at most {MAX_HASH_LEN} chars"
        ));
    }
}

pub(crate) fn require_validity_days(days: u32, field: &str) {
    if days > MAX_VALIDITY_DAYS {
        env::panic_str(&format!(
            "E_INVALID_ARGS: {field} must be at most {MAX_VALIDITY_DAYS}"
        ));
    }
}

/// Clamp a pagination limit.
pub(crate) fn page_limit(limit: Option<u64>) -> usize {
    limit.unwrap_or(50).min(MAX_PAGE) as usize
}
