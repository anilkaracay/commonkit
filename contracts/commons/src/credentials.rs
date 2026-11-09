//! Credential kinds, trainings and credential suspension (CONTRACT_SPEC §5).
//!
//! No self-verification: the trainer proposes, a different verifier approves; neither the trainer
//! nor the trainee can approve. Suspension is forward-only and never touches usage rights (D-005).

use crate::*;
use commonkit_types::commons_iface::{RightSource, ROLE_TRAINER, ROLE_VERIFIER};

#[near]
impl CommonsContract {
    /// DAO upserts a credential kind. Issued cards keep the values they were minted with.
    pub fn set_credential_kind(&mut self, config: CredentialKindConfig) {
        self.assert_dao();
        require_id(&config.kind, "kind");
        require_text(&config.title, MAX_TITLE_LEN, "title");
        require_id(&config.reward_group, "reward_group");
        require_validity_days(config.validity_days, "validity_days");
        require_validity_days(config.right_validity_days, "right_validity_days");
        require!(
            config.trainer_reward_rights <= commonkit_types::commons_iface::MAX_MINT_PER_CALL,
            "E_INVALID_ARGS: trainer_reward_rights must be at most 10"
        );
        require!(
            config.trainer_reward_rights == 0 || config.right_max_slots >= 1,
            "E_INVALID_ARGS: right_max_slots must be at least 1 when rights are rewarded"
        );
        let created = self
            .credential_kinds
            .insert(config.kind.clone(), config.clone())
            .is_none();
        emit_event(
            "credential_kind_set",
            json!({ "kind": config.kind, "config": config, "created": created }),
        );
    }

    /// DAO suspends a credential card (safety). Forward-only, with a recorded reason; usage rights
    /// cannot be suspended (`E_NO_REVOCATION`).
    pub fn suspend_credential(&mut self, token_id: TokenId, reason: String) {
        self.set_suspended(token_id, reason, true);
    }

    /// DAO lifts a suspension, with a recorded reason.
    pub fn unsuspend_credential(&mut self, token_id: TokenId, reason: String) {
        self.set_suspended(token_id, reason, false);
    }

    /// A trainer proposes that `trainee` has completed training for `kind`.
    pub fn propose_credential(
        &mut self,
        trainee: AccountId,
        kind: CredentialKind,
        notes_hash: Option<String>,
    ) -> U64 {
        let trainer = env::predecessor_account_id();
        self.assert_role(&trainer, ROLE_TRAINER);
        require!(
            trainer != trainee,
            "E_SELF_VERIFY: a trainer cannot train themselves"
        );
        require!(
            self.credential_kinds.contains_key(&kind),
            "E_INVALID_ARGS: unknown credential kind"
        );
        if let Some(h) = &notes_hash {
            require_hex_hash(h, "notes_hash");
        }
        let id = self.next_training_id;
        self.next_training_id += 1;
        let training = Training {
            id: U64(id),
            trainer: trainer.clone(),
            trainee: trainee.clone(),
            kind: kind.clone(),
            notes_hash: notes_hash.clone(),
            status: TrainingStatus::Proposed,
            approver: None,
            minted: Vec::new(),
            created_at: U64(env::block_timestamp()),
        };
        self.trainings.insert(id, training);
        emit_event(
            "training_proposed",
            json!({
                "training_id": U64(id),
                "trainer": trainer,
                "trainee": trainee,
                "kind": kind,
                "notes_hash": notes_hash,
            }),
        );
        U64(id)
    }

