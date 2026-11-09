# RESEARCH_RESULTS (M0)

Researcher run: 2026-11-09. All facts below come from source code, official docs or live **testnet** calls (never mainnet).
Status legend as in `RESEARCH_CHECKLIST.md`: ✅ verified · ⚠️ differs from assumption (decision logged) · ❌ not possible (fallback used).

Throwaway testnet accounts used (keys only in `~/.near-credentials/testnet`, never in the repo):
`ck-r-1nkreg-a.testnet` (DAO council / caller), `ck-r-1nkreg-b.testnet` (tiny proxy contract acting as "asset"), DAO `ck-r-1nkreg.sputnikv2.testnet`.

---

## 1. Pinned versions

| Thing | Pin | Evidence |
| :--- | :--- | :--- |
| Rust | rustc **1.98.1**, target `wasm32-unknown-unknown` | local; built + deployed a near-sdk 5.30.1 contract to testnet (protocol 88) with it |
| cargo-near | **0.23.0** (`cargo near build non-reproducible-wasm` for dev; `reproducible-wasm` for release) | both modes run locally (B2) |
| Reproducible image | `sourcescan/cargo-near:0.22.0-rust-1.99.1` @ `sha256:c9655eaf7436b90c87ea8b25739f91063032c5c30ba24cfeafe72c142943b5bb` | emitted by `cargo near new` 0.23.0; build succeeded under Docker 29.8.1 (first run ~6 min incl. pull) |
| near-cli-rs | **0.31.1** (`near`) | used for every testnet call here |
| `near-sdk` | **`=5.30.1`** (published 2026-11-05) | proxy contract built, deployed, cross-contract + `#[callback_result]` verified on testnet |
| `near-workspaces` (Rust) | **0.24.0** (+ `tokio = "1"`, `anyhow = "1"`, `serde_json = "1"`) | sandbox test with real Sputnik WASM passed in 6 s (B3) |
| `near-contract-standards` | 5.30.1 (optional; we implement the NEP-171 views by hand) | crates.io |
| Node | v24.21.0 (repo docs say 22; 24 works) | local |
| `near-api-js` | **7.4.0** (ESM; subpath `near-api-js/nep413`) | tx `2385zXirKQ6jdcLPfk2NiGwa6kWVfQtiDLjUHSp8Mew5` + NEP-413 sign/verify |
| Wallet connector | **`@hot-labs/near-connect` 0.12.0** (+ `near-api-js`) | docs.near.org wallet-login page; `signMessage` in typings |
| Testnet RPC | primary `https://test.rpc.fastnear.com`, fallback `https://rpc.testnet.near.org` | both answered all calls here |
| Explorer | tx links `https://testnet.nearblocks.io/txns/<hash>`; API `https://api-testnet.nearblocks.io/v3/...` (v1 retired 2026-11-05 on testnet) | B16 |
| Sputnik DAO (testnet factory default code) | `version()` = `"2.3.1"`, code_hash `AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH` | `sputnikv2.testnet.get_default_code_hash` |
| Sputnik WASM for sandbox | `contracts/tests/res/sputnikdao2.wasm`, sha256 `880bae9a58c99ec1efe8b10cf834b3f0c0ebc7a05d71206f3c1202c4280952da` | `contracts/tests/res/SOURCE.md` |
| NEAR AI Cloud | base `https://cloud-api.near.ai/v1`, model from `GET /v1/models` (e.g. `z-ai/glm-5.3-flash`) | F1 |

Testnet protocol facts (RPC `EXPERIMENTAL_protocol_config`, protocol 88, 2026-11-09): `storage_amount_per_byte` = 10^19 yocto (**1 NEAR per 100 kB**), max tx prepaid gas **1,000 Tgas** (not 300), ≤ 100 logs and ≤ 16,384 bytes of logs per receipt, ≤ 100 actions per receipt, max contract 4 MiB.

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
| C11 ✅ | Source: each action gets exactly its `gas` (`Gas(action.gas.0)`); DAO adds an `on_proposal_callback` with 10 Tgas. No per-proposal cap other than the tx gas limit (testnet protocol 88: 1,000 Tgas per tx): the voter's `act_proposal` prepaid gas must cover `Σ action.gas + ~20 Tgas`. Measured: `act_proposal` 3.3 Tgas, `on_proposal_callback` 2.4 Tgas, `add_proposal` 2.1 Tgas, contract `on_proposed` callback 1.25 Tgas. Vote with 300 Tgas and keep Σ action gas ≤ 250 Tgas (portable to mainnet's older 300 Tgas habit). |

