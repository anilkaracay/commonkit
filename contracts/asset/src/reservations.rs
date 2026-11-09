//! Reservations, sessions, returns and disputes (CONTRACT_SPEC §3.2, §6, §7).
//!
//! Slots are held synchronously in `reserve` *before* the async authorization call and are
//! released when authorization fails (invariant 8). Attached money sits in `pending_in` until
//! the callback moves it to `float_free`/`deposits_held` (confirmed) or refunds it (rejected).

use commonkit_types::commons_iface::{
    AuthResult, AuthorizeReservationArgs, TokenId, GAS_AUTHORIZE, METHOD_AUTHORIZE_RESERVATION,
    ROLE_STEWARD,
};
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{self, json};
use near_sdk::{env, near, require, NearToken, Promise};

use crate::ledger::{add, sub};
use crate::profile::MAX_ID_LEN;
use crate::reputation::{REP_CLEAN_RETURN, REP_DAMAGE, REP_NO_SHOW, REP_SESSION};
use crate::types::{OpKind, Reservation, ReservationStatus, ReturnResult};
use crate::{
    is_sha256_hex, promise_bytes, promise_succeeded, AssetContract, AssetContractExt,
    GAS_ON_AUTHORIZED, NS_PER_DAY, NS_PER_MINUTE,
};

/// Max length of an `AuthResult` we are willing to read.
const MAX_AUTH_RESULT_LEN: usize = 4096;

impl AssetContract {
    pub(crate) fn get_reservation_or_panic(&self, id: u64) -> Reservation {
        self.reservations
            .get(&id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("E_NOT_FOUND: unknown reservation"))
    }

    pub(crate) fn start_ts(&self, r: &Reservation) -> u64 {
        r.start_slot.0.saturating_mul(self.slot_ns())
    }

    pub(crate) fn window_end_ts(&self, r: &Reservation) -> u64 {
        self.start_ts(r).saturating_add(
            u64::from(self.profile.start_window_minutes).saturating_mul(NS_PER_MINUTE),
        )
    }

    pub(crate) fn end_ts(&self, r: &Reservation) -> u64 {
        r.start_slot
            .0
            .saturating_add(u64::from(r.slots))
            .saturating_mul(self.slot_ns())
    }

    /// Deposit for `holder` (spec §7): reduced after `trusted_after` clean returns.
    pub(crate) fn deposit_for(&self, holder: &near_sdk::AccountId) -> u128 {
        let clean = self
            .reputation
            .get(holder)
            .map(|r| r.clean_returns)
            .unwrap_or(0);
        if clean >= self.profile.trusted_after {
            self.profile.deposit_trusted.0
        } else {
            self.profile.deposit.0
        }
    }

    fn release_slots(&mut self, r: &Reservation) {
        for slot in r.start_slot.0..r.start_slot.0 + u64::from(r.slots) {
            if self.slot_index.get(&slot) == Some(&r.id.0) {
                self.slot_index.remove(&slot);
            }
        }
    }

    /// Refunds `amount` (already taken from its bucket) to the holder as a Refund op.
    fn refund_holder(&mut self, r: &Reservation, amount: u128) -> Option<u64> {
        if amount == 0 {
            return None;
        }
        Some(self.create_and_send(OpKind::Refund, r.holder.clone(), amount, Some(r.id.0)))
    }

    fn confirm(&mut self, mut r: Reservation) {
        let fee = r.fee_paid.0;
        let deposit = r.deposit_paid.0;
        let (protocol_fee, receiver) = match &self.profile.protocol_fee_receiver {
            Some(receiver) if self.profile.protocol_fee_bps > 0 => (
                fee * u128::from(self.profile.protocol_fee_bps) / 10_000,
                Some(receiver.clone()),
            ),
            _ => (0, None),
        };
        let l = &mut self.ledger;
        l.float_free = add(l.float_free, fee - protocol_fee, "float_free");
        l.total_fees_in = add(l.total_fees_in, fee, "total_fees_in");
        l.deposits_held = add(l.deposits_held, deposit, "deposits_held");
        r.status = ReservationStatus::Confirmed;
        r.protocol_fee = U128(protocol_fee);
        let id = r.id.0;
        self.reservations.insert(id, r.clone());
        if let Some(receiver) = receiver.filter(|_| protocol_fee > 0) {
            self.create_and_send(OpKind::ProtocolFee, receiver, protocol_fee, Some(id));
        }
        self.emit(
            "reservation_confirmed",
            json!({
                "reservation_id": r.id,
                "holder": r.holder,
                "start_slot": r.start_slot,
                "slots": r.slots,
                "fee": r.fee_paid,
                "deposit": r.deposit_paid,
                "protocol_fee": protocol_fee.to_string(),
                "right_id": r.right_id,
            }),
        );
        self.maybe_sweep();
    }

