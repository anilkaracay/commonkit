// Harness helpers are shared by test files that land in later commits.
#![allow(dead_code)]

//! Unit tests for the asset contract. Each file covers one area; COVERAGE.md maps methods to
//! test names. The harness keeps one contract instance and a simulated account balance across
//! calls (transfers are debited by the mocked VM; failed transfers are credited back by the
//! harness, as the chain would refund them).

use commonkit_types::commons_iface::AuthResult;
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{self, Value};
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{env, testing_env, AccountId, Gas, NearToken, PromiseResult, RuntimeFeesConfig};

use crate::types::*;
use crate::AssetContract;

mod escalations;
mod governance;
mod ledger_ops;
mod profile;
mod reservations;
mod telemetry;

pub const N: u128 = 1_000_000_000_000_000_000_000_000;
pub const MIN: u64 = 60_000_000_000;
pub const HOUR: u64 = 60 * MIN;
pub const DAY: u64 = 24 * HOUR;
/// Start time of every test: slot boundary for 30-minute slots.
pub const T0: u64 = 1_800_000_000 * 1_000_000_000;
pub const SLOT: u64 = 30 * MIN;
pub const STORAGE_RESERVE: u128 = 5 * N;
pub const HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

pub fn acc(name: &str) -> AccountId {
    name.parse().unwrap()
}
pub fn asset() -> AccountId {
    acc("printer.makerlab.testnet")
}
pub fn dao() -> AccountId {
    acc("makerlab.sputnikv2.testnet")
}
pub fn commons() -> AccountId {
    acc("commons.makerlab.testnet")
}
pub fn bridge() -> AccountId {
    acc("bridge.makerlab.testnet")
}
pub fn agent() -> AccountId {
    acc("agent.makerlab.testnet")
}
pub fn alice() -> AccountId {
    acc("alice.testnet")
}
pub fn bob() -> AccountId {
    acc("bob.testnet")
}
pub fn steward() -> AccountId {
    acc("steward.testnet")
}
pub fn verifier() -> AccountId {
    acc("verifier.testnet")
}
pub fn council() -> AccountId {
    acc("council.testnet")
}
pub fn council2() -> AccountId {
    acc("council2.testnet")
}
pub fn feesink() -> AccountId {
    acc("fees.testnet")
}

pub fn metric(metric: &str, threshold: u64) -> Trigger {
    Trigger::Metric {
        metric: metric.to_string(),
        threshold,
    }
}

pub fn rule(id: &str, kind: UpkeepKind, trigger: Trigger, rights: u32, cash: u128) -> UpkeepRule {
    UpkeepRule {
        rule_id: id.to_string(),
        kind,
        trigger,
        title: format!("Rule {id}"),
        reward_rights: rights,
        reward_cash: U128(cash),
        reimbursable_max: U128(0),
        requires_verification_test: false,
        claim_timeout_hours: 24,
    }
}

/// Printer-like profile: 30-min slots, 0.25 N/slot, 2 N deposit (0.5 N after 3 clean returns).
/// Rules: nozzle_clean (Metric, test required), bed_level (Metric, 0.1 N cash),
/// filament_spool (Restock, up to 3 N expense), weekly_clean (Schedule 168 h),
/// fault_repair (Repair on 2 reports, up to 0.4 N expense).
pub fn profile() -> Profile {
    let mut nozzle = rule(
        "nozzle_clean",
        UpkeepKind::Maintenance,
        metric("nozzle_seconds", 1800),
        2,
        0,
    );
    nozzle.requires_verification_test = true;
    let mut spool = rule(
        "filament_spool",
        UpkeepKind::Restock,
        metric("filament_used_mm", 330_000),
        1,
        0,
    );
    spool.reimbursable_max = U128(3 * N);
    let mut repair = rule(
        "fault_repair",
        UpkeepKind::Repair,
        Trigger::Report { min_reports: 2 },
        2,
        0,
    );
    repair.reimbursable_max = U128(2 * N / 5);
    Profile {
        asset_type: "printer_3d".to_string(),
        display_name: "Makerlab 3D printer".to_string(),
        group_id: "makerlab-fab".to_string(),
        adapter: "simulator".to_string(),
        usage_unit_label: "job".to_string(),
        slot_minutes: 30,
        max_slots_per_reservation: 4,
        booking_horizon_days: 7,
        price_per_slot: U128(N / 4),
        deposit: U128(2 * N),
        deposit_trusted: U128(N / 2),
        trusted_after: 3,
        required_credential: None,
        float_cap: U128(3 * N),
        storage_reserve: U128(STORAGE_RESERVE),
        auto_reward_cash_cap: U128(N),
        council_threshold_cash: U128(N / 2),
        period_days: 30,
        period_reward_quota: 5,
        right_max_slots: 2,
        right_validity_days: 90,
        first_task_needs_council: false,
        start_window_minutes: 15,
        rules: vec![
            nozzle,
            rule(
                "bed_level",
                UpkeepKind::Inspection,
                metric("jobs_total", 50),
                1,
                N / 10,
            ),
            spool,
            rule(
                "weekly_clean",
                UpkeepKind::Cleaning,
                Trigger::Schedule { every_hours: 168 },
                1,
                0,
            ),
            repair,
        ],
        protocol_fee_bps: 0,
        protocol_fee_receiver: None,
    }
}