Vote threshold note (source `WeightOrRatio::to_weight`): `Ratio(n,d)` → `min(total*n/d + 1, total)`. For a 3-member council: `[1,2]` → **2 of 3**; `[2,3]` → **3 of 3**. A single-member council approves with one vote (execution happens inside that vote tx).

### Impact on CONTRACT_SPEC (see D-101 … D-103)

- §3.5 stays: the asset **can** call `add_proposal` itself. Bond attach must equal `proposal_bond` exactly (cache via `refresh_dao_policy`).
- §3.5 `on_escalation_synced` must (a) treat `InProgress && submission_time + proposal_period < now` as `Expired` (needs cached `proposal_period`), (b) treat a failing `get_proposal` (deleted ⇒ `Removed`) as `Rejected` with bond lost, (c) credit returned bonds back (see D-102).
- Bond accounting: the bond leaves `float_free` when sent; it comes back as an unannounced transfer on Approved / Rejected / Expired-finalized. Track `bonds_outstanding` and re-credit `bond_paid` to `float_free` in `on_escalation_synced` when the synced status is one that returns the bond.
- DAO_INTEGRATION §2: "2/3 threshold" must be `threshold: [1,2]` (= 2-of-3) — `[2,3]` would require all 3.

---

## 2b. Other items (A, B, D, E, F, G)

