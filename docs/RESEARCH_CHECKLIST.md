# RESEARCH_CHECKLIST — verify before building

**Rule:** every fact below is an assumption until verified from primary sources (official docs, source code, a testnet call). Record the result, the source URL, and the date in the "Result" column, and copy anything that changes the design into `docs/DECISIONS.md`.

Run research items in parallel. Target: **≤ 90 minutes** total. If an item cannot be verified quickly, choose the safest fallback listed and log it.

Status legend: ☐ not started · ◐ in progress · ✅ verified · ⚠️ differs from assumption (see DECISIONS) · ❌ not possible (fallback used)

---

## A. Hackathon rules (re-read live)

| # | Item | Assumption | Source | Result |
| :--- | :--- | :--- | :--- | :--- |
| A1 | Deadline, dates | Dev ends 2026-11-14T23:59:00Z; judging 16–18 Nov | https://nearhackathon.com/HACKATHON.md | ✅ identical to live HACKATHON.md (lead diff) · 2026-11-09 |
| A2 | Submission fields & API | POST /api/applications, fields as in HACKATHON.md; one submission per repo | same | ✅ identical to live HACKATHON.md (lead diff) · 2026-11-09 |
| A3 | Demo post requirements | X post says "built at NEAR HACKATHON", tags @NEARProtocol #NEARHackathon, video attached | same | ✅ identical to live HACKATHON.md (lead diff) · 2026-11-09 |
| A4 | Code window | Code since 2026-10-19 counts | same (Q-001) | ✅ identical to live HACKATHON.md (lead diff) · 2026-11-09 |
| A5 | Screening | Claude Code & Codex screen reproducibility + README claims | same (Q-017) | ✅ identical to live HACKATHON.md (lead diff) · 2026-11-09 |
| A6 | Social track prompt | Bounty board with earned trust; tiers; public board | https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/12-social.md | ✅ bounty board on existing Sputnik/Trezu treasury, 3 tiers, named-account reputation, public board · raw.githubusercontent.com/nearai/near-hackathon-prompt-examples/main/tracks/12-social.md · 2026-11-09 |
| A7 | NFTs track prompt | NFTs carrying memberships/access rights | https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/10-nfts.md | ✅ "carry credentials, memberships or access rights"; sample prompt is a transferable membership NFT · tracks/10-nfts.md · 2026-11-09 |
| A8 | Agents track prompt | Agents that earn/spend; receipts | https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/07-agents.md | ✅ needs market.near.ai jobs + USDC/Intents payments; we are not primary there · tracks/07-agents.md · 2026-11-09 |

## B. NEAR toolchain