pub struct H {
    pub c: AssetContract,
    pub now: u64,
    pub balance: u128,
}

fn context(
    predecessor: &AccountId,
    attached: u128,
    balance: u128,
    now: u64,
) -> near_sdk::VMContext {
    VMContextBuilder::new()
        .current_account_id(asset())
        .signer_account_id(predecessor.clone())
        .predecessor_account_id(predecessor.clone())
        .attached_deposit(NearToken::from_yoctonear(attached))
        .account_balance(NearToken::from_yoctonear(balance))
        .block_timestamp(now)
        .prepaid_gas(Gas::from_tgas(300))
        .build()
}

impl H {
    /// Fresh contract with `profile()`; the account holds exactly the storage reserve.
    pub fn new() -> Self {
        Self::with_profile(profile())
    }

    pub fn with_profile(p: Profile) -> Self {
        testing_env!(context(&acc("deployer.testnet"), 0, STORAGE_RESERVE, T0));
        let c = AssetContract::new(dao(), commons(), p);
        H {
            c,
            now: T0,
            balance: STORAGE_RESERVE,
        }
    }

    /// A contract with operators and roles wired and `float` in the float.
    pub fn wired(float: u128) -> Self {
        let mut h = Self::new();
        h.set_operators();
        h.roles(&[
            (steward(), &["steward"]),
            (verifier(), &["verifier"]),
            (council(), &["council"]),
            (council2(), &["council", "verifier"]),
        ]);
        if float > 0 {
            h.call(&dao(), float, |c| c.fund_float());
        }
        h
    }

    pub fn set_operators(&mut self) {
        self.call(&dao(), 0, |c| {
            c.set_operators(Some(bridge()), Some(agent()))
        });
    }

    pub fn roles(&mut self, list: &[(AccountId, &[&str])]) {
        let version = U64(self.c.roles_version + 1);
        let updates = list
            .iter()
            .map(|(a, r)| (a.clone(), r.iter().map(|s| s.to_string()).collect()))
            .collect();
        self.call(&commons(), 0, |c| c.sync_roles(updates, version));
    }

    pub fn call<R>(
        &mut self,
        who: &AccountId,
        attached: u128,
        f: impl FnOnce(&mut AssetContract) -> R,
    ) -> R {
        // The mocked VM credits the attached deposit to the account balance itself.
        testing_env!(context(who, attached, self.balance, self.now));
        let r = f(&mut self.c);
        self.balance = env::account_balance().as_yoctonear();
        r
    }

    /// Runs a `#[private]` callback with one promise result.
    pub fn callback<R>(
        &mut self,
        result: PromiseResult,
        f: impl FnOnce(&mut AssetContract) -> R,
    ) -> R {
        testing_env!(
            context(&asset(), 0, self.balance, self.now),
            near_sdk::test_vm_config(),
            RuntimeFeesConfig::test(),
            Default::default(),
            vec![result],
        );
        let r = f(&mut self.c);
        self.balance = env::account_balance().as_yoctonear();
        r
    }

    pub fn view<R>(&mut self, f: impl FnOnce(&AssetContract) -> R) -> R {
        testing_env!(context(&alice(), 0, self.balance, self.now));
        f(&self.c)
    }

    /// Simulates a transfer settling: on failure the chain refunds the amount first.
    pub fn settle(&mut self, op_id: u64, ok: bool) -> bool {
        let op = self.c.ops.get(&op_id).cloned().expect("op");
        if !ok {
            self.balance += op.amount.0;
        }
        let result = if ok {
            PromiseResult::Successful(vec![])
        } else {
            PromiseResult::Failed
        };
        self.callback(result, |c| c.on_op_result(U64(op_id)))
    }

