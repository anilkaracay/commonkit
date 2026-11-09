//! Asset registry, groups and roles (CONTRACT_SPEC §5: register_asset, deactivate_asset,
//! set_roles, resync_roles). Role pushes carry the full snapshot (D-302).

use crate::*;
use commonkit_types::asset_iface::{SyncRolesArgs, METHOD_SYNC_ROLES};
use commonkit_types::commons_iface::ALL_ROLES;
use near_sdk::{is_promise_success, serde_json, NearToken, Promise};

#[near]
impl CommonsContract {
    /// DAO registers (or re-activates / moves) an asset into a group, then pushes the full role
    /// snapshot to it. Existing cards are never touched.
    pub fn register_asset(&mut self, asset_id: AccountId, group_id: GroupId) {
        self.assert_dao();
        require_id(&group_id, "group_id");

        let previous = self.assets.get(&asset_id).cloned();
        if let Some(prev) = &previous {
            if prev.group_id != group_id {
                self.remove_from_group(&prev.group_id, &asset_id);
            }
        }
        let members = self.groups.entry(group_id.clone()).or_default();
        if !members.contains(&asset_id) {
            members.push(asset_id.clone());
        }
        let registered_at = previous
            .as_ref()
            .map_or(U64(env::block_timestamp()), |p| p.registered_at);
        self.assets.insert(
            asset_id.clone(),
            AssetEntry {
                group_id: group_id.clone(),
                active: true,
                registered_at,
            },
        );
        emit_event(
            "asset_registered",
            json!({
                "asset_id": asset_id,
                "group_id": group_id,
                "previous_group_id": previous.as_ref().map(|p| p.group_id.clone()),
                "reactivated": previous.as_ref().is_some_and(|p| !p.active),
            }),
        );
        self.push_roles_to(&[asset_id]);
    }

    /// DAO stops an asset from authorizing new reservations or minting. Issued rights stay.
    pub fn deactivate_asset(&mut self, asset_id: AccountId) {
        self.assert_dao();
        let Some(entry) = self.assets.get_mut(&asset_id) else {
            env::panic_str("E_ASSET_NOT_REGISTERED: unknown asset");
        };
        require!(entry.active, "E_BAD_STATE: asset already inactive");
        entry.active = false;
        let group_id = entry.group_id.clone();
        emit_event(
            "asset_deactivated",
            json!({ "asset_id": asset_id, "group_id": group_id }),
        );
    }

    /// DAO sets an account's full role list (empty list removes all roles) and pushes the new
    /// snapshot to every active asset.
    pub fn set_roles(&mut self, account: AccountId, roles: Vec<Role>) {
        self.assert_dao();
        let mut clean: Vec<Role> = Vec::with_capacity(roles.len());
        for role in roles {
            if !ALL_ROLES.contains(&role.as_str()) {
                env::panic_str(&format!(
                    "E_INVALID_ARGS: unknown role {role}; expected one of {ALL_ROLES:?}"
                ));
            }
            if !clean.contains(&role) {
                clean.push(role);
            }
        }
        if !self.roles.contains_key(&account) {
            require!(
                self.roles.len() < MAX_ROLE_ACCOUNTS,
                "E_BAD_STATE: role registry is full"
            );
        }
        let previous = self.roles.insert(account.clone(), clean.clone());
        self.roles_version += 1;
        emit_event(
            "roles_set",
            json!({
                "account_id": account,
                "roles": clean,
                "previous_roles": previous.unwrap_or_default(),
                "roles_version": U64(self.roles_version),
            }),
        );
        let active: Vec<AccountId> = self
            .assets
            .iter()
            .filter(|(_, e)| e.active)
            .map(|(id, _)| id.clone())
            .collect();
        self.push_roles_to(&active);
    }

    /// Anyone can re-push the current full role snapshot to an active asset (e.g. after a
    /// `role_sync_failed` event). The asset ignores it if it already has this version.
    pub fn resync_roles(&mut self, asset_id: AccountId) {
        let active = self.assets.get(&asset_id).is_some_and(|e| e.active);
        require!(
            active,
            "E_ASSET_NOT_REGISTERED: asset is not registered or inactive"
        );
        self.push_roles_to(&[asset_id]);
    }

    /// Callback of a `sync_roles` push. Success needs no state change; failure is logged so
    /// anyone can call `resync_roles`.
    #[private]
    pub fn on_roles_synced(&mut self, asset_id: AccountId, version: U64) -> bool {
        let ok = is_promise_success();
        if !ok {
            emit_event(
                "role_sync_failed",
                json!({ "asset_id": asset_id, "roles_version": version, "reason": "promise_failed" }),
            );
        }
        ok
    }
}

impl CommonsContract {
    pub(crate) fn role_snapshot(&self) -> SyncRolesArgs {
        SyncRolesArgs {
            updates: self
                .roles
                .iter()
                .map(|(a, r)| (a.clone(), r.clone()))
                .collect(),
            version: U64(self.roles_version),
        }
    }

    /// Push the full snapshot to each asset, as long as gas allows; assets that cannot be reached
    /// in this call get a `role_sync_failed` event (reason `insufficient_gas`).
    fn push_roles_to(&self, assets: &[AccountId]) {
        if assets.is_empty() {
            return;
        }
        let snapshot = self.role_snapshot();
        let version = snapshot.version;
        let args = match serde_json::to_vec(&snapshot) {
            Ok(a) => a,
            Err(_) => env::panic_str("E_BAD_STATE: cannot encode role snapshot"),
        };
        let per_push = GAS_SYNC_ROLES.saturating_add(GAS_ON_ROLES_SYNCED);
        for asset_id in assets {
            let remaining = env::prepaid_gas().saturating_sub(env::used_gas());
            if remaining < per_push.saturating_add(GAS_PUSH_RESERVE) {
                emit_event(
                    "role_sync_failed",
                    json!({ "asset_id": asset_id, "roles_version": version, "reason": "insufficient_gas" }),
                );
                continue;
            }
            Promise::new(asset_id.clone())
                .function_call(
                    METHOD_SYNC_ROLES,
                    args.clone(),
                    NearToken::from_yoctonear(0),
                    GAS_SYNC_ROLES,
                )
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_ON_ROLES_SYNCED)
                        .on_roles_synced(asset_id.clone(), version),
                )
                .detach();
        }
    }

    fn remove_from_group(&mut self, group_id: &GroupId, asset_id: &AccountId) {
        if let Some(members) = self.groups.get_mut(group_id) {
            members.retain(|a| a != asset_id);
        }
    }
}