| # | Item | Assumption | How to verify | Result |
| :--- | :--- | :--- | :--- | :--- |
| B1 | `near-sdk` version | 5.x stable; `#[near(contract_state)]`, `#[near]` macros | crates.io + docs.rs | ✅ near-sdk =5.30.1, macros verified on testnet · crates.io · 2026-11-09 |
| B2 | `cargo-near` | `cargo near build` (reproducible build supported, sets contract source metadata) | `cargo near --help`, GitHub near/cargo-near | ✅ non-reproducible + reproducible-wasm (Docker) both build; workspace member untested (D-106) · cargo near --help · 2026-11-09 |
| B3 | `near-workspaces` (Rust) | Sandbox integration tests work in this environment | run a hello test | ✅ near-workspaces 0.24.0 sandbox + real Sputnik WASM passes (6 s) · 2026-11-09 |
| B4 | NEAR CLI | `near` (near-cli-rs) available; commands for create-account, deploy, add/delete key, view, call | `near --version` | ✅ near-cli-rs 0.31.1; commands in RESULTS §3.11 · 2026-11-09 |
| B5 | JS libs | Current recommended JS packages (`near-api-js` vs `@near-js/*`) for signing with function-call keys from env | npm + docs.near.org | ✅ near-api-js 7.4.0 Account+KeyPairSigner tx 2385zXir… · npm · 2026-11-09 |
| B6 | Testnet RPC | Public RPC URL and rate limits | https://docs.near.org/api/rpc/providers | ✅ https://test.rpc.fastnear.com primary, rpc.testnet.near.org fallback; limits unpublished · docs.near.org/api/rpc/providers · 2026-11-09 |
| B7 | Faucet | How to fund new testnet accounts (CLI faucet, near-faucet.io) | try it | ✅ CLI sponsor-by-faucet-service gives 10 NEAR · 2026-11-09 |
| B8 | Sub-accounts | Team top account (e.g. `commonkit-demo.testnet`) can create `makerlab.commonkit-demo.testnet` etc. **Note:** a sub-account can only be created by its parent account. Decide naming accordingly. | create one | ✅ parent-only sub-account creation verified (tx 8CLZ1Rz3…); naming in D-105 · 2026-11-09 |
| B9 | Deleting full-access keys | After deploy, deleting the last full-access key leaves a working contract account; verify via `view_access_key_list` returning empty | do it on a throwaway account | ⚠️ proven in sandbox (keys=[] and contract still works); testnet delete-key blocked by session permissions → chain-ops proves in M2 · 2026-11-09 |
| B10 | Storage staking | Cost per byte; how much balance a keyless contract account needs to stay alive with expected state | docs + measure | ✅ 1e19 yocto/byte (1 NEAR/100 kB), protocol 88; 123 kB contract = 1.23 NEAR · EXPERIMENTAL_protocol_config · 2026-11-09 |
| B11 | Function-call keys | Cannot attach deposit; allowance covers gas only; restrict to receiver + method names | https://docs.near.org/protocol/accounts-contracts/access-keys | ✅ no deposit, gas-only allowance, 1 receiver, method list · docs.near.org/protocol/access-keys · 2026-11-09 |
| B12 | Cross-contract callbacks | `#[private]` callbacks, `env::promise_result`, gas forwarding patterns in near-sdk 5 | docs + example | ✅ `.then(Self::ext(..).cb())` + `#[callback_result]` verified on testnet · 2026-11-09 |
| B13 | NEP-297 events | `EVENT_JSON:` prefix, fields standard/version/event/data | NEP-297 | ✅ `EVENT_JSON:` + standard/version/event (+data); ≤100 logs, ≤16 KiB/receipt · NEP-297 · 2026-11-09 |
| B14 | NEP-171/177/181 | Minimal view methods wallets & explorers need to display NFTs; whether a non-transferable token can still display | NEPs + try in a testnet wallet | ⚠️ NEP-171 1.2.0 / NEP-177 / NEP-181 shapes confirmed; wallet display untested (browser) → verify in M5 · NEPs repo · 2026-11-09 |
| B15 | NEP-413 | Signed message format (message, nonce, recipient, callbackUrl), signature verification in Node, and how to confirm the public key belongs to the account (`view_access_key` RPC) | NEP-413 + a working Node snippet | ✅ Node sign+verify incl. FullAccess key check against testnet (RESULTS §3.5) · NEP-413 + near-api-js/nep413 · 2026-11-09 |
| B16 | Explorer / indexer | Testnet explorer URLs for tx links (nearblocks testnet); an API to list txs/receipts for an account with logs, or confirm fallback to our own `evidence/` log | try API | ✅ nearblocks testnet API is v3 only (`/v3/accounts/<id>/txns`); tx links testnet.nearblocks.io/txns/<hash>; evidence/ stays source of truth · 2026-11-09 |
| B17 | Wallet connection | Currently recommended web wallet connector for NEAR (e.g. NEAR Wallet Selector or newer "near-connect"); testnet support; supports NEP-413 signMessage | docs.near.org web3 apps section | ⚠️ @hot-labs/near-connect 0.12.0 recommended, signMessage supported (docs+typings); browser round trip not done → M5 · docs.near.org/web3-apps/tutorials/wallet-login · 2026-11-09 |

## C. Sputnik DAO v2 (critical — the design depends on it)

