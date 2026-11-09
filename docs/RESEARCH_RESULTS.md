# RESEARCH_RESULTS (M0)

Researcher run: 2026-11-09. All facts below come from source code, official docs or live **testnet** calls (never mainnet).
Status legend as in `RESEARCH_CHECKLIST.md`: ✅ verified · ⚠️ differs from assumption (decision logged) · ❌ not possible (fallback used).

Throwaway testnet accounts used (keys only in `~/.near-credentials/testnet`, never in the repo):
`ck-r-1nkreg-a.testnet` (DAO council / caller), `ck-r-1nkreg-b.testnet` (tiny proxy contract acting as "asset"), DAO `ck-r-1nkreg.sputnikv2.testnet`.

---

## 1. Pinned versions

(see bottom of this section for the toolchain; filled progressively)

| Thing | Version | Source / note |
| :--- | :--- | :--- |
| Sputnik DAO (testnet factory default code) | `version()` = `"2.3.1"`, code_hash `AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH` | `sputnikv2.testnet.get_default_code_hash` |
| Sputnik WASM for sandbox | `contracts/tests/res/sputnikdao2.wasm`, sha256 `880bae9a…0952da` | `contracts/tests/res/SOURCE.md` |

---

## 2. Sputnik DAO v2 on testnet (section C) — PROVEN ON TESTNET

### Results

| # | Result |
| :--- | :--- |
| C1 ✅ | Factory `sputnikv2.testnet` exists (5,504 DAOs). DAOs are `<name>.sputnikv2.testnet`. Views: `get_dao_list()` (all, big), `get_daos({from_index, limit})`, `get_number_daos()`, `get_default_code_hash()`, `get_contracts_metadata()`. |
| C2 ✅ | `create({name, args: base64(json{config:{name,purpose,metadata:""}, policy:[council...]})})`, 300 Tgas, **6 NEAR** attached worked. New DAO storage = 540,332 bytes = **5.40 NEAR locked**; anything above is treasury. Failed creation refunds the deposit to the caller (`on_create`). Created `ck-r-1nkreg.sputnikv2.testnet`. |
| C3 ✅ | Passing `policy` as an array of accounts gives the default policy: role `all` (`Everyone`, `["*:AddProposal"]`), role `council` (`Group[...]`, `["*:AddProposal","*:VoteApprove","*:VoteReject","*:VoteRemove","*:Finalize"]`), `default_vote_policy {weight_kind:"RoleWeight", quorum:"0", threshold:[1,2]}`. **Any account, including a contract, may add any proposal kind** (bond required). |
| C4 ✅ | `proposal_bond` = `"1000000000000000000000000"` (1 NEAR); `proposal_period` = `"604800000000000"` ns (7 days). `add_proposal` requires attached == bond **exactly** (`assert_eq!` → `ERR_MIN_BOND`). Bond is **returned to the proposer** on Approved (after successful execution), Rejected, and Expired-via-`Finalize`. **Not** returned on Removed (spam) and not while `Failed`. Bond is returned by a plain `Transfer` receipt to the proposer — i.e. the asset contract receives NEAR **without a method call**. |
| C5 ✅ | Shapes (exact, verified by testnet round trip): see §3.2. `Transfer.token_id` = `""` for NEAR; `msg` must be `null` for NEAR (`ERR_BASE_TOKEN_NO_MSG`). `FunctionCall.actions[].args` = base64 string, `deposit` = U128 string, `gas` = U64 string. |
| C6 ✅ | `add_proposal` returns the new id as a bare JSON number (`u64`); a `#[callback_result] Result<u64, PromiseError>` parsed it on testnet (log `proposal_id=0`). Ids start at 0 (`get_last_proposal_id` = next id). |
| C7 ⚠️ | `get_proposal({id})` → `{id, proposer, description, kind, status, vote_counts:{role:[approve,reject,remove]}, votes:{account:"Approve"}, submission_time:"<ns string>"}`. Status values: `InProgress, Approved, Rejected, Removed, Expired, Moved, Failed`. **Deviation:** `Expired` is only *stored* after someone calls `act_proposal(id, "Finalize")` (council permission); until then an expired proposal still reads `InProgress`. A `Removed` proposal is **deleted** — `get_proposal` then panics `ERR_NO_PROPOSAL`. See D-101. |
| C8 ✅ | **A contract account can open a proposal with the bond paid from its own balance in a cross-contract call.** Tx `4H1F9AVhVfzwHrSJriuoMVCB8tRKBycSW1CGGre1C6ke`: `ck-r-1nkreg-a` calls `ck-r-1nkreg-b.propose_transfer` (0 deposit) → `b` calls `dao.add_proposal` with 1 NEAR → callback got `0`. `get_proposal(0).proposer == "ck-r-1nkreg-b.testnet"`. Approve tx `6Jc9MfR2YK9AiJKi1twW9zUGTGMbP4keNWnELPw2t9Mu`: 0.1 NEAR paid to receiver, status `Approved`, **bond 1 NEAR returned to `b`** (balance 8.9989 → 9.9989). Failure path tx `GKvF8t9LyXBcxfXBbDKygfXKLbQYyHLcbYUvRdKJ8DmV` (wrong bond 0.5 NEAR): DAO panicked `ERR_MIN_BOND`, callback received `Err`, the attached 0.5 NEAR came back to `b` automatically (standard refund receipt). **No fallback needed.** |
| C9 ✅ | Tx `5gBzMAGQHmA41TUr3g43PKARdY5YEuvPaRwMsGjQu5ZG` (approve of FunctionCall proposal 1 with **two** actions): log `ping from predecessor=ck-r-1nkreg.sputnikv2.testnet signer=ck-r-1nkreg-a.testnet deposit=0.010 NEAR`. So `predecessor == DAO` ✅; attached deposit arrives ✅; **`signer` is the last voter** (never use `signer_account_id` for auth). Multiple actions in one FunctionCall proposal run in **one receipt** (atomic: one panics → all revert). |
| C10 ✅ | Tx `hCaX43XNEnnzi5ZghGYmefmesSB4A5yGk8FxqGiFng9`: plain 0.5 NEAR transfer → `get_available_amount` 0.4804 → 0.9804 NEAR. No method needed. Note `get_available_amount` = balance − storage − locked bonds. |
| C11 ✅ | Source: each action gets exactly its `gas` (`Gas(action.gas.0)`); DAO adds an `on_proposal_callback` with 10 Tgas. No per-proposal cap other than the 300 Tgas tx limit: the voter's `act_proposal` prepaid gas must cover `Σ action.gas + ~20 Tgas`. Measured: `act_proposal` 3.3 Tgas, `on_proposal_callback` 2.4 Tgas, `add_proposal` 2.1 Tgas, contract `on_proposed` callback 1.25 Tgas. Use 300 Tgas when voting and ≤ 250 Tgas total action gas. |