    fn reject(&mut self, mut r: Reservation, reason: String, release_right: bool) {
        let attached = r.fee_paid.0 + r.deposit_paid.0;
        self.release_slots(&r);
        r.status = ReservationStatus::Rejected;
        let id = r.id.0;
        self.reservations.insert(id, r.clone());
        let op_id = self.refund_holder(&r, attached);
        if release_right && r.right_id.is_some() {
            self.sync_right(id, OpKind::RightRelease);
        }
        self.emit(
            "reservation_rejected",
            json!({
                "reservation_id": r.id,
                "holder": r.holder,
                "reason": reason,
                "refund": attached.to_string(),
                "refund_op_id": op_id.map(|o| o.to_string()),
            }),
        );
    }
}

#[near]
impl AssetContract {
    /// ANY. Holds `[start_slot, start_slot + slots)` and asks commons to authorize the holder
    /// (credential, right). Attach exactly `fee + deposit` (deposit only with a right).
    #[payable]
    pub fn reserve(&mut self, start_slot: U64, slots: u32, right_id: Option<TokenId>) -> U64 {
        let holder = env::predecessor_account_id();
        let attached = env::attached_deposit().as_yoctonear();
        let p = &self.profile;
        require!(
            slots >= 1 && slots <= p.max_slots_per_reservation,
            "E_TOO_MANY_SLOTS: slots must be between 1 and max_slots_per_reservation"
        );
        let slot_ns = self.slot_ns();
        let now_slot = Self::now() / slot_ns;
        let horizon = u64::from(p.booking_horizon_days).saturating_mul(NS_PER_DAY) / slot_ns;
        require!(
            start_slot.0 >= now_slot && start_slot.0 <= now_slot.saturating_add(horizon),
            "E_SLOT_OUT_OF_RANGE: start slot outside the booking horizon"
        );
        if let Some(token) = &right_id {
            require!(
                !token.is_empty() && token.len() <= MAX_ID_LEN,
                "E_INVALID_ARGS: invalid right id"
            );
        }
        let fee = if right_id.is_some() {
            0
        } else {
            p.price_per_slot
                .0
                .checked_mul(u128::from(slots))
                .unwrap_or_else(|| env::panic_str("E_WRONG_AMOUNT: fee overflow"))
        };
        let deposit = self.deposit_for(&holder);
        let expected = fee
            .checked_add(deposit)
            .unwrap_or_else(|| env::panic_str("E_WRONG_AMOUNT: amount overflow"));
        if attached != expected {
            env::panic_str(&format!(
                "E_WRONG_AMOUNT: attach exactly {expected} yoctoNEAR (fee {fee} + deposit {deposit})"
            ));
        }
        let end = start_slot.0 + u64::from(slots);
        for slot in start_slot.0..end {
            require!(
                !self.slot_index.contains_key(&slot),
                "E_SLOT_TAKEN: slot already reserved"
            );
        }

        let id = self.next_reservation_id;
        self.next_reservation_id += 1;
        for slot in start_slot.0..end {
            self.slot_index.insert(slot, id);
        }
        let reservation = Reservation {
            id: U64(id),
            holder: holder.clone(),
            start_slot,
            slots,
            fee_paid: U128(fee),
            protocol_fee: U128(0),
            deposit_paid: U128(deposit),
            right_id: right_id.clone(),
            status: ReservationStatus::PendingAuthorization,
            created_at: U64(Self::now()),
            session_started_at: None,
            session_finished_at: None,
            metrics_delta: None,
            return_result: None,
            right_op_id: None,
        };
        self.reservations.insert(id, reservation);
        let mut list = self
            .holder_reservations
            .get(&holder)
            .cloned()
            .unwrap_or_default();
        list.push(id);
        self.holder_reservations.insert(holder.clone(), list);
        self.ledger.pending_in = add(self.ledger.pending_in, attached, "pending_in");

        self.emit(
            "reservation_pending",
            json!({
                "reservation_id": id.to_string(),
                "holder": holder,
                "start_slot": start_slot,
                "slots": slots,
                "fee": fee.to_string(),
                "deposit": deposit.to_string(),
                "right_id": right_id,
            }),
        );

        let args = serde_json::to_vec(&AuthorizeReservationArgs {
            holder,
            asset: env::current_account_id(),
            credential: self.profile.required_credential.clone(),
            right_id,
            reservation_id: U64(id),
            slots,
        })
        .unwrap_or_else(|_| env::panic_str("E_BAD_STATE: args"));
        Promise::new(self.commons_id.clone())
            .function_call(
                METHOD_AUTHORIZE_RESERVATION.to_string(),
                args,
                NearToken::from_yoctonear(0),
                GAS_AUTHORIZE,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_AUTHORIZED)
                    .on_authorized(U64(id)),
            )
            .detach();
        U64(id)
    }

    /// Callback of `commons.authorize_reservation`. `ok` → Confirmed; anything else (business
    /// rejection, failed call, unreadable result) → slots released, Rejected, full refund.
    #[private]
    pub fn on_authorized(&mut self, reservation_id: U64) -> bool {
        let succeeded = promise_succeeded();
        let result: Option<AuthResult> = promise_bytes(MAX_AUTH_RESULT_LEN)
            .and_then(|bytes| serde_json::from_slice(&bytes).ok());
        let r = match self.reservations.get(&reservation_id.0) {
            Some(r) if r.status == ReservationStatus::PendingAuthorization => r.clone(),
            _ => {
                env::log_str("on_authorized: reservation not pending, ignored");
                return false;
            }
        };
        let attached = r.fee_paid.0 + r.deposit_paid.0;
        self.ledger.pending_in = sub(self.ledger.pending_in, attached, "pending_in");
        match result {
            Some(AuthResult { ok: true, .. }) => {
                self.confirm(r);
                true
            }
            Some(res) => {
                let reason = res.reason.unwrap_or_else(|| "E_UNAUTHORIZED".to_string());
                self.reject(r, reason, false);
                false
            }
            None if succeeded => {
                // The call succeeded but its result is unreadable: commons may have locked the
                // right, so release it to be safe (release is a no-op when not locked).
                self.reject(r, "E_BAD_STATE: unreadable authorization".to_string(), true);
                false
            }
            None => {
                self.reject(
                    r,
                    "E_UNAUTHORIZED: authorization call failed".to_string(),
                    false,
                );
                false
            }
        }
    }

    /// Holder. Only `Confirmed` and before the start slot. Fee is refunded (net of protocol fee)
    /// when cancelling at least one slot length before start; the deposit always.
    pub fn cancel_reservation(&mut self, id: U64) {
        let mut r = self.get_reservation_or_panic(id.0);
        require!(
            env::predecessor_account_id() == r.holder,
            "E_UNAUTHORIZED: only the holder can cancel"
        );
        require!(
            r.status == ReservationStatus::Confirmed,
            "E_BAD_STATE: reservation is not Confirmed"
        );
        let now = Self::now();
        let start = self.start_ts(&r);
        require!(now < start, "E_WINDOW_CLOSED: reservation already started");
        let fee_refund = if now.saturating_add(self.slot_ns()) <= start {
            r.fee_paid.0 - r.protocol_fee.0
        } else {
            0
        };
        require!(
            self.ledger.float_free >= fee_refund,
            "E_INSUFFICIENT_FLOAT: float cannot cover the fee refund now"
        );
        let deposit = r.deposit_paid.0;
        self.ledger.float_free -= fee_refund;
        self.ledger.deposits_held = sub(self.ledger.deposits_held, deposit, "deposits_held");
        self.release_slots(&r);
        r.status = ReservationStatus::Cancelled;
        self.reservations.insert(id.0, r.clone());
        let op_id = self.refund_holder(&r, fee_refund + deposit);
        if r.right_id.is_some() {
            self.sync_right(id.0, OpKind::RightRelease);
        }
        self.emit(
            "reservation_cancelled",
            json!({
                "reservation_id": id,
                "holder": r.holder,
                "fee_refunded": fee_refund.to_string(),
                "deposit_refunded": deposit.to_string(),
                "refund_op_id": op_id.map(|o| o.to_string()),
                "right_id": r.right_id,
            }),
        );
    }

    /// BRIDGE. `Confirmed` → `InSession`, only within `[start, start + start_window]`.
    pub fn mark_session_started(&mut self, id: U64) {
        self.assert_bridge();
        let mut r = self.get_reservation_or_panic(id.0);
        require!(
            r.status == ReservationStatus::Confirmed,
            "E_BAD_STATE: reservation is not Confirmed"
        );
        let now = Self::now();
        require!(
            now >= self.start_ts(&r) && now <= self.window_end_ts(&r),
            "E_WINDOW_CLOSED: outside the start window"
        );
        r.status = ReservationStatus::InSession;
        r.session_started_at = Some(U64(now));
        self.reservations.insert(id.0, r.clone());
        self.emit(
            "session_started",
            json!({ "reservation_id": id, "holder": r.holder }),
        );
    }

    /// BRIDGE. `InSession` → `Finished`. Applies the cumulative metrics as telemetry (same rules
    /// as `report_telemetry`) and consumes the right, if any.
    pub fn mark_session_finished(&mut self, id: U64, metrics: Vec<(String, u64)>) {
        self.assert_bridge();
        let mut r = self.get_reservation_or_panic(id.0);
        require!(
            r.status == ReservationStatus::InSession,
            "E_BAD_STATE: reservation is not InSession"
        );
        let delta: Vec<(String, u64)> = metrics
            .iter()
            .map(|(m, v)| (m.clone(), v.saturating_sub(self.telemetry.value(m))))
            .collect();
        if !metrics.is_empty() {
            self.apply_telemetry(metrics);
        }
        r.status = ReservationStatus::Finished;
        r.session_finished_at = Some(U64(Self::now()));
        r.metrics_delta = Some(delta.clone());
        self.reservations.insert(id.0, r.clone());
        if r.right_id.is_some() {
            self.sync_right(id.0, OpKind::RightFinalize);
        }
        self.emit(
            "session_finished",
            json!({
                "reservation_id": id,
                "holder": r.holder,
                "metrics_delta": delta,
                "right_id": r.right_id,
            }),
        );
        self.record_reputation(&r.holder, REP_SESSION, id.0);
    }

    /// ANY. `Confirmed` after the start window passed → `NoShow`. Fee kept, deposit refunded,
    /// right released (back to Active, not consumed).
    pub fn mark_no_show(&mut self, id: U64) {
        let mut r = self.get_reservation_or_panic(id.0);
        require!(
            r.status == ReservationStatus::Confirmed,
            "E_BAD_STATE: reservation is not Confirmed"
        );
        require!(
            Self::now() > self.window_end_ts(&r),
            "E_WINDOW_CLOSED: start window still open"
        );
        let deposit = r.deposit_paid.0;
        self.ledger.deposits_held = sub(self.ledger.deposits_held, deposit, "deposits_held");
        self.release_slots(&r);
        r.status = ReservationStatus::NoShow;
        self.reservations.insert(id.0, r.clone());
        let op_id = self.refund_holder(&r, deposit);
        if r.right_id.is_some() {
            self.sync_right(id.0, OpKind::RightRelease);
        }
        self.emit(
            "no_show",
            json!({
                "reservation_id": id,
                "holder": r.holder,
                "deposit_refunded": deposit.to_string(),
                "refund_op_id": op_id.map(|o| o.to_string()),
                "right_id": r.right_id,
            }),
        );
        self.record_reputation(&r.holder, REP_NO_SHOW, id.0);
    }

    /// ROLE(steward), not the holder. `Finished` → Clean: deposit refunded, `Closed`;
    /// Damage: `Disputed` (deposit stays held for the DAO).
    pub fn confirm_return(&mut self, id: U64, result: ReturnResult) {
        let steward = self.assert_role(ROLE_STEWARD);
        let mut r = self.get_reservation_or_panic(id.0);
        require!(
            steward != r.holder,
            "E_SELF_VERIFY: the holder cannot confirm their own return"
        );
        require!(
            r.status == ReservationStatus::Finished,
            "E_BAD_STATE: reservation is not Finished"
        );
        match &result {
            ReturnResult::Clean => {
                let deposit = r.deposit_paid.0;
                self.ledger.deposits_held =
                    sub(self.ledger.deposits_held, deposit, "deposits_held");
                r.status = ReservationStatus::Closed;
                r.return_result = Some(result.clone());
                self.reservations.insert(id.0, r.clone());
                let op_id = self.refund_holder(&r, deposit);
                self.emit(
                    "return_confirmed",
                    json!({
                        "reservation_id": id,
                        "holder": r.holder,
                        "steward": steward,
                        "result": "Clean",
                        "deposit_refunded": deposit.to_string(),
                        "refund_op_id": op_id.map(|o| o.to_string()),
                    }),
                );
                self.record_reputation(&r.holder, REP_CLEAN_RETURN, id.0);
            }
            ReturnResult::Damage { note_hash } => {
                require!(
                    is_sha256_hex(note_hash),
                    "E_INVALID_ARGS: note_hash must be a hex sha256"
                );
                r.status = ReservationStatus::Disputed;
                r.return_result = Some(result.clone());
                self.reservations.insert(id.0, r.clone());
                self.emit(
                    "return_confirmed",
                    json!({
                        "reservation_id": id,
                        "holder": r.holder,
                        "steward": steward,
                        "result": "Damage",
                    }),
                );
                self.emit(
                    "dispute_opened",
                    json!({
                        "reservation_id": id,
                        "holder": r.holder,
                        "steward": steward,
                        "note_hash": note_hash,
                        "deposit_held": r.deposit_paid,
                    }),
                );
            }
        }
    }

    /// DAO. `Disputed` → `Closed`. `deduct <= deposit` goes to float; the rest is refunded.
    /// A positive deduction records a damage on the holder's reputation.
    pub fn resolve_dispute(&mut self, id: U64, deduct: U128, note_hash: String) {
        self.assert_dao();
        let mut r = self.get_reservation_or_panic(id.0);
        require!(
            r.status == ReservationStatus::Disputed,
            "E_BAD_STATE: reservation is not Disputed"
        );
        let deposit = r.deposit_paid.0;
        require!(
            deduct.0 <= deposit,
            "E_WRONG_AMOUNT: deduction above the deposit"
        );
        require!(
            is_sha256_hex(&note_hash),
            "E_INVALID_ARGS: note_hash must be a hex sha256"
        );
        self.ledger.deposits_held = sub(self.ledger.deposits_held, deposit, "deposits_held");
        self.ledger.float_free = add(self.ledger.float_free, deduct.0, "float_free");
        r.status = ReservationStatus::Closed;
        self.reservations.insert(id.0, r.clone());
        let refund = deposit - deduct.0;
        let op_id = self.refund_holder(&r, refund);
        self.emit(
            "dispute_resolved",
            json!({
                "reservation_id": id,
                "holder": r.holder,
                "deducted": deduct,
                "refunded": refund.to_string(),
                "refund_op_id": op_id.map(|o| o.to_string()),
                "note_hash": note_hash,
            }),
        );
        if deduct.0 > 0 {
            self.record_reputation(&r.holder, REP_DAMAGE, id.0);
        }
        self.maybe_sweep();
    }
}