| # | Item | Assumption | How to verify | Result |
| :--- | :--- | :--- | :--- | :--- |
| C1 | Testnet factory account | `sputnikv2.testnet`; DAOs at `<name>.sputnikv2.testnet` | view `get_dao_list` | ✅ `sputnikv2.testnet`, 5,504 DAOs, `get_daos({from_index,limit})`; RESULTS §2 · rpc.testnet.near.org · 2026-11-09 |
| C2 | Create DAO | Factory `create({name, args: base64(json{config, policy})})` with attached deposit (~5–6 NEAR?) | source code + do it | ✅ `create({name,args})`, 6 NEAR + 300 Tgas worked; DAO storage 5.40 NEAR; created `ck-r-1nkreg.sputnikv2.testnet` · testnet + github.com/near-daos/sputnik-dao-contract@3d568f9 · 2026-11-09 |
| C3 | Default policy | Role "all"/Everyone can `*:AddProposal`; council group `*:*`; vote threshold | read `default_policy` in source; `get_policy` view | ✅ `all`(Everyone) `*:AddProposal`; council AddProposal/VoteApprove/VoteReject/VoteRemove/Finalize; threshold [1,2] (=2-of-3, D-103) · `get_policy` + policy.rs · 2026-11-09 |
| C4 | Proposal bond | Value of `proposal_bond`; whether it is refunded and when | source + policy view | ✅ 1 NEAR, must be exact; returned on Approved/Rejected/Expired-finalized, lost on Removed (D-102) · proposals.rs · 2026-11-09 |
| C5 | Proposal kinds | JSON shape for `Transfer {token_id:"", receiver_id, amount, msg}` and `FunctionCall {receiver_id, actions:[{method_name,args(base64),deposit,gas}]}` | source | ✅ shapes verified by testnet round trip (RESULTS §3.2); `token_id:""`, `msg:null` for NEAR · 2026-11-09 |
| C6 | `add_proposal` return | Returns proposal id (u64) so a contract callback can store it | source | ✅ returns bare u64, parsed by contract callback on testnet · 2026-11-09 |
| C7 | `get_proposal(id)` | Returns status (`InProgress`, `Approved`, `Rejected`, `Removed`, `Expired`, `Moved`, `Failed`) | source | ⚠️ shape as assumed, but Expired is lazy (needs Finalize) and Removed deletes the proposal (D-102) · proposals.rs/policy.rs · 2026-11-09 |
| C8 | Contract as proposer | A contract account (our asset) can call `add_proposal` with the bond attached in a cross-contract call | sandbox or testnet test | ✅ proven on testnet, tx 4H1F9AVh…, bond returned on approval; no fallback (D-101) · 2026-11-09 |
| C9 | Predecessor on execution | When a `FunctionCall` proposal executes, `predecessor_account_id` in our contract == DAO account | testnet test | ✅ predecessor == DAO, signer == last voter (D-104), tx 5gBzMAGQ… · 2026-11-09 |
| C10 | Transfer to DAO | A plain NEAR transfer to the DAO account increases its treasury balance (no method needed) | testnet test | ✅ plain transfer raised `get_available_amount` 0.48 → 0.98 NEAR, tx hCaX43XN… · 2026-11-09 |
| C11 | Execution gas | Gas limits for multi-action FunctionCall proposals | source | ✅ per-action gas as given + 10 Tgas DAO callback; only the 300 Tgas tx cap; vote with 300 Tgas · proposals.rs + measured · 2026-11-09 |
| C12 | Sputnik UI | Is there a usable testnet UI to show proposals in the video (e.g. Astro/other)? If none, our web app shows proposals via views | search | ⚠️ no hosted testnet Sputnik UI reachable; Trezu only via local `testnet:mock`; our web app shows proposals · 2026-11-09 |

**Fallback if C8 fails:** the asset emits a `escalation_requested` event and stores the request; the agent (or any member) creates the Sputnik proposal from its own account with the bond, passing the escalation id in the description; the asset links it with `link_escalation(escalation_id, proposal_id)` and verifies via `get_proposal`. Log the decision.

## D. Trezu