    /// Settles every Pending op successfully.
    pub fn settle_all(&mut self) {
        for id in 0..self.c.next_op_id {
            let pending = self.c.ops.get(&id).map(|o| o.status) == Some(OpStatus::Pending);
            let bond = self.c.ops.get(&id).map(|o| o.kind) == Some(OpKind::Bond);
            if pending && !bond {
                self.settle(id, true);
            }
        }
    }

    /// `reserve` with the exact expected amount; returns the reservation id.
    pub fn reserve(&mut self, who: &AccountId, start_slot: u64, slots: u32) -> u64 {
        let p = &self.c.profile;
        let fee = p.price_per_slot.0 * u128::from(slots);
        let deposit = self.c.deposit_for(who);
        self.call(who, fee + deposit, |c| {
            c.reserve(U64(start_slot), slots, None)
        })
        .0
    }

    pub fn authorize(&mut self, id: u64, ok: bool, reason: Option<&str>) -> bool {
        let res = AuthResult {
            ok,
            reason: reason.map(str::to_string),
            credential_token_id: None,
            locked_right_id: None,
        };
        let bytes = serde_json::to_vec(&res).unwrap();
        self.callback(PromiseResult::Successful(bytes), |c| {
            c.on_authorized(U64(id))
        })
    }

    /// Reserve + successful authorization + all ops settled.
    pub fn confirmed(&mut self, who: &AccountId, start_slot: u64, slots: u32) -> u64 {
        let id = self.reserve(who, start_slot, slots);
        self.authorize(id, true, None);
        self.settle_all();
        id
    }

    pub fn now_slot(&self) -> u64 {
        self.now / SLOT
    }

    pub fn res(&self, id: u64) -> Reservation {
        self.c.reservations.get(&id).cloned().unwrap()
    }

    pub fn task(&self, id: u64) -> Task {
        self.c.tasks.get(&id).cloned().unwrap()
    }

    pub fn op(&self, id: u64) -> OutboundOp {
        self.c.ops.get(&id).cloned().unwrap()
    }

    pub fn last_op(&self) -> OutboundOp {
        self.op(self.c.next_op_id - 1)
    }

    pub fn telemetry(&mut self, metrics: &[(&str, u64)]) {
        let m = metrics.iter().map(|(k, v)| (k.to_string(), *v)).collect();
        self.call(&bridge(), 0, |c| c.report_telemetry(m));
    }

    pub fn invariant_ok(&mut self) -> bool {
        self.view(|c| c.get_ledger().invariant_ok)
    }
}

/// Data objects of every emitted `commonkit` event with this name (from the latest call).
pub fn events(name: &str) -> Vec<Value> {
    get_logs()
        .iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .filter_map(|j| serde_json::from_str::<Value>(j).ok())
        .filter(|v| v["standard"] == "commonkit" && v["version"] == "1.0.0" && v["event"] == name)
        .map(|v| v["data"][0].clone())
        .collect()
}

/// One outgoing function call of the latest contract call.
#[derive(Debug)]
pub struct Call {
    pub receiver: AccountId,
    pub method: String,
    pub args: Value,
    pub deposit: u128,
}

/// Function calls scheduled by the latest contract call (including our own callbacks).
pub fn calls() -> Vec<Call> {
    use near_sdk::mock::MockAction;
    near_sdk::test_utils::get_created_receipts()
        .into_iter()
        .flat_map(|r| {
            let receiver = r.receiver_id.clone();
            r.actions.into_iter().filter_map(move |a| match a {
                MockAction::FunctionCallWeight {
                    method_name,
                    args,
                    attached_deposit,
                    ..
                } => Some(Call {
                    receiver: receiver.clone(),
                    method: String::from_utf8(method_name).unwrap(),
                    args: serde_json::from_slice(&args).unwrap_or(Value::Null),
                    deposit: attached_deposit.as_yoctonear(),
                }),
                _ => None,
            })
        })
        .collect()
}

/// Plain transfers scheduled by the latest contract call: (receiver, amount).
pub fn transfers() -> Vec<(AccountId, u128)> {
    use near_sdk::mock::MockAction;
    near_sdk::test_utils::get_created_receipts()
        .into_iter()
        .flat_map(|r| {
            let receiver = r.receiver_id.clone();
            r.actions.into_iter().filter_map(move |a| match a {
                MockAction::Transfer { deposit, .. } => {
                    Some((receiver.clone(), deposit.as_yoctonear()))
                }
                _ => None,
            })
        })
        .collect()
}