Vote threshold note (source `WeightOrRatio::to_weight`): `Ratio(n,d)` → `min(total*n/d + 1, total)`. For a 3-member council: `[1,2]` → **2 of 3**; `[2,3]` → **3 of 3**. A single-member council approves with one vote (execution happens inside that vote tx).

### Impact on CONTRACT_SPEC (see D-101 … D-103)

- §3.5 stays: the asset **can** call `add_proposal` itself. Bond attach must equal `proposal_bond` exactly (cache via `refresh_dao_policy`).
- §3.5 `on_escalation_synced` must (a) treat `InProgress && submission_time + proposal_period < now` as `Expired` (needs cached `proposal_period`), (b) treat a failing `get_proposal` (deleted ⇒ `Removed`) as `Rejected` with bond lost, (c) credit returned bonds back (see D-102).
- Bond accounting: the bond leaves `float_free` when sent; it comes back as an unannounced transfer on Approved / Rejected / Expired-finalized. Track `bonds_outstanding` and re-credit `bond_paid` to `float_free` in `on_escalation_synced` when the synced status is one that returns the bond.
- DAO_INTEGRATION §2: "2/3 threshold" must be `threshold: [1,2]` (= 2-of-3) — `[2,3]` would require all 3.

---

## 3. Snippets that worked

### 3.1 Create a DAO (near-cli-rs 0.31.1, testnet)

