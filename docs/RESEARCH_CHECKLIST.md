# RESEARCH_CHECKLIST — verify before building

**Rule:** every fact below is an assumption until verified from primary sources (official docs, source code, a testnet call). Record the result, the source URL, and the date in the "Result" column, and copy anything that changes the design into `docs/DECISIONS.md`.

Run research items in parallel. Target: **≤ 90 minutes** total. If an item cannot be verified quickly, choose the safest fallback listed and log it.

Status legend: ☐ not started · ◐ in progress · ✅ verified · ⚠️ differs from assumption (see DECISIONS) · ❌ not possible (fallback used)

---

## A. Hackathon rules (re-read live)

| # | Item | Assumption | Source | Result |
| :--- | :--- | :--- | :--- | :--- |
| A1 | Deadline, dates | Dev ends 2026-11-14T23:59:00Z; judging 16–18 Nov | https://nearhackathon.com/HACKATHON.md | ☐ |
| A2 | Submission fields & API | POST /api/applications, fields as in HACKATHON.md; one submission per repo | same | ☐ |
| A3 | Demo post requirements | X post says "built at NEAR HACKATHON", tags @NEARProtocol #NEARHackathon, video attached | same | ☐ |
| A4 | Code window | Code since 2026-10-19 counts | same (Q-001) | ☐ |
| A5 | Screening | Claude Code & Codex screen reproducibility + README claims | same (Q-017) | ☐ |
| A6 | Social track prompt | Bounty board with earned trust; tiers; public board | https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/12-social.md | ☐ |
| A7 | NFTs track prompt | NFTs carrying memberships/access rights | https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/10-nfts.md | ☐ |
| A8 | Agents track prompt | Agents that earn/spend; receipts | https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/07-agents.md | ☐ |

## B. NEAR toolchain

| # | Item | Assumption | How to verify | Result |
| :--- | :--- | :--- | :--- | :--- |
| B1 | `near-sdk` version | 5.x stable; `#[near(contract_state)]`, `#[near]` macros | crates.io + docs.rs | ☐ |
| B2 | `cargo-near` | `cargo near build` (reproducible build supported, sets contract source metadata) | `cargo near --help`, GitHub near/cargo-near | ☐ |
| B3 | `near-workspaces` (Rust) | Sandbox integration tests work in this environment | run a hello test | ☐ |
| B4 | NEAR CLI | `near` (near-cli-rs) available; commands for create-account, deploy, add/delete key, view, call | `near --version` | ☐ |
| B5 | JS libs | Current recommended JS packages (`near-api-js` vs `@near-js/*`) for signing with function-call keys from env | npm + docs.near.org | ☐ |
| B6 | Testnet RPC | Public RPC URL and rate limits | https://docs.near.org/api/rpc/providers | ☐ |
| B7 | Faucet | How to fund new testnet accounts (CLI faucet, near-faucet.io) | try it | ☐ |
| B8 | Sub-accounts | Team top account (e.g. `commonkit-demo.testnet`) can create `makerlab.commonkit-demo.testnet` etc. **Note:** a sub-account can only be created by its parent account. Decide naming accordingly. | create one | ☐ |
| B9 | Deleting full-access keys | After deploy, deleting the last full-access key leaves a working contract account; verify via `view_access_key_list` returning empty | do it on a throwaway account | ☐ |
| B10 | Storage staking | Cost per byte; how much balance a keyless contract account needs to stay alive with expected state | docs + measure | ☐ |
| B11 | Function-call keys | Cannot attach deposit; allowance covers gas only; restrict to receiver + method names | https://docs.near.org/protocol/accounts-contracts/access-keys | ☐ |
| B12 | Cross-contract callbacks | `#[private]` callbacks, `env::promise_result`, gas forwarding patterns in near-sdk 5 | docs + example | ☐ |
| B13 | NEP-297 events | `EVENT_JSON:` prefix, fields standard/version/event/data | NEP-297 | ☐ |
| B14 | NEP-171/177/181 | Minimal view methods wallets & explorers need to display NFTs; whether a non-transferable token can still display | NEPs + try in a testnet wallet | ☐ |
| B15 | NEP-413 | Signed message format (message, nonce, recipient, callbackUrl), signature verification in Node, and how to confirm the public key belongs to the account (`view_access_key` RPC) | NEP-413 + a working Node snippet | ☐ |
| B16 | Explorer / indexer | Testnet explorer URLs for tx links (nearblocks testnet); an API to list txs/receipts for an account with logs, or confirm fallback to our own `evidence/` log | try API | ☐ |
| B17 | Wallet connection | Currently recommended web wallet connector for NEAR (e.g. NEAR Wallet Selector or newer "near-connect"); testnet support; supports NEP-413 signMessage | docs.near.org web3 apps section | ☐ |

## C. Sputnik DAO v2 (critical — the design depends on it)

