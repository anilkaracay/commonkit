//! Sandbox harness for COMMONKIT integration tests (TEST_PLAN §1).
//!
//! Every test gets its own sandbox with:
//! - a real Sputnik DAO v2 (`res/sputnikdao2.wasm`, the testnet factory's default code) whose
//!   default policy has 3 council members and threshold `[1,2]` → 2 of 3 votes (D-103);
//! - the `commons` contract and three `asset` instances (printer_3d, laser_cutter, washer) built
//!   from `profiles/*.json` (the `meta` block is stripped);
//! - members, a bridge and an agent.
//!
//! Wiring happens only through DAO proposals (`propose_and_pass`), exactly like on testnet.
#![allow(dead_code)]
// `ok(..)?` already asserts success; dropping the checked outcome is intended.
#![allow(unused_must_use)]

use std::path::PathBuf;

use anyhow::{anyhow, Result};
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, AccountId, Contract, Worker};
use serde_json::{json, Value};

pub const N: u128 = 1_000_000_000_000_000_000_000_000;
pub const BOND: u128 = N;
pub const HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
pub const HASH2: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
/// Chain time added per fast-forwarded sandbox block (measured: ~300 ms).
pub const MS_PER_FF_BLOCK: u64 = 300;
/// `MIN_RESERVATION_STORAGE_DEPOSIT` of the asset contract (D-213).
pub const MIN_RIGHT_DEPOSIT: u128 = N / 100;
/// Balance checks allow for gas: refunds of unused prepaid gas arrive in later receipts.
pub const GAS_SLACK: u128 = N / 10;

pub fn near(n: u128) -> NearToken {
    NearToken::from_yoctonear(n * N)
}
pub fn yocto(n: u128) -> NearToken {
    NearToken::from_yoctonear(n)
}
pub fn tgas(n: u64) -> Gas {
    Gas::from_tgas(n)
}
pub fn u128_of(v: &Value) -> u128 {
    v.as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(|| panic!("not a U128 string: {v}"))
}
pub fn u64_of(v: &Value) -> u64 {
    match v {
        Value::String(s) => s.parse().unwrap(),
        Value::Number(n) => n.as_u64().unwrap(),
        _ => panic!("not a u64: {v}"),
    }
}

fn root_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read(path: PathBuf) -> Result<Vec<u8>> {
    std::fs::read(&path).map_err(|e| {
        anyhow!(
            "{}: {e} (run scripts/build-contracts.sh first)",
            path.display()
        )
    })
}

pub fn asset_wasm() -> Result<Vec<u8>> {
    read(root_dir().join("contracts/target/near/commonkit_asset/commonkit_asset.wasm"))
}
pub fn commons_wasm() -> Result<Vec<u8>> {
    read(root_dir().join("contracts/target/near/commonkit_commons/commonkit_commons.wasm"))
}
pub fn dao_wasm() -> Result<Vec<u8>> {
    read(root_dir().join("contracts/tests/res/sputnikdao2.wasm"))
}

/// `profiles/<name>.json` without its `meta` block.
pub fn profile(name: &str) -> Value {
    let raw = std::fs::read_to_string(root_dir().join(format!("profiles/{name}.json")))
        .expect("profile file");
    let v: Value = serde_json::from_str(&raw).expect("profile json");
    v["profile"].clone()
}

/// Fails the test with the receipt failures when the outcome is not a success.
pub fn ok(r: ExecutionFinalResult) -> Result<ExecutionFinalResult> {
    if r.is_success() && r.receipt_failures().is_empty() {
        Ok(r)
    } else {
        Err(anyhow!("call failed: {:#?}", r.failures()))
    }
}

/// Asserts the top-level call failed with an error containing `code`.
pub fn fails_with(r: &ExecutionFinalResult, code: &str) {
    assert!(r.is_failure(), "expected failure {code}, got success");
    let text = format!("{:?}", r.failures());
    assert!(text.contains(code), "expected {code}, got {text}");
}

/// True when any receipt in the tree failed with `code`.
pub fn receipt_failed_with(r: &ExecutionFinalResult, code: &str) -> bool {
    format!("{:?}", r.receipt_failures()).contains(code)
}

/// All `commonkit` event data objects with this name in the outcome logs.
pub fn events(r: &ExecutionFinalResult, name: &str) -> Vec<Value> {
    r.logs()
        .iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .filter_map(|j| serde_json::from_str::<Value>(j).ok())
        .filter(|v| v["standard"] == "commonkit" && v["event"] == name)
        .map(|v| v["data"][0].clone())
        .collect()
}

