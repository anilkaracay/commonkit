//! Usage rights: authorize/lock, release, finalize, idempotent mint (CONTRACT_SPEC §5).
//!
//! The only transitions of a usage right are Active → Locked (authorize, by a registered asset in
//! the right's group, for the right's owner), Locked → Active (release) and Locked → Consumed
//! (finalize), the last two only by the asset that holds the lock. Nothing else writes `status`.

use crate::*;
use commonkit_types::commons_iface::{
    AuthResult, RightSource, RightStatus, MAX_MINT_PER_CALL, REASON_ASSET_NOT_REGISTERED,
    REASON_CREDENTIAL_MISSING, REASON_RIGHT_EXPIRED, REASON_RIGHT_NOT_ACTIVE,
    REASON_RIGHT_WRONG_GROUP, REASON_TOO_MANY_SLOTS, REASON_UNAUTHORIZED,
};

#[near]
impl CommonsContract {
    /// Called by a registered asset while a reservation holds its slots. Never panics on business
    /// failures: returns `ok=false` with a reason code so the asset can refund.
    pub fn authorize_reservation(
        &mut self,
        holder: AccountId,
        asset: AccountId,
        credential: Option<CredentialKind>,
        right_id: Option<TokenId>,
        reservation_id: U64,
        slots: u32,
    ) -> AuthResult {
        let caller = env::predecessor_account_id();
        let Some(entry) = self.assets.get(&caller).cloned() else {
            env::panic_str("E_ASSET_NOT_REGISTERED: caller is not a registered asset");
        };
        require!(
            asset == caller,
            "E_UNAUTHORIZED: asset must be the calling account"
        );
        if !entry.active {
            return deny(REASON_ASSET_NOT_REGISTERED);
        }
        let now = env::block_timestamp();

        let credential_token_id = match &credential {
            Some(kind) => match self.valid_credential(&holder, kind, now) {
                Some(id) => Some(id),
                None => return deny(REASON_CREDENTIAL_MISSING),
            },
            None => None,
        };

        let Some(token_id) = right_id else {
            return AuthResult {
                ok: true,
                reason: None,
                credential_token_id,
                locked_right_id: None,
            };
        };
        let Some(card) = self.tokens.get_mut(&token_id) else {
            return deny(REASON_RIGHT_NOT_ACTIVE);
        };
        if card.owner_id != holder {
            return deny(REASON_UNAUTHORIZED);
        }
        let expired = card.is_expired(now);
        let CardKind::UsageRight {
            group_id,
            max_slots,
            status,
            ..
        } = &mut card.kind
        else {
            return deny(REASON_RIGHT_NOT_ACTIVE);
        };
        if *status != RightStatus::Active {
            return deny(REASON_RIGHT_NOT_ACTIVE);
        }
        if expired {
            return deny(REASON_RIGHT_EXPIRED);
        }
        if *group_id != entry.group_id {
            return deny(REASON_RIGHT_WRONG_GROUP);
        }
        if slots == 0 || slots > *max_slots {
            return deny(REASON_TOO_MANY_SLOTS);
        }
        *status = RightStatus::Locked {
            asset: caller.clone(),
            reservation_id,
        };
        emit_event(
            "right_locked",
            json!({
                "token_id": token_id,
                "owner_id": holder,
                "asset_id": caller,
                "reservation_id": reservation_id,
            }),
        );
        AuthResult {
            ok: true,
            reason: None,
            credential_token_id,
            locked_right_id: Some(token_id),
        }
    }

    /// Locked{caller, reservation_id} → Active. Returns `false` (no-op) if already Active.
    pub fn release_right(&mut self, token_id: TokenId, reservation_id: U64) -> bool {
        self.unlock(token_id, reservation_id, false)
    }

    /// Locked{caller, reservation_id} → Consumed. Returns `false` (no-op) if already Consumed by
    /// the same asset and reservation.
    pub fn finalize_right(&mut self, token_id: TokenId, reservation_id: U64) -> bool {
        self.unlock(token_id, reservation_id, true)
    }

