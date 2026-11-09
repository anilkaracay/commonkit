# DAO_INTEGRATION — Sputnik DAO v2 on testnet

We use **unmodified** Sputnik DAO v2 DAOs created from the public testnet factory. We never write a multisig. Everything below must be confirmed in RESEARCH (section C) before scripts are finalized.

## 1. Communities and DAOs

| Community | DAO (assumed naming) | Council (testnet accounts) | Assets |
| :--- | :--- | :--- | :--- |
| Makerlab (pilot, real) | `makerlab-ck.sputnikv2.testnet` (name must be unique; pick available) | 3 council members (2 team + 1 pilot community rep) | `printer-01`, `laser-01` |
| Dorm B (simulation) | `dorm-b-ck.sputnikv2.testnet` | 3 team-controlled accounts (labelled as demo) | `washer-01` |

All member accounts are listed in `deployments/testnet.json` with a `kind` field: `team`, `pilot`, `demo-bot`. The README states which are real people.

## 2. Policy

- Start from the factory default policy (research C3), set council = the listed accounts, vote threshold 2/3 for council.
- Make sure the asset contracts are allowed to `AddProposal` (default "everyone can add proposals with bond" — verify). If not, add a role `assets` containing the asset account ids with permission `transfer:AddProposal`. Record which.
- Keep proposal period short for the demo (e.g. 1 hour) — verify the field name (`proposal_period`) and units (ns).

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
| Escalated purchase | Transfer | supplier/worker | created **by the asset contract** (or fallback) |

Args are base64 JSON. Deposits in yocto strings. Gas per action ≤ the DAO's limit (research C11).

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
| `add_proposal({proposal: {description, kind: {Transfer: {token_id: "", receiver_id, amount, msg: null}}}})` + bond | returns `u64` id |
| `get_proposal({id})` | `{ id, proposer, description, kind, status, vote_counts, votes, submission_time }` |
| `get_policy()` | includes `proposal_bond` (U128 string) |

Status mapping → `EscalationStatus`: `InProgress` → `Submitted`; `Approved` → `Approved`; `Rejected` / `Removed` → `Rejected`; `Expired` → `Expired`; `Failed` → `Failed`; `Moved` → `Failed` (log).

## 6. Showing governance in the demo

- Our web app has a **Governance** panel per community: DAO id, council, treasury balance, last proposals (via `get_last_proposal_id` + `get_proposals` — verify names) with links.
- If a public testnet Sputnik UI exists (research C12), link to it too.

## 7. Trezu

We do not integrate Trezu in v1. README paragraph (final wording after research D):

> COMMONKIT uses the same Sputnik DAO contract that Trezu builds on, without modification. Proposals opened by asset contracts are standard Sputnik proposals, so Sputnik-based treasury interfaces such as Trezu should list them. Because the hosted Trezu app could not be used on testnet during the hackathon, we do not claim an end-to-end Trezu integration.
