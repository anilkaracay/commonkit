//! Profile validation (CONTRACT_SPEC §2.1). Mirrored by `profiles/profile.schema.json`.

use commonkit_types::commons_iface::MAX_MINT_PER_CALL;
use near_sdk::require;

use crate::types::{Profile, Trigger};

/// Upper bound on `protocol_fee_bps` (2 %).
pub const PROTOCOL_FEE_MAX_BPS: u16 = 200;
pub const MAX_ID_LEN: usize = 64;
pub const MAX_TITLE_LEN: usize = 200;
pub const MAX_METRIC_NAME_LEN: usize = 32;
pub const MAX_RULES: usize = 16;

fn check_id(value: &str, max: usize) {
    require!(
        !value.is_empty() && value.len() <= max,
        "E_INVALID_PROFILE: empty or too long identifier"
    );
}

fn check_title(value: &str) {
    require!(
        !value.is_empty() && value.chars().count() <= MAX_TITLE_LEN,
        "E_INVALID_PROFILE: empty or too long title"
    );
}

/// Panics with `E_INVALID_PROFILE` on the first violated rule.
pub fn validate_profile(p: &Profile) {
    check_id(&p.asset_type, MAX_ID_LEN);
    check_title(&p.display_name);
    check_id(&p.group_id, MAX_ID_LEN);
    check_id(&p.adapter, MAX_ID_LEN);
    check_id(&p.usage_unit_label, MAX_ID_LEN);
    if let Some(kind) = &p.required_credential {
        check_id(kind, MAX_ID_LEN);
    }
    require!(
        p.slot_minutes > 0,
        "E_INVALID_PROFILE: slot_minutes must be > 0"
    );
    require!(
        p.max_slots_per_reservation > 0,
        "E_INVALID_PROFILE: max_slots_per_reservation must be > 0"
    );
    require!(
        p.booking_horizon_days > 0,
        "E_INVALID_PROFILE: booking_horizon_days must be > 0"
    );
    require!(
        p.start_window_minutes > 0,
        "E_INVALID_PROFILE: start_window_minutes must be > 0"
    );
    require!(
        p.float_cap.0 > 0,
        "E_INVALID_PROFILE: float_cap must be > 0"
    );
    require!(
        p.deposit_trusted.0 <= p.deposit.0,
        "E_INVALID_PROFILE: deposit_trusted must be <= deposit"
    );
    require!(
        p.period_days > 0,
        "E_INVALID_PROFILE: period_days must be > 0"
    );
    require!(
        p.right_max_slots > 0,
        "E_INVALID_PROFILE: right_max_slots must be > 0"
    );
    require!(
        p.protocol_fee_bps <= PROTOCOL_FEE_MAX_BPS,
        "E_INVALID_PROFILE: protocol_fee_bps above maximum"
    );
    require!(
        p.protocol_fee_bps == 0 || p.protocol_fee_receiver.is_some(),
        "E_INVALID_PROFILE: protocol_fee_receiver required when protocol_fee_bps > 0"
    );
    require!(
        p.rules.len() <= MAX_RULES,
        "E_INVALID_PROFILE: too many rules"
    );
    for (i, rule) in p.rules.iter().enumerate() {
        check_id(&rule.rule_id, MAX_ID_LEN);
        check_title(&rule.title);
        match &rule.trigger {
            Trigger::Metric { metric, threshold } => {
                check_id(metric, MAX_METRIC_NAME_LEN);
                require!(*threshold > 0, "E_INVALID_PROFILE: threshold must be > 0");
            }
            Trigger::Schedule { every_hours } => {
                require!(
                    *every_hours > 0,
                    "E_INVALID_PROFILE: every_hours must be > 0"
                );
            }
            Trigger::Report { min_reports } => {
                require!(
                    *min_reports >= 1,
                    "E_INVALID_PROFILE: min_reports must be >= 1"
                );
            }
        }
        require!(
            p.rules[..i].iter().all(|r| r.rule_id != rule.rule_id),
            "E_INVALID_PROFILE: duplicate rule_id"
        );
        require!(
            rule.reward_cash.0 <= p.auto_reward_cash_cap.0,
            "E_INVALID_PROFILE: reward_cash above auto_reward_cash_cap"
        );
        require!(
            rule.reimbursable_max.0 == 0 || rule.kind.reimbursable(),
            "E_INVALID_PROFILE: reimbursable_max only for Restock or Repair rules"
        );
        require!(
            rule.reward_rights <= MAX_MINT_PER_CALL,
            "E_INVALID_PROFILE: reward_rights above mint limit"
        );
        require!(
            rule.claim_timeout_hours > 0,
            "E_INVALID_PROFILE: claim_timeout_hours must be > 0"
        );
    }
}