```bash
ARGS=$(printf '%s' '{"config":{"name":"ck-r-1nkreg","purpose":"COMMONKIT research throwaway","metadata":""},"policy":["ck-r-1nkreg-a.testnet"]}' | base64)
near contract call-function as-transaction sputnikv2.testnet create \
  json-args "{\"name\":\"ck-r-1nkreg\",\"args\":\"$ARGS\"}" \
  prepaid-gas '300 Tgas' attached-deposit '6 NEAR' \
  sign-as ck-r-1nkreg-a.testnet network-config testnet sign-with-legacy-keychain send
```

### 3.2 Proposal JSON shapes (as accepted by testnet)

```json
{"proposal":{"description":"COMMONKIT escalation printer-01#3: nozzle","kind":{"Transfer":{"token_id":"","receiver_id":"supplier.testnet","amount":"100000000000000000000000","msg":null}}}}
```
```json
{"proposal":{"description":"Fund float","kind":{"FunctionCall":{"receiver_id":"printer-01.makerlab.testnet","actions":[
  {"method_name":"fund_float","args":"e30=","deposit":"2000000000000000000000000","gas":"50000000000000"}]}}}}
```
Vote: `act_proposal({"id":1,"action":"VoteApprove"})` (also `VoteReject`, `VoteRemove`, `Finalize`), 300 Tgas, 0 deposit.

`get_proposal({"id":0})` (verbatim):
```json
{"id":0,"proposer":"ck-r-1nkreg-b.testnet","description":"COMMONKIT research escalation from ck-r-1nkreg-b.testnet","kind":{"Transfer":{"token_id":"","receiver_id":"ck-r-1nkreg-a.testnet","amount":"100000000000000000000000","msg":null}},"status":"InProgress","vote_counts":{},"votes":{},"submission_time":"1794224510677148772"}
```
After approval: `"status":"Approved","votes":{"ck-r-1nkreg-a.testnet":"Approve"},"vote_counts":{"council":[1,0,0]}`.

`get_policy()` (verbatim, default policy):
```json
{"roles":[{"name":"all","kind":"Everyone","permissions":["*:AddProposal"],"vote_policy":{}},{"name":"council","kind":{"Group":["ck-r-1nkreg-a.testnet"]},"permissions":["*:Finalize","*:AddProposal","*:VoteApprove","*:VoteReject","*:VoteRemove"],"vote_policy":{}}],"default_vote_policy":{"weight_kind":"RoleWeight","quorum":"0","threshold":[1,2]},"proposal_bond":"1000000000000000000000000","proposal_period":"604800000000000","bounty_bond":"1000000000000000000000000","bounty_forgiveness_period":"86400000000000"}
```
Other views: `get_last_proposal_id()` → next id (u64), `get_proposals({from_index, limit})` → `[ProposalOutput]`, `get_config()` → `{name,purpose,metadata}`, `get_available_amount()` / `get_locked_storage_amount()` → U128 strings, `version()` → `"2.3.1"`.

### 3.3 Contract opens a proposal with the bond (near-sdk 5.30.1) — proven on testnet

```rust
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, log, near, AccountId, Gas, NearToken, Promise, PromiseError};

const GAS_ADD_PROPOSAL: Gas = Gas::from_tgas(30);
const GAS_CB: Gas = Gas::from_tgas(10);

#[near]
impl Proxy {
    pub fn propose_transfer(&mut self, dao: AccountId, receiver_id: AccountId, amount: U128, bond: U128) -> Promise {
        let args = json!({ "proposal": {
            "description": format!("COMMONKIT escalation {}", env::current_account_id()),
            "kind": { "Transfer": { "token_id": "", "receiver_id": receiver_id, "amount": amount, "msg": null } }
        }});
        Promise::new(dao)
            .function_call("add_proposal".to_string(), args.to_string().into_bytes(),
                           NearToken::from_yoctonear(bond.0), GAS_ADD_PROPOSAL)
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CB).on_proposed())
    }

    #[private]
    pub fn on_proposed(&mut self, #[callback_result] res: Result<u64, PromiseError>) -> Option<u64> {
        match res {
            Ok(id) => { log!("proposal_id={}", id); self.last_proposal_id = Some(id); Some(id) }
            Err(_) => { log!("add_proposal failed"); None } // attached bond is refunded automatically
        }
    }
}
```
Full file: scratch only (`proxy/src/lib.rs`), reproduced above in the parts that matter.