    /// Mint `count` usage rights for a maintenance task, exactly once per `(asset, task_id)`.
    /// A repeated call returns the ids minted by the first call and mints nothing.
    pub fn mint_rights(
        &mut self,
        holder: AccountId,
        count: u32,
        max_slots: u32,
        validity_days: u32,
        source: RightSource,
    ) -> Vec<TokenId> {
        let caller = env::predecessor_account_id();
        let Some(entry) = self.assets.get(&caller).cloned() else {
            env::panic_str("E_ASSET_NOT_REGISTERED: caller is not a registered asset");
        };
        let task_id = match &source {
            RightSource::Maintenance { asset, task_id } if *asset == caller => *task_id,
            _ => env::panic_str("E_UNAUTHORIZED: source must be Maintenance on the calling asset"),
        };
        let key = source.receipt_key();
        if let Some(ids) = self.mint_receipts.get(&key) {
            return ids.clone();
        }
        require!(
            entry.active,
            "E_ASSET_NOT_REGISTERED: asset is inactive; mints are rejected"
        );
        require!(
            (1..=MAX_MINT_PER_CALL).contains(&count),
            "E_INVALID_ARGS: count must be between 1 and 10"
        );
        require!(
            max_slots >= 1,
            "E_INVALID_ARGS: max_slots must be at least 1"
        );
        require_validity_days(validity_days, "validity_days");

        let ids = self.mint_usage_rights(
            &holder,
            &entry.group_id,
            count,
            max_slots,
            validity_days,
            &source,
        );
        self.mint_receipts.insert(key, ids.clone());
        emit_event(
            "rights_minted",
            json!({
                "owner_id": holder,
                "group_id": entry.group_id,
                "token_ids": ids,
                "source": source,
                "asset_id": caller,
                "task_id": task_id,
            }),
        );
        ids
    }
}

fn deny(reason: &str) -> AuthResult {
    AuthResult {
        ok: false,
        reason: Some(reason.to_string()),
        credential_token_id: None,
        locked_right_id: None,
    }
}

impl CommonsContract {
    fn unlock(&mut self, token_id: TokenId, reservation_id: U64, consume: bool) -> bool {
        let caller = env::predecessor_account_id();
        let Some(card) = self.tokens.get_mut(&token_id) else {
            env::panic_str("E_NOT_FOUND: unknown token");
        };
        let owner_id = card.owner_id.clone();
        let CardKind::UsageRight { status, .. } = &mut card.kind else {
            env::panic_str("E_BAD_STATE: token is not a usage right");
        };
        let locked_by_caller = RightStatus::Locked {
            asset: caller.clone(),
            reservation_id,
        };
        let consumed_by_caller = RightStatus::Consumed {
            asset: caller.clone(),
            reservation_id,
        };
        if *status == locked_by_caller {
            *status = if consume {
                consumed_by_caller
            } else {
                RightStatus::Active
            };
            emit_event(
                if consume {
                    "right_consumed"
                } else {
                    "right_released"
                },
                json!({
                    "token_id": token_id,
                    "owner_id": owner_id,
                    "asset_id": caller,
                    "reservation_id": reservation_id,
                }),
            );
            return true;
        }
        let already_done = if consume {
            *status == consumed_by_caller
        } else {
            *status == RightStatus::Active
        };
        require!(
            already_done,
            "E_BAD_STATE: right is not locked by this asset and reservation"
        );
        false
    }

    /// Mint usage-right cards; emits NEP-171 `nft_mint`. Caller records the receipt.
    pub(crate) fn mint_usage_rights(
        &mut self,
        holder: &AccountId,
        group_id: &GroupId,
        count: u32,
        max_slots: u32,
        validity_days: u32,
        source: &RightSource,
    ) -> Vec<TokenId> {
        let now = env::block_timestamp();
        let mut ids = Vec::with_capacity(count as usize);
        for _ in 0..count {
            let token_id = format!("right-{}", self.next_seq());
            self.insert_card(Card {
                token_id: token_id.clone(),
                owner_id: holder.clone(),
                kind: CardKind::UsageRight {
                    group_id: group_id.clone(),
                    max_slots,
                    source: source.clone(),
                    status: RightStatus::Active,
                },
                issued_at: U64(now),
                expires_at: expiry_from_days(now, validity_days),
            });
            ids.push(token_id);
        }
        nft::emit_nft_mint(holder, &ids, &source.receipt_key());
        ids
    }

    pub(crate) fn insert_card(&mut self, card: Card) {
        self.tokens_by_owner
            .entry(card.owner_id.clone())
            .or_default()
            .push(card.token_id.clone());
        self.tokens.insert(card.token_id.clone(), card);
    }

    /// First credential card of `kind` held by `account` that is neither suspended nor expired.
    pub(crate) fn valid_credential(
        &self,
        account: &AccountId,
        kind: &str,
        now: u64,
    ) -> Option<TokenId> {
        let ids = self.tokens_by_owner.get(account)?;
        ids.iter()
            .find(|id| {
                self.tokens.get(*id).is_some_and(|card| {
                    !card.is_expired(now)
                        && matches!(&card.kind, CardKind::Credential { kind: k, suspended, .. }
                            if k == kind && !*suspended)
                })
            })
            .cloned()
    }
}