    /// An independent verifier approves a training: mints the credential card to the trainee and
    /// `trainer_reward_rights` usage rights to the trainer, exactly once (receipt `training:<id>`).
    pub fn approve_credential(&mut self, training_id: U64) -> Vec<TokenId> {
        let approver = env::predecessor_account_id();
        self.assert_role(&approver, ROLE_VERIFIER);
        let training = self.training_or_panic(training_id.0);
        require!(
            approver != training.trainer,
            "E_SELF_VERIFY: the trainer cannot approve their own training"
        );
        require!(
            approver != training.trainee,
            "E_SELF_VERIFY: the trainee cannot approve their own credential"
        );
        let source = RightSource::Training { training_id };
        let key = source.receipt_key();
        if let Some(ids) = self.mint_receipts.get(&key) {
            return ids.clone();
        }
        require!(
            training.status == TrainingStatus::Proposed,
            "E_BAD_STATE: training is not proposed"
        );
        let Some(config) = self.credential_kinds.get(&training.kind).cloned() else {
            env::panic_str("E_INVALID_ARGS: unknown credential kind");
        };

        let now = env::block_timestamp();
        let cred_id = format!("cred-{}", self.next_seq());
        self.insert_card(Card {
            token_id: cred_id.clone(),
            owner_id: training.trainee.clone(),
            kind: CardKind::Credential {
                kind: training.kind.clone(),
                issued_by_training: training_id,
                suspended: false,
            },
            issued_at: U64(now),
            expires_at: expiry_from_days(now, config.validity_days),
        });
        nft::emit_nft_mint(&training.trainee, std::slice::from_ref(&cred_id), &key);

        let trainer_rights = if config.trainer_reward_rights > 0 {
            self.mint_usage_rights(
                &training.trainer,
                &config.reward_group,
                config.trainer_reward_rights,
                config.right_max_slots,
                config.right_validity_days,
                &source,
            )
        } else {
            Vec::new()
        };

        let mut minted = vec![cred_id.clone()];
        minted.extend(trainer_rights.iter().cloned());
        self.mint_receipts.insert(key, minted.clone());
        if let Some(t) = self.trainings.get_mut(&training_id.0) {
            t.status = TrainingStatus::Approved;
            t.approver = Some(approver.clone());
            t.minted = minted.clone();
        }
        emit_event(
            "training_approved",
            json!({
                "training_id": training_id,
                "trainer": training.trainer,
                "trainee": training.trainee,
                "kind": training.kind,
                "approver": approver,
                "credential_token_id": cred_id,
                "trainer_right_ids": trainer_rights,
            }),
        );
        if !trainer_rights.is_empty() {
            emit_event(
                "rights_minted",
                json!({
                    "owner_id": training.trainer,
                    "group_id": config.reward_group,
                    "token_ids": trainer_rights,
                    "source": source,
                    "training_id": training_id,
                }),
            );
        }
        minted
    }

    /// A verifier (not the trainer) rejects a proposed training.
    pub fn reject_credential(&mut self, training_id: U64, reason: String) {
        let approver = env::predecessor_account_id();
        self.assert_role(&approver, ROLE_VERIFIER);
        require_text(&reason, MAX_REASON_LEN, "reason");
        let training = self.training_or_panic(training_id.0);
        require!(
            approver != training.trainer,
            "E_SELF_VERIFY: the trainer cannot reject their own training"
        );
        require!(
            training.status == TrainingStatus::Proposed,
            "E_BAD_STATE: training is not proposed"
        );
        if let Some(t) = self.trainings.get_mut(&training_id.0) {
            t.status = TrainingStatus::Rejected;
            t.approver = Some(approver.clone());
        }
        emit_event(
            "training_rejected",
            json!({
                "training_id": training_id,
                "trainer": training.trainer,
                "trainee": training.trainee,
                "kind": training.kind,
                "approver": approver,
                "reason": reason,
            }),
        );
    }
}

impl CommonsContract {
    fn training_or_panic(&self, id: u64) -> Training {
        match self.trainings.get(&id) {
            Some(t) => t.clone(),
            None => env::panic_str("E_NOT_FOUND: unknown training"),
        }
    }

    fn set_suspended(&mut self, token_id: TokenId, reason: String, suspend: bool) {
        self.assert_dao();
        require_text(&reason, MAX_REASON_LEN, "reason");
        let Some(card) = self.tokens.get_mut(&token_id) else {
            env::panic_str("E_NOT_FOUND: unknown token");
        };
        let owner_id = card.owner_id.clone();
        let CardKind::Credential {
            kind, suspended, ..
        } = &mut card.kind
        else {
            env::panic_str("E_NO_REVOCATION: usage rights cannot be suspended or revoked");
        };
        require!(
            *suspended != suspend,
            if suspend {
                "E_BAD_STATE: credential already suspended"
            } else {
                "E_BAD_STATE: credential is not suspended"
            }
        );
        *suspended = suspend;
        let kind = kind.clone();
        emit_event(
            if suspend {
                "credential_suspended"
            } else {
                "credential_unsuspended"
            },
            json!({
                "token_id": token_id,
                "owner_id": owner_id,
                "kind": kind,
                "reason": reason,
            }),
        );
    }
}
