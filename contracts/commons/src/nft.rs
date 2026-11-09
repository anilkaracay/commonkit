//! NEP-171 / NEP-177 / NEP-181 surface for non-transferable cards (CONTRACT_SPEC §5.1).
//!
//! Transfer and approval methods take no arguments and always panic with `E_NON_TRANSFERABLE`,
//! so the panic message is the same whatever a wallet sends. Token metadata is computed from the
//! card at view time (never stored), with a small inline SVG as `media`.

use crate::*;
use commonkit_types::commons_iface::RightStatus;
use near_sdk::base64::Engine;
use near_sdk::json_types::U128;

pub const NFT_STANDARD: &str = "nep171";
pub const NFT_STANDARD_VERSION: &str = "1.0.0";
const NON_TRANSFERABLE: &str = "E_NON_TRANSFERABLE: COMMONKIT cards cannot be transferred";

/// NEP-171 `nft_mint` event (standard `nep171`) so explorers and wallets index the cards.
pub(crate) fn emit_nft_mint(owner_id: &AccountId, token_ids: &[TokenId], memo: &str) {
    let envelope = json!({
        "standard": NFT_STANDARD,
        "version": NFT_STANDARD_VERSION,
        "event": "nft_mint",
        "data": [{ "owner_id": owner_id, "token_ids": token_ids, "memo": memo }],
    });
    env::log_str(&format!("EVENT_JSON:{envelope}"));
}

#[near]
impl CommonsContract {
    // ---- NEP-171 core ----

    pub fn nft_token(&self, token_id: TokenId) -> Option<JsonToken> {
        self.tokens.get(&token_id).map(|c| self.json_token(c))
    }

    #[payable]
    pub fn nft_transfer(&mut self) {
        env::panic_str(NON_TRANSFERABLE);
    }

    #[payable]
    pub fn nft_transfer_call(&mut self) {
        env::panic_str(NON_TRANSFERABLE);
    }

    // ---- NEP-178 approvals (all refused) ----

    #[payable]
    pub fn nft_approve(&mut self) {
        env::panic_str(NON_TRANSFERABLE);
    }

    #[payable]
    pub fn nft_revoke(&mut self) {
        env::panic_str(NON_TRANSFERABLE);
    }

    #[payable]
    pub fn nft_revoke_all(&mut self) {
        env::panic_str(NON_TRANSFERABLE);
    }

    pub fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        let _ = (token_id, approved_account_id, approval_id);
        false
    }

    // ---- NEP-177 metadata ----

    pub fn nft_metadata(&self) -> NftContractMetadata {
        self.metadata.clone()
    }

    // ---- NEP-181 enumeration ----

    pub fn nft_total_supply(&self) -> U128 {
        U128(u128::from(self.tokens.len()))
    }

    pub fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<JsonToken> {
        let start = from_index.map_or(0, |i| usize::try_from(i.0).unwrap_or(usize::MAX));
        self.tokens
            .values()
            .skip(start)
            .take(page_limit(limit))
            .map(|c| self.json_token(c))
            .collect()
    }

    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        U128(
            self.tokens_by_owner
                .get(&account_id)
                .map_or(0, |ids| ids.len() as u128),
        )
    }

    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<JsonToken> {
        let start = from_index.map_or(0, |i| usize::try_from(i.0).unwrap_or(usize::MAX));
        let Some(ids) = self.tokens_by_owner.get(&account_id) else {
            return Vec::new();
        };
        ids.iter()
            .skip(start)
            .take(page_limit(limit))
            .filter_map(|id| self.tokens.get(id))
            .map(|c| self.json_token(c))
            .collect()
    }
}

impl CommonsContract {
    pub(crate) fn json_token(&self, card: &Card) -> JsonToken {
        JsonToken {
            token_id: card.token_id.clone(),
            owner_id: card.owner_id.clone(),
            metadata: Some(self.token_metadata(card)),
            approved_account_ids: Default::default(),
        }
    }

