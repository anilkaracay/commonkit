//! Init-time wiring and DAO governance (CONTRACT_SPEC §3.1).

use commonkit_types::asset_iface::MAX_ROLE_UPDATES;
use commonkit_types::commons_iface::{Role, ALL_ROLES};
use near_sdk::json_types::U64;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId};

use crate::profile::validate_profile;
use crate::types::{Profile, Trigger};
use crate::{AssetContract, AssetContractExt};

/// Same trigger kind and, for Metric, the same metric: the stored baseline stays meaningful.
fn same_trigger_basis(a: &Trigger, b: &Trigger) -> bool {
    match (a, b) {
        (Trigger::Metric { metric: m1, .. }, Trigger::Metric { metric: m2, .. }) => m1 == m2,
        (Trigger::Schedule { .. }, Trigger::Schedule { .. }) => true,
        (Trigger::Report { .. }, Trigger::Report { .. }) => true,
        _ => false,
    }
}

#[near]
impl AssetContract {
    /// DAO. Replaces the profile. Existing reservations, rights and tasks keep the values they
    /// were created with.
    pub fn set_profile(&mut self, profile: Profile) {
        self.assert_dao();
        validate_profile(&profile);
        // A rule whose trigger changed kind (or metric) restarts its baseline (verifier #7).
        for rule in profile.rules.iter() {
            let changed = self
                .profile
                .rules
                .iter()
                .find(|old| old.rule_id == rule.rule_id)
                .map(|old| !same_trigger_basis(&old.trigger, &rule.trigger))
                .unwrap_or(false);
            if changed {
                self.reset_rule_baseline(&rule.rule_id, &rule.trigger);
            }
        }
        self.profile = profile;
        self.profile_version += 1;
        self.emit(
            "profile_updated",
            json!({ "profile_version": self.profile_version }),
        );
        self.maybe_sweep();
    }

    /// DAO. Sets or clears (`null`) the bridge and the agent.
    pub fn set_operators(&mut self, bridge_id: Option<AccountId>, agent_id: Option<AccountId>) {
        self.assert_dao();
        self.bridge_id = bridge_id;
        self.agent_id = agent_id;
        self.emit(
            "operators_updated",
            json!({ "bridge_id": self.bridge_id, "agent_id": self.agent_id }),
        );
    }

    /// ANY (normally the DAO via a FunctionCall proposal). The attached deposit first tops up
    /// the storage reserve, the rest becomes float; anything above `float_cap` is swept back.
    #[payable]
    pub fn fund_float(&mut self) {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "E_WRONG_AMOUNT: attach a deposit");
        let before = self.ledger.float_free;
        self.reconcile();
        let to_float = self.ledger.float_free - before;
        self.emit(
            "float_funded",
            json!({
                "from": env::predecessor_account_id(),
                "amount": amount.to_string(),
                "to_float": to_float.to_string(),
                "to_storage_reserve": amount.saturating_sub(to_float).to_string(),
            }),
        );
        self.maybe_sweep();
    }

    /// DAO. Starts a new hardware epoch: the next telemetry report may decrease counters, and
    /// baselines of decreased metrics restart at 0 (D-206).
    pub fn set_telemetry_epoch(&mut self, epoch: U64) {
        self.assert_dao();
        require!(
            epoch.0 > self.telemetry.epoch.0,
            "E_INVALID_ARGS: epoch must increase"
        );
        self.telemetry.epoch = epoch;
        self.telemetry.reset_pending = true;
        self.emit("telemetry_epoch_set", json!({ "epoch": epoch }));
    }

    /// COMMONS. Applies a full role snapshot. Ignored (returns false) when
    /// `version <= roles_version`. An empty role list removes the account.
    pub fn sync_roles(&mut self, updates: Vec<(AccountId, Vec<Role>)>, version: U64) -> bool {
        self.assert_commons();
        if version.0 <= self.roles_version {
            return false;
        }
        require!(
            updates.len() <= MAX_ROLE_UPDATES,
            "E_INVALID_ARGS: too many role updates"
        );
        for (account, roles) in updates.iter() {
            let valid: Vec<Role> = roles
                .iter()
                .filter(|r| ALL_ROLES.contains(&r.as_str()))
                .cloned()
                .collect();
            if valid.is_empty() {
                self.roles.remove(account);
            } else {
                self.roles.insert(account.clone(), valid);
            }
        }
        self.roles_version = version.0;
        self.emit(
            "roles_synced",
            json!({ "version": version, "accounts": updates.len() }),
        );
        true
    }
}