| # | Result |
| :--- | :--- |
| A1–A5 ✅ | Live HACKATHON.md diffed by the lead on 2026-11-09: identical to `docs/HACKATHON.md`. |
| A6 ✅ | Social track prompt (raw GitHub, 1,938 bytes, 2026-11-09): bounty board on an existing Sputnik/Trezu treasury, "no new multisig", reputation tied to named accounts and traceable to finished work, **three tiers** (auto-approve small for trusted, one council member mid, DAO proposal large), public board. Matches our assumption. Starting links: `github.com/NEAR-DevHub/trezu`, `github.com/NEAR-DevHub/trezu-docs`, sputnik-dao-contract, near.social. |
| A7 ✅ | NFTs track: "NFTs as accounts … carry credentials, memberships or access rights"; sample prompt is a *transferable* membership NFT tied to a sub-account. Our non-transferable cards fit the "access rights" sentence, not the sample prompt. |
| A8 ✅ | Agents track sample prompt needs market.near.ai jobs, negotiation, USDC/NEAR/Intents payments and receipts. Our bounded maintenance agent does not cover that; keep `agents` as a non-primary track (D-001 unchanged). |
| B1 ✅ | `near-sdk` 5.30.1: `#[near(contract_state)]`, `#[near]`, `#[init]`, `#[private]`, `#[payable]`, `Self::ext(...)`, `NearToken`, `Gas::from_tgas` all compile and run on testnet. |
| B2 ✅ | `cargo near build non-reproducible-wasm` (60 s cold) and `cargo near build reproducible-wasm` (Docker, needs: clean committed git tree, `repository` in Cargo.toml, `[package.metadata.near.reproducible_build]` with image + digest; output embeds NEP-330 source metadata). Not yet tried on a Cargo **workspace** member — contract team: put the metadata section in each member's Cargo.toml and run with `--manifest-path`; if it fails, ship non-reproducible and say so (D-106). |
| B3 ✅ | near-workspaces 0.24.0 sandbox works on this Mac (arm64): deployed real `sputnikdao2.wasm` + a near-sdk 5.30.1 contract, contract-as-proposer, approval, all in 6 s. (cargo-near's new template uses `near-sandbox 0.4` + `near-api 0.8` instead; near-workspaces is still fine.) |
| B4 ✅ | `near` 0.31.1: `account create-account sponsor-by-faucet-service|fund-myself`, `contract deploy … with-init-call`, `contract call-function as-transaction|as-read-only`, `account delete-keys`, `tokens … send-near` (snippets §3). |
| B5 ✅ | `near-api-js` 7.4.0: `new Account(id, new JsonRpcProvider({url}), KeyPairSigner.fromSecretKey(env))` → `callFunctionRaw({contractId, methodName, args, gas, deposit})` (tx `2385zXir…`). `@near-js/*` 2.5.1 packages are a year old; use `near-api-js` 7. |
| B6 ✅ | docs.near.org/api/rpc/providers lists testnet `https://test.rpc.fastnear.com`, `https://archival-rpc.testnet.near.org` ("severely rate limited"), dRPC, Intear, ZAN. `rpc.testnet.near.org` still works but is not listed. Use FastNEAR primary + fallback, retry on 429. |
| B7 ✅ | `near account create-account sponsor-by-faucet-service <name>.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create` → **10 NEAR** per account, no captcha. |
| B8 ✅ | `printer-01.ck-r-1nkreg-a.testnet` created by its parent (tx `8CLZ1Rz3nc2SEHK5i4En8WBUH1PgaF6xpi4VNdVT5oQU`); creating `evil.ck-r-1nkreg-a.testnet` as another account is refused. Consequence for deploy order: see D-105. |
| B9 ⚠️ | Proven in **sandbox** (key deleted, `view_access_keys` empty, contract still proposes and receives the bond). On testnet the delete-key call was blocked by this session's permission policy, so chain-ops does the testnet proof in M2 under the human's permission. RPC check: `query {request_type:"view_access_key_list"}` → `{"keys":[]}`. |
| B10 ✅ | 10^19 yocto/byte → 1 NEAR per 100 kB. Measured: 123 kB proxy WASM + tiny state = 123,229 bytes = 1.23 NEAR locked; Sputnik DAO 540 kB = 5.4 NEAR. A keyless account must keep `balance ≥ storage_usage × 10^19`. Size `storage_reserve` = (wasm bytes + expected state bytes) × 10^19 × 1.5; measure the real asset WASM in M1. |
| B11 ✅ | docs.near.org/protocol/access-keys: function-call keys **cannot attach deposit**, allowance = gas only (`null` = unlimited; when spent, key is dead), one receiver, optional method list. ⇒ bridge/agent keys can call 0-deposit methods only (all BRIDGE/AGENT methods in CONTRACT_SPEC are 0-deposit — OK). |
| B12 ✅ | Pattern verified on testnet: `Promise::new(x).function_call(...).then(Self::ext(env::current_account_id()).with_static_gas(G).cb())` with `#[private] fn cb(&mut self, #[callback_result] r: Result<T, PromiseError>)`. Failed callee ⇒ `Err` and attached deposit is auto-refunded to the caller contract. Measured: `add_proposal` 2.1 Tgas, callback 1.25 Tgas. |
| B13 ✅ | NEP-297: log line `EVENT_JSON:` + one JSON object with required `standard`, `version`, `event` (strings) and optional `data`. Receipt limits: ≤100 logs, ≤16 KiB total. |
| B14 ⚠️ | NEP-171 v1.2.0 core: `Token {token_id, owner_id}` (+ `metadata` from NEP-177); mint log `EVENT_JSON:{"standard":"nep171","version":"1.2.0","event":"nft_mint","data":[{"owner_id":"…","token_ids":["…"],"memo"?}]}`. NEP-177: contract metadata `spec:"nft-1.0.0"`, `name`, `symbol`, `base_uri` (nullable), `icon` (data URL recommended); token `media` + `media_hash` (base64 sha256, required if `media` set). NEP-181 views: `nft_total_supply`, `nft_tokens`, `nft_supply_for_owner`, `nft_tokens_for_owner`. **Wallet display not tested** (needs a browser wallet); FastNEAR indexer `GET https://test.api.fastnear.com/v1/account/<id>/nft` returns NFT contracts per account from mint events — verify there after the first mint (M1/M5). |
| B15 ✅ | NEP-413 proven in Node: hash = `sha256(u32le(2^31+413) ‖ borsh{message:string, nonce:[u8;32], recipient:string, callbackUrl:Option<string>})`, ed25519 over the hash. `near-api-js/nep413.verifyMessage` checks signature **and** that the key is a **FullAccess** key of the account (via `view_access_key`); a wrong account fails with "access key … does not exist". Manual node:crypto verify matched. Snippet §3.5. |
| B16 ✅ | NearBlocks testnet API is **v3 only** (v1 retired 2026-11-05): `GET https://api-testnet.nearblocks.io/v3/accounts/<id>/txns?limit=N` and `/v3/txns/<hash>` work without a key. `testnet.nearblocks.io/txns/<hash>` returns 403 to curl (bot protection) — fine for humans; `explorer.testnet.near.org/transactions/<hash>` returns 200. FastNEAR `POST https://tx.test.fastnear.com/v0/account {"account_id"}` lists txs. Source of truth for evidence stays RPC `EXPERIMENTAL_tx_status` + our `evidence/` files. |
| B17 ⚠️ | docs.near.org wallet-login recommends **NEAR Connect** (`@hot-labs/near-connect`): `new NearConnector({network:"testnet"})`, `connector.connect()`, `wallet.signMessage({message, recipient, nonce})` → `{accountId, publicKey, signature}`. Version 0.12.0 published 2026-10-26. Browser wallet round trip on testnet **not done here** (needs a browser + wallet); frontend verifies in M5. Server side of NEP-413 is proven (B15). |
| C12 ⚠️ | No hosted testnet Sputnik UI reachable (`testnet.app.astrodao.com`, `testnet.sputnik.fund`: no response). Trezu's hosted backend is mainnet-only; its repo has a dev-only `bun run testnet:mock` that renders testnet DAOs locally. Our web app shows proposals from views (`get_last_proposal_id` + `get_proposals`). |
| D1 ✅ | Trezu repo `NEAR-DevHub/trezu` (commit `96a2f2d`, 2026-11-09) `nt-fe/README.md`: "The production backend is mainnet-only"; a local mock can open a testnet DAO. |
| D2 ✅ | Trezu reads standard Sputnik `get_proposals`/`get_proposal`/`get_policy` (mock backend source). Its bulk-payment contract hard-requires `*.sputnik-dao.near` (mainnet). README wording in DAO_INTEGRATION §7 stays accurate. |
| E1 ✅ | Moonraker `POST /server/files/upload` multipart: `file` (required), `root` (default `gcodes`), `path`, `checksum` (sha256 hex; mismatch → 422), `print` (`"true"` starts print). 201 + `{item:{path,root,modified,size,permissions}, print_started, print_queued, action:"create_file"}`. Start existing file: `POST /printer/print/start?filename=…`; also `/printer/print/pause|cancel`. |
| E2 ✅ | `GET /printer/objects/query?print_stats&virtual_sdcard` → `{result:{eventtime, status:{print_stats:{filename,total_duration,print_duration,filament_used,state,message,info}, virtual_sdcard:{is_active,progress,file_path,file_position,file_size}}}}`. `state` ∈ `standby, printing, paused, complete, cancelled, error` (klippy/extras/print_stats.py). |
| E3 ✅ | `GET /server/history/totals` → `{result:{job_totals:{total_jobs,total_time,total_print_time,total_filament_used,longest_job,longest_print}, auxiliary_totals:[…]}}` (seconds, mm). |
| E4 ✅ | `X-Api-Key: <key>` header (get: `GET /access/api_key`, rotate: `POST /access/api_key`); or JWT `Authorization: Bearer` via `POST /access/login`; oneshot `?token=` (5 s). Trusted clients (IP/CIDR/domain in `[authorization] trusted_clients`) get full access without a key. |
| E5 ✅ | Lock recipe: `[authorization]` with **no `trusted_clients`** except the bridge host (or none), `force_logins: True` after creating a user, API key known only to the bridge, `cors_domains` unset; members use the bridge, not Mainsail/Fluidd. Residual: anyone at the printer's touchscreen/SD card can still start jobs — telemetry deltas from `history/totals` still record it; documented honestly. |
| E6 ✅ | OctoPrint `POST /api/files/local` multipart (`file`, `path`, `select`, `print`), `X-Api-Key`, needs `FILES_UPLOAD` permission, 201 + Location; `GET /api/job` → `{job, progress:{completion, printTime, printTimeLeft}, state:"Printing"}`. |
| E7 ✅ | Shelly Gen2/3: `GET /rpc/Switch.Set?id=0&on=true[&toggle_after=N]` → `{"was_on":false}`; `GET /rpc/Switch.GetStatus?id=0` → `output`, `apower` (W), `voltage`, `current`, `aenergy.total` (**Wh**), `aenergy.by_minute` (**mWh**). Auth (digest) only if enabled on device — not re-verified. |
| E8 ⚠️ | Shelly Gen1 docs page too large for the timebox; nav confirms `/relay/0` and `/meter/0` exist. Fields from the Gen1 page (not re-quoted): `/relay/0?turn=on|off|toggle&timer=N`, `/meter/0` → `power` (W), `total` (**watt-minutes**). Adapter treats Gen1 as best-effort. |
| E9 ✅ | Tasmota: `http://<ip>/cm?cmnd=Power%20On` (`user`/`password` query params if set); Power values `0/off`, `1/on`, `2/toggle`; energy via `Status 8` (legacy, "power usage") / `Status 10` (sensors, newer). |
| E10 ☐ | Needs the human (hardware question) — not asked by the researcher; lead to ask once. |
| F1 ⚠️ | `https://cloud-api.near.ai/v1/chat/completions`, `Authorization: Bearer <key>`, OpenAI-compatible (docs.near.ai/cloud/quickstart.md). `GET /v1/models` is public and lists live ids; the docs' example id `zai-org/GLM-5.1-FP8` is **not** in the live list — pick the model from `/v1/models` (e.g. `z-ai/glm-5.3-flash`, `openai/gpt-5-nano`). Chat without key → 401. No key in the repo (`.env.example` has empty `NEARAI_*`), so a real completion was **not** run; agent ships the template rationale by default (D-107). |
| F2 ☐ | Credits are a dashboard matter for the human; not verifiable by the researcher. |
| G ✅ | 10-minute web search found no new Social Money entry controlling physical assets/equipment; list in RESEARCH_CHECKLIST stands. Limited search (GitHub CLI search unavailable). |

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

### 3.4 Sandbox test with the real Sputnik WASM (near-workspaces 0.24.0) — passed

```rust
let worker = near_workspaces::sandbox().await?;
let dao_wasm = std::fs::read("res/sputnikdao2.wasm")?;
let root = worker.root_account()?;
let council = root.create_subaccount("council").initial_balance(NearToken::from_near(20)).transact().await?.into_result()?;
let dao = root.create_subaccount("dao").initial_balance(NearToken::from_near(10)).transact().await?.into_result()?
    .deploy(&dao_wasm).await?.into_result()?;
dao.call("new").args_json(json!({"config":{"name":"dao","purpose":"t","metadata":""},"policy":[council.id()]}))
    .transact().await?.into_result()?;
// keyless asset: delete its only full-access key
let asset_acc = root.create_subaccount("asset").initial_balance(NearToken::from_near(5)).transact().await?.into_result()?;
let asset = asset_acc.deploy(&asset_wasm).await?.into_result()?;
asset.call("new").transact().await?.into_result()?;
asset_acc.batch(asset.id()).delete_key(asset_acc.secret_key().public_key()).transact().await?.into_result()?;
assert!(worker.view_access_keys(asset.id()).await?.is_empty());
// vote (single-member council executes immediately)
council.call(dao.id(), "act_proposal").args_json(json!({"id":0,"action":"VoteApprove"})).max_gas().transact().await?.into_result()?;
```

### 3.5 NEP-413 verify in Node (bridge side) — passed against testnet

```js
import { createHash, createPublicKey, verify } from "node:crypto";
import { PublicKey } from "near-api-js";            // or decode base58 yourself
const bstr = (s) => { const b = Buffer.from(s, "utf8"), l = Buffer.alloc(4); l.writeUInt32LE(b.length); return Buffer.concat([l, b]); };
export function nep413Hash({ message, nonce /* 32 bytes */, recipient, callbackUrl }) {
  const tag = Buffer.alloc(4); tag.writeUInt32LE(2 ** 31 + 413);
  const cb = callbackUrl == null ? Buffer.from([0]) : Buffer.concat([Buffer.from([1]), bstr(callbackUrl)]);
  return createHash("sha256").update(Buffer.concat([tag, bstr(message), Buffer.from(nonce), bstr(recipient), cb])).digest();
}
export function verifyEd25519(publicKeyStr /* "ed25519:..." */, payload, signature /* Uint8Array */) {
  const raw = Buffer.from(PublicKey.from(publicKeyStr).data);
  const spki = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]), format: "der", type: "spki" });
  return verify(null, nep413Hash(payload), spki, Buffer.from(signature));
}
// Then prove the key belongs to the account (FullAccess), e.g.:
// POST rpc {"method":"query","params":{"request_type":"view_access_key","finality":"final","account_id":ACC,"public_key":PK}}
//   -> result.permission === "FullAccess"; error "access key ... does not exist" => reject.
// Or in one call: import { verifyMessage } from "near-api-js/nep413";
//   await verifyMessage({ signerAccountId, signerPublicKey, payload, signature, provider }); // throws on failure
```
Bridge must also: check `recipient` equals the bridge id, reject reused nonces, and check a timestamp inside `message`.

### 3.6 Keyless check (RPC)

```bash
curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key_list","finality":"final","account_id":"printer-01.example.testnet"}}' \
  | jq '.result.keys | length'   # must be 0
```

### 3.7 near-api-js 7.4.0 function call from a script

```js
import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";
const provider = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });
const account = new Account(process.env.AGENT_ACCOUNT_ID, provider, KeyPairSigner.fromSecretKey(process.env.AGENT_PRIVATE_KEY));
const out = await account.callFunctionRaw({ contractId, methodName: "ping", args: { note: "x" }, gas: 30_000_000_000_000n, deposit: 0n });
console.log(out.transaction.hash);
const view = await provider.callFunction({ contractId, method: "get_state", args: {} });
```

### 3.8 Moonraker (docs, not run against hardware)

```bash
curl -H "X-Api-Key: $MOONRAKER_KEY" -F "file=@job.gcode" -F "print=true" http://$PRINTER/server/files/upload
curl -H "X-Api-Key: $MOONRAKER_KEY" "http://$PRINTER/printer/objects/query?print_stats&virtual_sdcard"
curl -H "X-Api-Key: $MOONRAKER_KEY" http://$PRINTER/server/history/totals
```

### 3.9 Shelly Gen2/3 and Tasmota (docs, not run against hardware)

```bash
curl "http://$PLUG/rpc/Switch.Set?id=0&on=true"        # {"was_on":false}
curl "http://$PLUG/rpc/Switch.GetStatus?id=0"          # output, apower (W), aenergy.total (Wh)
curl "http://$PLUG/cm?cmnd=Power%20On"                 # Tasmota
curl "http://$PLUG/cm?cmnd=Status%208"                 # Tasmota energy
```

### 3.10 NEAR AI Cloud call shape (docs; no key available to run it)

```bash
curl -s https://cloud-api.near.ai/v1/models | jq -r '.data[].id'    # public, pick a live id
curl https://cloud-api.near.ai/v1/chat/completions -H "Authorization: Bearer $NEARAI_API_KEY" \
  -H 'content-type: application/json' \
  -d '{"model":"z-ai/glm-5.3-flash","max_tokens":200,"messages":[{"role":"user","content":"..."}]}'
```

### 3.11 Faucet account + sub-account (near-cli-rs 0.31.1)

```bash
near account create-account sponsor-by-faucet-service ck-r-xxxx.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
near account create-account fund-myself printer-01.ck-r-xxxx.testnet '1 NEAR' autogenerate-new-keypair save-to-legacy-keychain sign-as ck-r-xxxx.testnet network-config testnet sign-with-legacy-keychain send
near contract deploy printer-01.ck-r-xxxx.testnet use-file asset.wasm with-init-call new json-args '{...}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send
```

### 3.12 Reproducible build section (from `cargo near new`, cargo-near 0.23.0; built OK)

```toml
[package.metadata.near.reproducible_build]
image = "sourcescan/cargo-near:0.22.0-rust-1.99.1"
image_digest = "sha256:c9655eaf7436b90c87ea8b25739f91063032c5c30ba24cfeafe72c142943b5bb"
passed_env = []
container_build_command = ["cargo", "near", "build", "non-reproducible-wasm", "--locked"]
```
Requires a `repository` URL in `[package]` and a clean, committed git tree.