    pub(crate) fn token_metadata(&self, card: &Card) -> TokenMetadata {
        let now = env::block_timestamp();
        let expired = card.is_expired(now);
        let (title, description, label, status, color, extra) = match &card.kind {
            CardKind::UsageRight {
                group_id,
                max_slots,
                source,
                status,
            } => {
                let origin = match source {
                    commonkit_types::commons_iface::RightSource::Maintenance { asset, task_id } => {
                        format!("maintenance task #{} on {}", task_id.0, asset)
                    }
                    commonkit_types::commons_iface::RightSource::Training { training_id } => {
                        format!("training #{}", training_id.0)
                    }
                };
                let (state, color) = match (status, expired) {
                    (RightStatus::Active, false) => ("active", "#0f766e"),
                    (RightStatus::Active, true) => ("expired", "#6b7280"),
                    (RightStatus::Locked { .. }, _) => ("locked", "#b45309"),
                    (RightStatus::Consumed { .. }, _) => ("used", "#6b7280"),
                };
                (
                    format!("{} · {} access", self.name, group_id),
                    format!(
                        "Non-transferable usage right for any asset in group '{group_id}' of {}. \
                         Covers up to {max_slots} slot(s). Earned by {origin}.",
                        self.name
                    ),
                    format!("{group_id} · {max_slots} slot(s)"),
                    state,
                    color,
                    json!({
                        "kind": "usage_right",
                        "group_id": group_id,
                        "max_slots": max_slots,
                        "source": source,
                        "status": status,
                        "expired": expired,
                    }),
                )
            }
            CardKind::Credential {
                kind,
                issued_by_training,
                suspended,
            } => {
                let (state, color) = match (*suspended, expired) {
                    (true, _) => ("suspended", "#b91c1c"),
                    (false, true) => ("expired", "#6b7280"),
                    (false, false) => ("valid", "#1d4ed8"),
                };
                (
                    format!("{} credential", humanize(kind)),
                    format!(
                        "Non-transferable {} credential in {}, issued by training #{} after \
                         approval by an independent verifier.",
                        humanize(kind),
                        self.name,
                        issued_by_training.0
                    ),
                    kind.clone(),
                    state,
                    color,
                    json!({
                        "kind": "credential",
                        "credential_kind": kind,
                        "training_id": issued_by_training,
                        "suspended": suspended,
                        "expired": expired,
                    }),
                )
            }
        };
        TokenMetadata {
            media: Some(svg_data_uri(&title, &label, status, color)),
            title: Some(title),
            description: Some(description),
            media_hash: None,
            copies: Some(1),
            issued_at: Some((card.issued_at.0 / 1_000_000).to_string()),
            expires_at: card.expires_at.map(|e| (e.0 / 1_000_000).to_string()),
            starts_at: None,
            updated_at: None,
            extra: Some(extra.to_string()),
            reference: None,
            reference_hash: None,
        }
    }
}

/// `"laser_safety"` → `"Laser safety"`.
pub(crate) fn humanize(id: &str) -> String {
    let spaced = id.replace(['_', '-'], " ");
    let mut chars = spaced.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// Small card image as a base64 SVG data URI (well under 1 KB before encoding).
pub(crate) fn svg_data_uri(title: &str, label: &str, status: &str, color: &str) -> String {
    let svg = format!(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 200'>\
<rect width='320' height='200' rx='18' fill='{color}'/>\
<text x='20' y='36' font-family='sans-serif' font-size='14' fill='#ffffffcc'>COMMONKIT · non-transferable</text>\
<text x='20' y='92' font-family='sans-serif' font-size='18' font-weight='bold' fill='#fff'>{title}</text>\
<text x='20' y='124' font-family='sans-serif' font-size='14' fill='#fff'>{label}</text>\
<text x='20' y='176' font-family='sans-serif' font-size='16' font-weight='bold' fill='#fff'>{status}</text>\
</svg>",
        title = xml_escape(&truncate(title, 34)),
        label = xml_escape(&truncate(label, 40)),
        status = xml_escape(&status.to_uppercase()),
    );
    format!(
        "data:image/svg+xml;base64,{}",
        near_sdk::base64::engine::general_purpose::STANDARD.encode(svg)
    )
}

fn truncate(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        s.to_string()
    } else {
        let mut t: String = s.chars().take(max_chars - 1).collect();
        t.push('…');
        t
    }
}