pub struct Env {
    pub worker: Worker<Sandbox>,
    pub root: Account,
    pub dao: Contract,
    pub council: Vec<Account>,
    pub commons: Contract,
    pub printer: Contract,
    pub laser: Contract,
    pub washer: Contract,
    pub bridge: Account,
    pub agent: Account,
    pub alice: Account,
    pub bob: Account,
    pub carol: Account,
    pub steward: Account,
    pub verifier: Account,
    pub trainer: Account,
}

pub struct EnvOptions {
    /// Applied to every profile before deployment (sandbox-only shortcuts, logged per test).
    pub tweak: fn(&str, &mut Value),
}

impl Default for EnvOptions {
    fn default() -> Self {
        Self { tweak: |_, _| {} }
    }
}

impl Env {
    pub async fn new() -> Result<Self> {
        Self::with(EnvOptions::default()).await
    }

    pub async fn with(opts: EnvOptions) -> Result<Self> {
        let worker = near_workspaces::sandbox().await?;
        let root = worker.root_account()?;
        let mk = |name: &'static str, bal: u128| {
            let root = root.clone();
            async move {
                root.create_subaccount(name)
                    .initial_balance(near(bal))
                    .transact()
                    .await?
                    .into_result()
                    .map_err(anyhow::Error::from)
            }
        };
        let council = vec![
            mk("c1", 50).await?,
            mk("c2", 50).await?,
            mk("c3", 50).await?,
        ];
        let bridge = mk("bridge", 20).await?;
        let agent = mk("agent", 20).await?;
        let alice = mk("alice", 50).await?;
        let bob = mk("bob", 50).await?;
        let carol = mk("carol", 50).await?;
        let steward = mk("steward", 20).await?;
        let verifier = mk("verifier", 20).await?;
        let trainer = mk("trainer", 20).await?;

        // Sputnik DAO with the factory default policy (council = c1..c3, threshold [1,2]).
        let dao_acc = mk("dao", 100).await?;
        let dao = dao_acc.deploy(&dao_wasm()?).await?.into_result()?;
        ok(dao
            .call("new")
            .args_json(json!({
                "config": {"name": "makerlab", "purpose": "COMMONKIT sandbox", "metadata": ""},
                "policy": council.iter().map(|c| c.id().to_string()).collect::<Vec<_>>(),
            }))
            .transact()
            .await?)?;

        let commons_acc = mk("commons", 30).await?;
        let commons = commons_acc.deploy(&commons_wasm()?).await?.into_result()?;
        ok(commons
            .call("new")
            .args_json(json!({
                "dao_id": dao.id(),
                "name": "Makerlab",
                "metadata": {
                    "spec": "nft-1.0.0", "name": "Makerlab cards", "symbol": "MKL",
                    "icon": null, "base_uri": null, "reference": null, "reference_hash": null
                }
            }))
            .transact()
            .await?)?;

        let asset_code = asset_wasm()?;
        let mut deployed = Vec::new();
        for (name, file) in [
            ("printer", "printer_3d"),
            ("laser", "laser_cutter"),
            ("washer", "washer"),
        ] {
            let mut p = profile(file);
            // Sandbox shortcut (D-215): slots of at most 15 minutes = the start window, so the
            // current slot can always start a session without fast-forwarding (which is slow).
            if p["slot_minutes"].as_u64().unwrap() > 15 {
                p["slot_minutes"] = json!(15);
            }
            (opts.tweak)(file, &mut p);
            // The profile's storage reserve + 0.05 N, as on testnet: the code needs ~4.7 N of
            // storage and any surplus becomes float on the first reconcile (D-204).
            let acc = root
                .create_subaccount(name)
                .initial_balance(yocto(u128_of(&p["storage_reserve"]) + N / 20))
                .transact()
                .await?
                .into_result()?;
            let c = acc.deploy(&asset_code).await?.into_result()?;
            ok(c.call("new")
                .args_json(json!({"dao_id": dao.id(), "commons_id": commons.id(), "profile": p}))
                .transact()
                .await?)?;
            deployed.push(c);
        }
        let washer = deployed.pop().unwrap();
        let laser = deployed.pop().unwrap();
        let printer = deployed.pop().unwrap();

        let env = Env {
            worker,
            root,
            dao,
            council,
            commons,
            printer,
            laser,
            washer,
            bridge,
            agent,
            alice,
            bob,
            carol,
            steward,
            verifier,
            trainer,
        };

