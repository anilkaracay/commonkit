//! Money ledger (CONTRACT_SPEC §2.2). All amounts are yoctoNEAR `u128`.
//!
//! Buckets (what the asset account holds on behalf of someone):
//! - `float_free`         operating money of the asset (capped, excess swept to the DAO)
//! - `deposits_held`      refundable deposits + failed refunds (liability to users)
//! - `rewards_reserved`   cash promised to open tasks + failed cash rewards (liability to workers)
//! - `pending_in`         attached amounts of reservations awaiting authorization (D-202)
//! - `protocol_fees_owed` failed protocol-fee payouts awaiting retry (D-202)
//! - `pending_out`        amounts in flight; already debited from the account balance
//! - `bonds_outstanding`  Sputnik proposal bonds held by the DAO that come back as a plain
//!   transfer when the proposal is finalized (D-102); a receivable, not an obligation
//!
//! Invariant (D-201):
//!
//! ```text
//! balance >= storage_reserve + float_free + deposits_held + rewards_reserved
//!            + pending_in + protocol_fees_owed
//! ```
//!
//! `pending_out` is excluded because NEAR debits a transfer from the balance when the receipt
//! is created; `bonds_outstanding` because that money is in the DAO, not on this account.

use near_sdk::env;
use near_sdk::json_types::{U128, U64};
use near_sdk::near;

#[near(serializers = [borsh])]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Ledger {
    pub float_free: u128,
    pub deposits_held: u128,
    pub rewards_reserved: u128,
    pub pending_in: u128,
    pub protocol_fees_owed: u128,
    pub pending_out: u128,
    pub bonds_outstanding: u128,
    pub total_fees_in: u128,
    pub total_swept: u128,
    pub total_refunded: u128,
    pub total_rewards_paid: u128,
    pub total_bonds_paid: u128,
    pub total_bonds_returned: u128,
    pub total_bonds_lost: u128,
    pub total_protocol_fees: u128,
}

/// Checked subtraction for ledger buckets. An underflow is a bug, never user input; abort.
pub fn sub(a: u128, b: u128, bucket: &str) -> u128 {
    a.checked_sub(b)
        .unwrap_or_else(|| env::panic_str(&format!("E_LEDGER: {bucket} underflow")))
}

/// Checked addition for ledger buckets.
pub fn add(a: u128, b: u128, bucket: &str) -> u128 {
    a.checked_add(b)
        .unwrap_or_else(|| env::panic_str(&format!("E_LEDGER: {bucket} overflow")))
}

impl Ledger {
    /// Sum of everything the account must keep on its balance besides the storage reserve.
    pub fn held(&self) -> u128 {
        self.float_free
            + self.deposits_held
            + self.rewards_reserved
            + self.pending_in
            + self.protocol_fees_owed
    }

    /// Balance not attributed to any bucket nor to the storage reserve, minus everything in
    /// flight (an in-flight transfer may bounce back) and minus outstanding bonds (their refund
    /// is credited by `sync_escalation`, not here). Never negative.
    pub fn unaccounted(&self, balance: u128, storage_reserve: u128) -> u128 {
        balance
            .saturating_sub(self.held())
            .saturating_sub(storage_reserve)
            .saturating_sub(self.pending_out)
            .saturating_sub(self.bonds_outstanding)
    }

    pub fn invariant_ok(&self, balance: u128, storage_reserve: u128) -> bool {
        match self.held().checked_add(storage_reserve) {
            Some(needed) => balance >= needed,
            None => false,
        }
    }
}

/// JSON view of the ledger (`get_ledger`).
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LedgerView {
    pub float_free: U128,
    pub deposits_held: U128,
    pub rewards_reserved: U128,
    pub pending_in: U128,
    pub protocol_fees_owed: U128,
    pub pending_out: U128,
    pub bonds_outstanding: U128,
    pub total_fees_in: U128,
    pub total_swept: U128,
    pub total_refunded: U128,
    pub total_rewards_paid: U128,
    pub total_bonds_paid: U128,
    pub total_bonds_returned: U128,
    pub total_bonds_lost: U128,
    pub total_protocol_fees: U128,
    pub float_cap: U128,
    pub storage_reserve: U128,
    pub balance: U128,
    pub storage_usage: U64,
    pub storage_byte_cost: U128,
    pub storage_cost: U128,
    /// `balance >= storage_reserve + held buckets` (see module docs).
    pub invariant_ok: bool,
    /// `storage_cost <= storage_reserve`.
    pub storage_ok: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unaccounted_excludes_in_flight_and_reserve() {
        let l = Ledger {
            float_free: 10,
            deposits_held: 5,
            pending_out: 3,
            ..Default::default()
        };
        assert_eq!(l.unaccounted(100, 50), 100 - 15 - 50 - 3);
        assert_eq!(l.unaccounted(10, 50), 0);
        assert!(l.invariant_ok(65, 50));
        assert!(!l.invariant_ok(64, 50));
    }

    #[test]
    #[should_panic(expected = "E_LEDGER")]
    fn sub_underflow_aborts() {
        sub(1, 2, "float_free");
    }
}
