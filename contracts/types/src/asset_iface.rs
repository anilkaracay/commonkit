//! Types the asset contract exposes to commons (CONTRACT_SPEC §3.1).
//!
//! | Method (on asset) | Args              | Access                   | Returns |
//! | :---------------- | :---------------- | :----------------------- | :------ |
//! | `sync_roles`      | [`SyncRolesArgs`] | predecessor == commons_id | `bool` (applied) |
//!
//! `sync_roles` ignores a push whose `version <= roles_version` (returns `false`, emits nothing).
//! Otherwise every `(account, roles)` pair replaces that account's roles; an empty list removes
//! the account (tombstone, DECISIONS D-302). Commons sends the full snapshot on every push.

use near_sdk::json_types::U64;
use near_sdk::{near, AccountId};

use crate::commons_iface::Role;

/// Method name on the asset contract that commons calls.
pub const METHOD_SYNC_ROLES: &str = "sync_roles";

/// Upper bound on `SyncRolesArgs::updates` accepted by the asset (matches commons
/// `MAX_ROLE_ACCOUNTS`).
pub const MAX_ROLE_UPDATES: usize = 100;

/// One account's full role list. JSON: `["alice.testnet", ["steward", "verifier"]]`.
pub type RoleUpdate = (AccountId, Vec<Role>);

/// Args of `asset.sync_roles`.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SyncRolesArgs {
    pub updates: Vec<RoleUpdate>,
    pub version: U64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::serde_json;

    #[test]
    fn sync_roles_json_shape() {
        let args = SyncRolesArgs {
            updates: vec![
                ("alice.testnet".parse().unwrap(), vec!["steward".to_string()]),
                ("bob.testnet".parse().unwrap(), vec![]),
            ],
            version: U64(3),
        };
        let v = serde_json::to_value(&args).unwrap();
        assert_eq!(v["version"], "3");
        assert_eq!(v["updates"][0][0], "alice.testnet");
        assert_eq!(v["updates"][0][1][0], "steward");
        assert_eq!(v["updates"][1][1].as_array().unwrap().len(), 0);
    }
}
