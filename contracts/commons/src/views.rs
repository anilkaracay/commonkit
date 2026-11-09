//! Views (CONTRACT_SPEC §5.2).

use crate::*;

#[near]
impl CommonsContract {
    pub fn version(&self) -> String {
        CONTRACT_VERSION.to_string()
    }

    pub fn get_wiring(&self) -> Wiring {
        Wiring {
            dao_id: self.dao_id.clone(),
            name: self.name.clone(),
            roles_version: U64(self.roles_version),
            next_training_id: U64(self.next_training_id),
            next_token_seq: U64(self.next_token_seq),
            total_supply: U64(u64::from(self.tokens.len())),
            version: CONTRACT_VERSION.to_string(),
        }
    }

    pub fn get_assets(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<AssetView> {
        self.assets
            .iter()
            .skip(from_index.unwrap_or(0) as usize)
            .take(page_limit(limit))
            .map(|(id, e)| AssetView {
                asset_id: id.clone(),
                entry: e.clone(),
            })
            .collect()
    }

    pub fn get_asset(&self, asset_id: AccountId) -> Option<AssetEntry> {
        self.assets.get(&asset_id).cloned()
    }

    /// Assets currently registered in `group_id` (empty if unknown).
    pub fn get_group(&self, group_id: GroupId) -> Vec<AccountId> {
        self.groups.get(&group_id).cloned().unwrap_or_default()
    }

    pub fn get_groups(&self) -> Vec<GroupId> {
        self.groups.keys().cloned().collect()
    }

    pub fn get_roles(&self, account: AccountId) -> Vec<Role> {
        self.roles.get(&account).cloned().unwrap_or_default()
    }

    /// All role entries, including tombstones (`roles: []`) of accounts whose roles were removed.
    pub fn get_all_roles(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<RoleEntry> {
        self.roles
            .iter()
            .skip(from_index.unwrap_or(0) as usize)
            .take(page_limit(limit))
            .map(|(a, r)| RoleEntry {
                account_id: a.clone(),
                roles: r.clone(),
            })
            .collect()
    }

    pub fn get_credential_kinds(&self) -> Vec<CredentialKindConfig> {
        self.credential_kinds.values().cloned().collect()
    }

    pub fn get_training(&self, training_id: U64) -> Option<Training> {
        self.trainings.get(&training_id.0).cloned()
    }

    pub fn get_trainings(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<Training> {
        self.trainings
            .values()
            .skip(from_index.unwrap_or(0) as usize)
            .take(page_limit(limit))
            .cloned()
            .collect()
    }

    /// True if `account` holds a credential card of `kind` that is neither suspended nor expired.
    pub fn has_credential(&self, account: AccountId, kind: CredentialKind) -> bool {
        self.valid_credential(&account, &kind, env::block_timestamp())
            .is_some()
    }

    /// Typed cards of `account` (all of them; an account holds few cards).
    pub fn get_cards_for_owner(&self, account: AccountId) -> Vec<CardView> {
        let now = env::block_timestamp();
        self.tokens_by_owner
            .get(&account)
            .map(|ids| {
                ids.iter()
                    .filter_map(|id| self.tokens.get(id))
                    .map(|c| CardView {
                        card: c.clone(),
                        expired: c.is_expired(now),
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn get_card(&self, token_id: TokenId) -> Option<CardView> {
        let now = env::block_timestamp();
        self.tokens.get(&token_id).map(|c| CardView {
            card: c.clone(),
            expired: c.is_expired(now),
        })
    }

    /// Token ids minted for `key` (`"<asset>:<task_id>"` or `"training:<id>"`), if any.
    pub fn get_mint_receipt(&self, key: String) -> Option<Vec<TokenId>> {
        self.mint_receipts.get(&key).cloned()
    }
}