| # | Item | Assumption | How to verify | Result |
| :--- | :--- | :--- | :--- | :--- |
| D1 | Testnet support | Hosted Trezu works only on mainnet (per another team's README) | trezu docs / repo | ✅ hosted Trezu backend is mainnet-only (nt-fe/README.md) · github.com/NEAR-DevHub/trezu@96a2f2d · 2026-11-09 |
| D2 | Compatibility | Trezu reads standard Sputnik proposals | trezu docs | ✅ reads standard Sputnik get_proposals/get_policy · same repo · 2026-11-09 |

Outcome only changes the README paragraph wording. Do not spend more than 15 minutes here.

## E. Hardware and adapters

| # | Item | Assumption | How to verify | Result |
| :--- | :--- | :--- | :--- | :--- |
| E1 | Moonraker upload+print | `POST /server/files/upload` (multipart, `print=true`) | https://moonraker.readthedocs.io/ | ✅ multipart file/root/path/checksum/print → 201 + print_started · moonraker.readthedocs.io file_manager · 2026-11-09 |
| E2 | Moonraker status | `GET /printer/objects/query?print_stats&virtual_sdcard` → state, print_duration | same | ✅ print_stats state ∈ standby/printing/paused/complete/cancelled/error; print_duration · Klipper Status_Reference + print_stats.py · 2026-11-09 |
| E3 | Moonraker totals | `GET /server/history/totals` → total_print_time, total_jobs | same | ✅ job_totals {total_jobs,total_time,total_print_time,…} · moonraker history docs · 2026-11-09 |
| E4 | Moonraker auth | API key header `X-Api-Key` or trusted clients | same | ✅ X-Api-Key, JWT, oneshot; trusted_clients bypass · moonraker authorization docs · 2026-11-09 |
| E5 | Moonraker lock | Way to prevent jobs that don't come from the bridge (API key only on bridge; disable web UI for members, or Klipper macro check) | same | ✅ no trusted_clients + force_logins + key only on bridge; touchscreen residual risk documented · moonraker configuration · 2026-11-09 |
| E6 | OctoPrint (fallback) | `POST /api/files/local` with `print=true`; `GET /api/job`; `X-Api-Key` | https://docs.octoprint.org/en/master/api/ | ✅ /api/files/local (print=true), GET /api/job, X-Api-Key · docs.octoprint.org · 2026-11-09 |
| E7 | Shelly Gen2/Gen3 plug | `GET /rpc/Switch.Set?id=0&on=true`, `GET /rpc/Switch.GetStatus?id=0` → `output`, `apower`, `aenergy.total` | Shelly API docs | ✅ Switch.Set → was_on; GetStatus output/apower W/aenergy.total Wh · shelly-api-docs gen2 · 2026-11-09 |
| E8 | Shelly Gen1 plug | `/relay/0?turn=on`, `/meter/0` | Shelly docs | ⚠️ endpoints exist; field units not re-quoted in timebox (total = watt-minutes) · shelly gen1 docs · 2026-11-09 |
| E9 | Tasmota plug | `/cm?cmnd=Power%20On`, `/cm?cmnd=Status%208` (energy) | Tasmota docs | ✅ /cm?cmnd=Power%20On, Status 8/10 · tasmota.github.io/docs/Commands · 2026-11-09 |
| E10 | Which hardware we actually have | Printer model + firmware (Klipper/Marlin), plug model | **ask the human once**, record in DECISIONS | ☐ needs the human (lead asks once; record in DECISIONS) |

## F. NEAR AI Cloud (optional, for agent rationale)

| # | Item | Assumption | How to verify | Result |
| :--- | :--- | :--- | :--- | :--- |
| F1 | Endpoint | OpenAI-compatible chat completions; base URL and model names from the dashboard | https://cloud.near.ai, https://docs.near.ai/ | ⚠️ https://cloud-api.near.ai/v1, Bearer key; docs model id not live → pick from public /v1/models; no key in repo so no live completion (D-107) · docs.near.ai/cloud/quickstart.md · 2026-11-09 |
| F2 | Credits | $10 credit via NEAR Builders | HACKATHON.md Q-000 | ☐ dashboard/credits are for the human; not verifiable by researcher |

If F1 is not verified in 15 minutes, ship the template-based rationale and log it. The agent must never depend on an LLM to decide anything.

## G. Competitor sanity check (15 minutes max)

Search GitHub/X for new Social Money submissions involving physical assets, equipment, tool libraries, makerspaces, IoT access. Record anything close in `docs/DECISIONS.md` with how we differ. Known so far: Petty Cash, Hat Tip, FairShare, Mandate, Pull Up, LisDao, AllTogether, Herald, Koperasi (none control physical assets).

**Result (2026-11-09):** ✅ 10-minute web search found no new close entry (physical assets / equipment / IoT access). GitHub CLI search unavailable in this session; re-check before submission.

---

## Research output

When done, write `docs/RESEARCH_RESULTS.md` with:

1. Pinned versions (toolchain, crates, npm packages).
2. Every ⚠️/❌ item and the decision taken.
3. Copy-paste-ready snippets that worked (create DAO, add proposal from contract, NEP-413 verify, Moonraker upload, Shelly toggle).