| # | Item | Assumption | How to verify | Result |
| :--- | :--- | :--- | :--- | :--- |
| C1 | Testnet factory account | `sputnikv2.testnet`; DAOs at `<name>.sputnikv2.testnet` | view `get_dao_list` | ☐ |
| C2 | Create DAO | Factory `create({name, args: base64(json{config, policy})})` with attached deposit (~5–6 NEAR?) | source code + do it | ☐ |
| C3 | Default policy | Role "all"/Everyone can `*:AddProposal`; council group `*:*`; vote threshold | read `default_policy` in source; `get_policy` view | ☐ |
| C4 | Proposal bond | Value of `proposal_bond`; whether it is refunded and when | source + policy view | ☐ |
| C5 | Proposal kinds | JSON shape for `Transfer {token_id:"", receiver_id, amount, msg}` and `FunctionCall {receiver_id, actions:[{method_name,args(base64),deposit,gas}]}` | source | ☐ |
| C6 | `add_proposal` return | Returns proposal id (u64) so a contract callback can store it | source | ☐ |
| C7 | `get_proposal(id)` | Returns status (`InProgress`, `Approved`, `Rejected`, `Removed`, `Expired`, `Moved`, `Failed`) | source | ☐ |
| C8 | Contract as proposer | A contract account (our asset) can call `add_proposal` with the bond attached in a cross-contract call | sandbox or testnet test | ☐ |
| C9 | Predecessor on execution | When a `FunctionCall` proposal executes, `predecessor_account_id` in our contract == DAO account | testnet test | ☐ |
| C10 | Transfer to DAO | A plain NEAR transfer to the DAO account increases its treasury balance (no method needed) | testnet test | ☐ |
| C11 | Execution gas | Gas limits for multi-action FunctionCall proposals | source | ☐ |
| C12 | Sputnik UI | Is there a usable testnet UI to show proposals in the video (e.g. Astro/other)? If none, our web app shows proposals via views | search | ☐ |

**Fallback if C8 fails:** the asset emits a `escalation_requested` event and stores the request; the agent (or any member) creates the Sputnik proposal from its own account with the bond, passing the escalation id in the description; the asset links it with `link_escalation(escalation_id, proposal_id)` and verifies via `get_proposal`. Log the decision.

## D. Trezu

| # | Item | Assumption | How to verify | Result |
| :--- | :--- | :--- | :--- | :--- |
| D1 | Testnet support | Hosted Trezu works only on mainnet (per another team's README) | trezu docs / repo | ☐ |
| D2 | Compatibility | Trezu reads standard Sputnik proposals | trezu docs | ☐ |

Outcome only changes the README paragraph wording. Do not spend more than 15 minutes here.

## E. Hardware and adapters

| # | Item | Assumption | How to verify | Result |
| :--- | :--- | :--- | :--- | :--- |
| E1 | Moonraker upload+print | `POST /server/files/upload` (multipart, `print=true`) | https://moonraker.readthedocs.io/ | ☐ |
| E2 | Moonraker status | `GET /printer/objects/query?print_stats&virtual_sdcard` → state, print_duration | same | ☐ |
| E3 | Moonraker totals | `GET /server/history/totals` → total_print_time, total_jobs | same | ☐ |
| E4 | Moonraker auth | API key header `X-Api-Key` or trusted clients | same | ☐ |
| E5 | Moonraker lock | Way to prevent jobs that don't come from the bridge (API key only on bridge; disable web UI for members, or Klipper macro check) | same | ☐ |
| E6 | OctoPrint (fallback) | `POST /api/files/local` with `print=true`; `GET /api/job`; `X-Api-Key` | https://docs.octoprint.org/en/master/api/ | ☐ |
| E7 | Shelly Gen2/Gen3 plug | `GET /rpc/Switch.Set?id=0&on=true`, `GET /rpc/Switch.GetStatus?id=0` → `output`, `apower`, `aenergy.total` | Shelly API docs | ☐ |
| E8 | Shelly Gen1 plug | `/relay/0?turn=on`, `/meter/0` | Shelly docs | ☐ |
| E9 | Tasmota plug | `/cm?cmnd=Power%20On`, `/cm?cmnd=Status%208` (energy) | Tasmota docs | ☐ |
| E10 | Which hardware we actually have | Printer model + firmware (Klipper/Marlin), plug model | **ask the human once**, record in DECISIONS | ☐ |

## F. NEAR AI Cloud (optional, for agent rationale)

| # | Item | Assumption | How to verify | Result |
| :--- | :--- | :--- | :--- | :--- |
| F1 | Endpoint | OpenAI-compatible chat completions; base URL and model names from the dashboard | https://cloud.near.ai, https://docs.near.ai/ | ☐ |
| F2 | Credits | $10 credit via NEAR Builders | HACKATHON.md Q-000 | ☐ |

If F1 is not verified in 15 minutes, ship the template-based rationale and log it. The agent must never depend on an LLM to decide anything.

## G. Competitor sanity check (15 minutes max)

Search GitHub/X for new Social Money submissions involving physical assets, equipment, tool libraries, makerspaces, IoT access. Record anything close in `docs/DECISIONS.md` with how we differ. Known so far: Petty Cash, Hat Tip, FairShare, Mandate, Pull Up, LisDao, AllTogether, Herald, Koperasi (none control physical assets).

---

## Research output

When done, write `docs/RESEARCH_RESULTS.md` with:

1. Pinned versions (toolchain, crates, npm packages).
2. Every ⚠️/❌ item and the decision taken.
3. Copy-paste-ready snippets that worked (create DAO, add proposal from contract, NEP-413 verify, Moonraker upload, Shelly toggle).