        // One commons proposal: roles first (no active assets → no pushes), the credential kind,
        // then the assets (each registration pushes the full role snapshot to that asset).
        let mut actions = vec![];
        for (acc, roles) in [
            (&env.steward, vec!["steward"]),
            (&env.verifier, vec!["verifier"]),
            (&env.trainer, vec!["trainer"]),
            (&env.council[0], vec!["council"]),
            (&env.council[1], vec!["council", "verifier"]),
        ] {
            actions.push(action(
                "set_roles",
                json!({"account": acc.id(), "roles": roles}),
                0,
                15,
            ));
        }
        actions.push(action(
            "set_credential_kind",
            json!({"config": {
                "kind": "laser_safety", "title": "Laser safety", "validity_days": 365,
                "reward_group": "makerlab-fab", "trainer_reward_rights": 1,
                "right_max_slots": 2, "right_validity_days": 60
            }}),
            0,
            10,
        ));
        for (asset, group) in [
            (&env.printer, "makerlab-fab"),
            (&env.laser, "makerlab-fab"),
            (&env.washer, "dorm-b-laundry"),
        ] {
            actions.push(action(
                "register_asset",
                json!({"asset_id": asset.id(), "group_id": group}),
                0,
                45,
            ));
        }
        env.propose_and_pass(env.commons.id(), actions, "wire commons")
            .await?;
        for asset in [&env.printer, &env.laser, &env.washer] {
            env.propose_and_pass(
                asset.id(),
                vec![action(
                    "set_operators",
                    json!({"bridge_id": env.bridge.id(), "agent_id": env.agent.id()}),
                    0,
                    10,
                )],
                "set operators",
            )
            .await?;
        }
        Ok(env)
    }

    /// Adds a FunctionCall proposal (c1, with the bond) and passes it with 2 of 3 votes.
    /// Returns the proposal id and the outcome of the deciding vote.
    pub async fn propose_and_pass(
        &self,
        receiver: &AccountId,
        actions: Vec<Value>,
        description: &str,
    ) -> Result<(u64, ExecutionFinalResult)> {
        let kind = json!({"FunctionCall": {"receiver_id": receiver, "actions": actions}});
        self.propose_kind_and_pass(kind, description).await
    }

    pub async fn propose_kind_and_pass(
        &self,
        kind: Value,
        description: &str,
    ) -> Result<(u64, ExecutionFinalResult)> {
        let r = ok(self.council[0]
            .call(self.dao.id(), "add_proposal")
            .args_json(json!({"proposal": {"description": description, "kind": kind}}))
            .deposit(yocto(BOND))
            .gas(tgas(50))
            .transact()
            .await?)?;
        let id: u64 = r.json()?;
        ok(self.vote(id, 0, "VoteApprove").await?)?;
        let last = self.vote(id, 1, "VoteApprove").await?;
        let p = self.proposal(id).await?;
        if p["status"] != "Approved" {
            return Err(anyhow!(
                "proposal {id} ({description}) not approved: {} {:#?}",
                p["status"],
                last.failures()
            ));
        }
        Ok((id, last))
    }

    /// Adds a proposal and casts the two deciding votes; returns the id and the outcome of the
    /// deciding vote whatever the proposal's final status (Approved or Failed).
    pub async fn propose_kind_and_vote(
        &self,
        kind: Value,
        description: &str,
    ) -> Result<(u64, ExecutionFinalResult)> {
        let r = ok(self.council[0]
            .call(self.dao.id(), "add_proposal")
            .args_json(json!({"proposal": {"description": description, "kind": kind}}))
            .deposit(yocto(BOND))
            .gas(tgas(50))
            .transact()
            .await?)?;
        let id: u64 = r.json()?;
        ok(self.vote(id, 0, "VoteApprove").await?)?;
        let last = self.vote(id, 1, "VoteApprove").await?;
        Ok((id, last))
    }

    pub async fn vote(&self, id: u64, who: usize, action: &str) -> Result<ExecutionFinalResult> {
        Ok(self.council[who]
            .call(self.dao.id(), "act_proposal")
            .args_json(json!({"id": id, "action": action}))
            .max_gas()
            .transact()
            .await?)
    }

    pub async fn proposal(&self, id: u64) -> Result<Value> {
        Ok(self
            .dao
            .view("get_proposal")
            .args_json(json!({"id": id}))
            .await?
            .json()?)
    }

    pub async fn view(&self, c: &Contract, method: &str, args: Value) -> Result<Value> {
        Ok(c.view(method).args_json(args).await?.json()?)
    }

    pub async fn ledger(&self, asset: &Contract) -> Result<Value> {
        self.view(asset, "get_ledger", json!({})).await
    }

    pub async fn assert_invariant(&self, asset: &Contract) -> Result<()> {
        let l = self.ledger(asset).await?;
        assert_eq!(
            l["invariant_ok"],
            true,
            "invariant broken on {}: {l:#}",
            asset.id()
        );
        Ok(())
    }

    /// Account balance after letting pending gas-refund receipts land (two blocks).
    pub async fn balance(&self, id: &AccountId) -> Result<u128> {
        self.worker.fast_forward(2).await?;
        Ok(self.worker.view_account(id).await?.balance.as_yoctonear())
    }

    pub async fn now(&self) -> Result<u64> {
        Ok(self.worker.view_block().await?.timestamp())
    }

    /// Slot length of an asset in ns.
    pub async fn slot_ns(&self, asset: &Contract) -> Result<u64> {
        let p = self.view(asset, "get_profile", json!({})).await?;
        Ok(p["slot_minutes"].as_u64().unwrap() * 60_000_000_000)
    }

    pub async fn now_slot(&self, asset: &Contract) -> Result<u64> {
        Ok(self.now().await? / self.slot_ns(asset).await?)
    }

    /// Fast-forwards until the block timestamp is at least `ts`.
    pub async fn advance_to(&self, ts: u64) -> Result<()> {
        // Chain time per fast-forwarded block varies with load: measure it on every step and
        // cover 80 % of the remaining distance, so the target is reached without overshooting
        // short windows (start windows are 15 minutes).
        let mut ms_per_block = MS_PER_FF_BLOCK as f64;
        for _ in 0..60 {
            let now = self.now().await?;
            if now >= ts {
                return Ok(());
            }
            let remaining_ms = (ts - now) as f64 / 1e6;
            let blocks = if remaining_ms <= 5.0 * ms_per_block {
                (remaining_ms / ms_per_block).ceil() as u64 + 1
            } else {
                (remaining_ms * 0.8 / ms_per_block) as u64
            }
            .max(1);
            self.worker.fast_forward(blocks).await?;
            let after = self.now().await?;
            if after > now {
                ms_per_block = (after - now) as f64 / 1e6 / blocks as f64;
            }
        }
        Err(anyhow!("advance_to({ts}) did not converge"))
    }

    /// DAO funds an asset float through a FunctionCall proposal.
    pub async fn fund_float(&self, asset: &Contract, amount: u128) -> Result<ExecutionFinalResult> {
        let (_, r) = self
            .propose_and_pass(
                asset.id(),
                vec![action("fund_float", json!({}), amount, 30)],
                "fund float",
            )
            .await?;
        Ok(r)
    }

    pub async fn set_profile(&self, asset: &Contract, profile: Value) -> Result<()> {
        self.propose_and_pass(
            asset.id(),
            vec![action("set_profile", json!({"profile": profile}), 0, 30)],
            "set profile",
        )
        .await?;
        Ok(())
    }

    /// Exact `fee + deposit` for `who` (deposit only with a right).
    pub async fn amount_due(
        &self,
        asset: &Contract,
        who: &Account,
        slots: u32,
        right: bool,
    ) -> Result<u128> {
        let p = self.view(asset, "get_profile", json!({})).await?;
        let rep = self
            .view(asset, "get_reputation", json!({"account": who.id()}))
            .await?;
        let trusted =
            rep["clean_returns"].as_u64().unwrap() >= p["trusted_after"].as_u64().unwrap();
        let mut deposit = u128_of(if trusted {
            &p["deposit_trusted"]
        } else {
            &p["deposit"]
        });
        if right {
            deposit = deposit.max(MIN_RIGHT_DEPOSIT);
        }
        let fee = if right {
            0
        } else {
            u128_of(&p["price_per_slot"]) * u128::from(slots)
        };
        Ok(fee + deposit)
    }

    pub async fn reserve(
        &self,
        asset: &Contract,
        who: &Account,
        start_slot: u64,
        slots: u32,
        right_id: Option<&str>,
    ) -> Result<ExecutionFinalResult> {
        let amount = self
            .amount_due(asset, who, slots, right_id.is_some())
            .await?;
        Ok(who
            .call(asset.id(), "reserve")
            .args_json(
                json!({"start_slot": start_slot.to_string(), "slots": slots, "right_id": right_id}),
            )
            .deposit(yocto(amount))
            .gas(tgas(150))
            .transact()
            .await?)
    }

    pub async fn reservation(&self, asset: &Contract, id: u64) -> Result<Value> {
        self.view(asset, "get_reservation", json!({"id": id.to_string()}))
            .await
    }

    pub async fn task(&self, asset: &Contract, id: u64) -> Result<Value> {
        self.view(asset, "get_task", json!({"id": id.to_string()}))
            .await
    }

    pub async fn call(
        &self,
        who: &Account,
        asset: &Contract,
        method: &str,
        args: Value,
    ) -> Result<ExecutionFinalResult> {
        Ok(who
            .call(asset.id(), method)
            .args_json(args)
            .gas(tgas(200))
            .transact()
            .await?)
    }

    /// Reserve the next slot, wait for it and start + finish a session (bridge).
    pub async fn session(&self, asset: &Contract, who: &Account, metrics: Value) -> Result<u64> {
        // book the current slot; near its end, the next one (≤ 1 minute of fast-forward)
        let slot_ns = self.slot_ns(asset).await?;
        let now = self.now().await?;
        let mut start = now / slot_ns;
        if (start + 1) * slot_ns - now < 60_000_000_000 {
            start += 1;
        }
        // the current slot may already hold someone else's session: take the next one
        let owner = self
            .view(asset, "get_slot_owner", json!({"slot": start.to_string()}))
            .await?;
        if !owner.is_null() {
            start += 1;
        }
        let r = ok(self.reserve(asset, who, start, 1, None).await?)?;
        let id = u64_of(&r.json::<Value>()?);
        self.advance_to(start * slot_ns).await?;
        ok(self
            .call(
                &self.bridge,
                asset,
                "mark_session_started",
                json!({"id": id.to_string()}),
            )
            .await?)?;
        ok(self
            .call(
                &self.bridge,
                asset,
                "mark_session_finished",
                json!({"id": id.to_string(), "metrics": metrics}),
            )
            .await?)?;
        Ok(id)
    }

    /// Telemetry → agent opens → `who` claims and submits (with optional expense).
    pub async fn submitted_task(
        &self,
        asset: &Contract,
        rule: &str,
        who: &Account,
        expense: Option<u128>,
    ) -> Result<u64> {
        let r = ok(self
            .call(
                &self.agent,
                asset,
                "open_upkeep_task",
                json!({"rule_id": rule, "rationale": "threshold crossed"}),
            )
            .await?)?;
        let id = u64_of(&r.json::<Value>()?);
        ok(self
            .call(who, asset, "claim_task", json!({"task_id": id.to_string()}))
            .await?)?;
        ok(self
            .call(
                who,
                asset,
                "submit_task",
                json!({
                    "task_id": id.to_string(),
                    "evidence_hash": HASH,
                    "evidence_uri": null,
                    "expense": expense.map(|e| e.to_string()),
                    "receipt_hash": expense.map(|_| HASH2),
                }),
            )
            .await?)?;
        Ok(id)
    }

    pub async fn pass_test(&self, asset: &Contract, task: u64) -> Result<()> {
        ok(self
            .call(
                &self.bridge,
                asset,
                "submit_verification_result",
                json!({"task_id": task.to_string(), "passed": true, "details_hash": HASH}),
            )
            .await?)?;
        Ok(())
    }

    pub async fn telemetry(&self, asset: &Contract, metrics: Value) -> Result<()> {
        ok(self
            .call(
                &self.bridge,
                asset,
                "report_telemetry",
                json!({"metrics": metrics}),
            )
            .await?)?;
        Ok(())
    }

    pub async fn cards(&self, who: &Account) -> Result<Vec<Value>> {
        Ok(self
            .view(
                &self.commons,
                "get_cards_for_owner",
                json!({"account": who.id()}),
            )
            .await?
            .as_array()
            .cloned()
            .unwrap_or_default())
    }
}

/// One FunctionCall proposal action (args base64 JSON, deposit yocto, gas Tgas).
pub fn action(method: &str, args: Value, deposit: u128, gas_tgas: u64) -> Value {
    use base64_engine::encode;
    json!({
        "method_name": method,
        "args": encode(args.to_string().as_bytes()),
        "deposit": deposit.to_string(),
        "gas": (gas_tgas * 1_000_000_000_000).to_string(),
    })
}

/// Minimal standard base64 encoder (avoids an extra dependency).
mod base64_engine {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    pub fn encode(input: &[u8]) -> String {
        let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
        for chunk in input.chunks(3) {
            let b = [
                chunk[0],
                *chunk.get(1).unwrap_or(&0),
                *chunk.get(2).unwrap_or(&0),
            ];
            let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
            for i in 0..4 {
                if i <= chunk.len() {
                    out.push(T[((n >> (18 - 6 * i)) & 63) as usize] as char);
                } else {
                    out.push('=');
                }
            }
        }
        out
    }
}
