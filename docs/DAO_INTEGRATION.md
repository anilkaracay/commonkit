# DAO_INTEGRATION — Sputnik DAO v2 on testnet

We use **unmodified** Sputnik DAO v2 DAOs created from the public testnet factory. We never write a multisig. Section C of RESEARCH was run on testnet on 2026-11-09 (`docs/RESEARCH_RESULTS.md` §2); the facts below cite it.

## 1. Communities and DAOs

| Community | DAO (assumed naming) | Council (testnet accounts) | Assets |
| :--- | :--- | :--- | :--- |
| Makerlab (pilot, real) | `makerlab-ck.sputnikv2.testnet` (name must be unique; pick available) | 3 council members (2 team + 1 pilot community rep) | `printer-01`, `laser-01` |
| Dorm B (simulation) | `dorm-b-ck.sputnikv2.testnet` | 3 team-controlled accounts (labelled as demo) | `washer-01` |

All member accounts are listed in `deployments/testnet.json` with a `kind` field: `team`, `pilot`, `demo-bot`. The README states which are real people.

## 2. Policy

- Create each DAO with the factory default policy: `create({name, args})` with `policy` given as the array of council accounts, 300 Tgas, **at least 6 NEAR attached**. A new DAO locks about **5.4 NEAR** in storage (540,332 bytes); the rest becomes treasury. A failed creation refunds the deposit (research C2).
- Council 2-of-3: the default policy's `threshold: [1,2]` gives 2 of 3 votes (`Ratio(n,d)` → `min(total*n/d + 1, total)`); `[2,3]` would need all 3. We keep the default `[1,2]` (D-103). A single-member DAO approves with one vote, and the proposal executes inside that vote tx (vote with 300 Tgas).
- No extra role for the asset contracts: the default role `all` (`Everyone`) has `*:AddProposal`, so any account, including a contract, can add any proposal kind with the bond (research C3). Proven on testnet: a contract opened a Transfer proposal with the bond from its own balance (tx `4H1F9AVhVfzwHrSJriuoMVCB8tRKBycSW1CGGre1C6ke`, D-101).
- Bond: `proposal_bond` = 1 NEAR; `add_proposal` requires the attached deposit to equal it **exactly** (`ERR_MIN_BOND` otherwise). The bond returns to the proposer as a plain transfer on Approved, on Rejected, and on Expired only after a council `act_proposal(id, "Finalize")`; it is lost on Removed (research C4, D-102).
- Proposal period: default `proposal_period` = 604,800,000,000,000 ns (**7 days**) (research C4). We keep it: an approval executes as soon as the threshold is met, so the period only matters for expiry. Expiry is lazy: an expired proposal still reads `InProgress` until someone calls `act_proposal(id, "Finalize")` (research C7); the asset treats it as Expired after `submission_time + proposal_period` (CONTRACT_SPEC §3.5). Showing an Expired proposal in the demo means waiting 7 days or a policy-change proposal for a shorter period (not verified).

## 3. Proposals we create (all via scripts, all logged to `evidence/`)

| Purpose | Kind | Receiver | Method / payload |
| :--- | :--- | :--- | :--- |
| Register asset in commons | FunctionCall | commons | `register_asset({asset_id, group_id})` |
| Set roles | FunctionCall | commons | `set_roles({account, roles})` (one action per account; multiple actions in one proposal if the factory allows) |
| Credential kind | FunctionCall | commons | `set_credential_kind({config})` |
| Fund commons storage | FunctionCall | commons | `fund_storage()` with deposit |
| Fund asset float | FunctionCall | asset | `fund_float()` with deposit = initial float + storage reserve top-up |
| Set operators | FunctionCall | asset | `set_operators({bridge_id, agent_id})` |
| Change profile | FunctionCall | asset | `set_profile({profile})` |
| Resolve dispute | FunctionCall | asset | `resolve_dispute({...})` |
| Escalated purchase | Transfer | supplier | created **by the asset contract** (`escalate(kind="purchase")`, D-101; no fallback needed) |
| Escalated reimbursement (D-017) | Transfer | the task's claimer | created **by the asset contract** (`escalate(kind="reimbursement")`) when a Restock/Repair expense is above `auto_reward_cash_cap` |
| Finalize an expired proposal | — (`act_proposal(id, "Finalize")`, council) | — | returns the asset's bond (research C7, D-102) |

Args are base64 JSON. Deposits in yocto strings. Each action gets exactly its `gas`; there is no per-proposal cap other than the tx gas limit, so the voter's `act_proposal` must cover `Σ action.gas + ~20 Tgas`. We vote with 300 Tgas and keep Σ action gas ≤ 250 Tgas (research C11). A multi-action FunctionCall proposal runs in one receipt (atomic), and the callee sees `predecessor == DAO` but `signer == last voter`, so access checks use only the predecessor (research C9, D-104).

## 4. Script interface (`scripts/dao.ts`)

```ts
createDao(name, councilAccounts, opts): Promise<DaoId>
propose(dao, kind, payload, description, signer): Promise<{proposalId, txHash}>
voteApprove(dao, proposalId, signer): Promise<{txHash}>
proposeAndPass(dao, kind, payload, description, councilSigners): Promise<{proposalId, txHashes}>
getProposal(dao, id): Promise<Proposal>
getPolicy(dao): Promise<Policy>
```

`proposeAndPass` is what seeding and demo steps use; it records each tx hash into `evidence/<step>.json`.

## 5. What the asset expects from the DAO interface

| Call | Shape (verify) |
| :--- | :--- |
| `add_proposal({proposal: {description, kind: {Transfer: {token_id: "", receiver_id, amount, msg: null}}}})` + bond (exactly `proposal_bond`) | returns `u64` id as a bare JSON number; ids start at 0 (research C5, C6) |
| `get_proposal({id})` | `{ id, proposer, description, kind, status, vote_counts, votes, submission_time }`; panics `ERR_NO_PROPOSAL` for a Removed (deleted) proposal (research C7) |
| `get_policy()` | includes `proposal_bond` and `proposal_period` (U128 / U64 strings), both cached by `refresh_dao_policy` (D-102) |

Status mapping → `EscalationStatus` (D-102): `InProgress` → `Submitted`, or `Expired` once `submission_time + proposal_period` has passed; `Approved` → `Approved`; `Rejected` → `Rejected`; a failed `get_proposal` (Removed, deleted) → `Rejected` with the bond lost; `Expired` → `Expired`; `Failed` → `Failed`; `Moved` → `Failed` (log).

## 6. Showing governance in the demo

- Our web app has a **Governance** panel per community: DAO id, council, treasury balance, last proposals (via `get_last_proposal_id` + `get_proposals` — verify names) with links.
- No hosted testnet Sputnik UI was reachable (research C12), so the web app's panel is the governance view; proposal ids link to the explorer.

## 7. Trezu

We do not integrate Trezu in v1 (D-007). Research D1/C12: Trezu's production backend is mainnet-only; its repo has a dev-only local mock that can open a testnet DAO. D2: Trezu reads the standard Sputnik `get_proposals` / `get_proposal` / `get_policy` views, so the wording below stays accurate. README paragraph:

> COMMONKIT uses the same Sputnik DAO contract that Trezu builds on, without modification. Proposals opened by asset contracts are standard Sputnik proposals, so Sputnik-based treasury interfaces such as Trezu should list them. Because the hosted Trezu app could not be used on testnet during the hackathon, we do not claim an end-to-end Trezu integration.
