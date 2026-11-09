# COVERAGE — method → tests

TEST_PLAN §3. One section per contract; each engineer edits only their own section.

## commons (unit: `cargo test -p commonkit-commons`, file `contracts/commons/src/tests/<area>.rs`)

Sandbox tests (M1c) are not written yet; `inv_*` names below are the unit-level versions.

| Method | Unit tests |
| :--- | :--- |
| `new` | registry::new_sets_wiring, registry::new_rejects_bad_metadata_spec, registry::new_rejects_empty_name |
| `fund_storage` | registry::fund_storage_accepts_deposit, registry::fund_storage_requires_deposit |
| `register_asset` | registry::register_asset_adds_to_group_and_pushes_full_snapshot, registry::register_asset_requires_dao, registry::register_asset_rejects_bad_group_id, registry::register_asset_moves_group_and_reactivates |
| `deactivate_asset` | registry::deactivate_asset_marks_inactive, registry::deactivate_asset_requires_dao, registry::deactivate_asset_unknown, registry::deactivate_asset_twice |
| `set_roles` | registry::set_roles_bumps_version_and_pushes_to_active_assets_only, registry::set_roles_empty_keeps_tombstone_in_snapshot, registry::set_roles_requires_dao, registry::set_roles_rejects_unknown_role, registry::set_roles_caps_role_accounts, registry::push_without_gas_emits_role_sync_failed |
| `resync_roles` | registry::resync_roles_anyone_pushes_current_snapshot, registry::resync_roles_unknown_asset, registry::resync_roles_inactive_asset |
| `on_roles_synced` (private) | registry::on_roles_synced_failure_emits_event, registry::on_roles_synced_success_is_silent (`#[private]` check: sandbox, M1c) |
| `set_credential_kind` | credentials::set_credential_kind_upserts, credentials::set_credential_kind_requires_dao, credentials::set_credential_kind_rejects_bad_id, credentials::set_credential_kind_rejects_empty_title, credentials::set_credential_kind_rejects_zero_slots_with_rewards, credentials::set_credential_kind_caps_trainer_rewards, credentials::set_credential_kind_caps_validity, credentials::credential_kind_change_leaves_issued_cards_intact |
| `suspend_credential` | credentials::suspend_and_unsuspend_credential, credentials::suspend_credential_requires_dao, credentials::suspend_credential_requires_reason, credentials::suspend_credential_twice, credentials::suspend_credential_unknown_token, rights::suspend_usage_right_is_refused, rights::authorize_credential_suspended_denied |
| `unsuspend_credential` | credentials::suspend_and_unsuspend_credential, credentials::unsuspend_credential_not_suspended, credentials::unsuspend_credential_requires_dao |
| `authorize_reservation` | rights::authorize_without_requirements_ok, rights::authorize_requires_registered_caller, rights::authorize_asset_arg_must_be_caller, rights::authorize_inactive_asset_denied, rights::authorize_credential_missing_denied, rights::authorize_credential_held_ok, rights::authorize_credential_suspended_denied, rights::authorize_credential_expired_denied, rights::authorize_other_kind_credential_does_not_count, rights::authorize_right_locks_it, rights::authorize_right_and_credential_both_required, rights::authorize_right_of_other_owner_denied, rights::inv_rights_group_scope, rights::authorize_expired_right_denied, rights::authorize_locked_right_denied, rights::authorize_consumed_right_denied, rights::authorize_too_many_slots_denied, rights::authorize_unknown_or_credential_token_as_right_denied |
| `release_right` | rights::release_right_unlocks, rights::release_right_by_other_asset_rejected, rights::release_right_wrong_reservation_rejected, rights::release_right_after_consume_rejected, rights::release_right_unknown_token, rights::release_right_on_credential_rejected |
| `finalize_right` | rights::finalize_right_consumes_once, rights::finalize_right_by_other_asset_rejected, rights::finalize_active_right_rejected, rights::inv_no_retroactive_revocation_finalize_active_fails |
| `mint_rights` | rights::mint_rights_mints_cards_in_asset_group, rights::mint_rights_zero_validity_never_expires, rights::inv_exactly_once_mint_idempotent, rights::mint_rights_replay_works_after_deactivation, rights::mint_rights_inactive_asset_rejected, rights::mint_rights_unregistered_caller_rejected, rights::mint_rights_source_must_be_caller, rights::mint_rights_training_source_rejected, rights::mint_rights_zero_count_rejected, rights::mint_rights_count_cap, rights::mint_rights_zero_slots_rejected, rights::mint_rights_validity_cap |
| `propose_credential` | credentials::propose_credential_creates_training, credentials::propose_credential_requires_trainer, credentials::propose_credential_trainer_cannot_train_self, credentials::propose_credential_unknown_kind, credentials::propose_credential_bad_hash |
| `approve_credential` | credentials::approve_credential_mints_credential_and_trainer_rights, credentials::approve_credential_without_trainer_rewards, credentials::approve_credential_twice_mints_once, credentials::approve_credential_requires_verifier, credentials::approve_credential_trainer_cannot_approve, credentials::approve_credential_trainee_cannot_approve, credentials::inv_no_self_verification_training, credentials::approve_credential_unknown_training, credentials::approve_credential_after_reject |
| `reject_credential` | credentials::reject_credential_records_reason, credentials::reject_credential_requires_verifier, credentials::reject_credential_trainer_cannot_reject, credentials::reject_credential_requires_reason, credentials::reject_credential_after_approve, credentials::reject_credential_unknown_training |
| `nft_transfer` / `nft_transfer_call` / `nft_approve` | nft::inv_non_transferable_nft_transfer, nft::inv_non_transferable_nft_transfer_call, nft::inv_non_transferable_nft_approve |
| `nft_revoke` / `nft_revoke_all` / `nft_is_approved` | nft::nft_revoke_refused, nft::nft_revoke_all_refused, nft::nft_is_approved_always_false |
| `nft_token` | nft::nft_token_usage_right_metadata, nft::nft_token_status_follows_lifecycle, nft::nft_token_credential_metadata, nft::nft_token_unknown_is_none, nft::humanize_and_svg_escape |
| `nft_tokens` / `nft_total_supply` / `nft_supply_for_owner` / `nft_tokens_for_owner` | nft::nft_enumeration |
| `nft_metadata` | nft::nft_metadata_view, registry::new_sets_wiring |
| `version` / `get_wiring` | views::version_and_wiring, registry::new_sets_wiring |
| `get_assets` / `get_asset` / `get_group` / `get_groups` | views::get_assets_and_groups, registry::register_asset_moves_group_and_reactivates |
| `get_roles` / `get_all_roles` | views::get_roles_views, registry::set_roles_empty_keeps_tombstone_in_snapshot |
| `get_credential_kinds` | credentials::set_credential_kind_upserts |
| `get_training` / `get_trainings` | views::get_trainings_views, credentials::propose_credential_creates_training |
| `has_credential` | views::has_credential_and_cards_for_owner, credentials::suspend_and_unsuspend_credential |
| `get_cards_for_owner` / `get_card` | views::has_credential_and_cards_for_owner |
| `get_mint_receipt` | views::get_mint_receipt_view, rights::mint_rights_mints_cards_in_asset_group |

Invariants (unit level): `inv_no_retroactive_revocation` (rights), `inv_no_self_verification_training` (credentials), `inv_exactly_once_mint_idempotent` (rights; commons half of `inv_exactly_once_reward_retry`), `inv_rights_group_scope` (rights), `inv_non_transferable_*` (nft).
