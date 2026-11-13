# COMMONKIT × Trezu (testnet)

**Claim, exactly:** five COMMONKIT custom-proposal templates compile with Trezu's own template engine
(NEAR-DevHub/trezu at commit `62cf0e4`) into exactly the Sputnik `FunctionCall` our scripts send.
One of them filed a real testnet proposal, `dorm-b-ck.sputnikv2.testnet#13`, which the council passed.
Trezu's open-source UI, run locally on Trezu's official testnet mock backend, shows our DAOs'
proposals, including the machine-opened `makerlab-ck#10`. The hosted Trezu app is mainnet-only, so
we did not test it.

[Trezu](https://github.com/NEAR-DevHub/trezu) is NEAR DevHub's treasury app for Sputnik DAOs. Its
**custom proposal templates** are JSON manifests that a DAO authors once and members fill in to file
an arbitrary `FunctionCall` proposal, tagged `[trezu-tmpl:<id>]` in the description
(`docs/CUSTOM_PROPOSAL_TEMPLATES.md` in their repo). COMMONKIT's governance calls are exactly that
kind of proposal: a DAO calling a method that only the DAO may call on a commons or asset account.

## Templates (`templates/`)

| Template id | DAO | Receiver · method | Deposit · gas | Member fills |
| :--- | :--- | :--- | :--- | :--- |
| `commonkit-fund-float-washer-01` | `dorm-b-ck` | `washer-01.dorm-b…` · `fund_float` | 0.05 NEAR · 60 Tgas | nothing |
| `commonkit-set-profile-washer-01` | `dorm-b-ck` | `washer-01.dorm-b…` · `set_profile` | 0 · 30 Tgas | `profile` (JSON), `reason` (summary only) |
| `commonkit-set-operators-printer-01` | `makerlab-ck` | `printer-01.makerlab…` · `set_operators` | 0 · 30 Tgas | `bridge_id`, `agent_id` |
| `commonkit-register-asset` | `makerlab-ck` | `commons.makerlab…` · `register_asset` | 0 · 100 Tgas | `asset_id`, `group_id` |
| `commonkit-set-roles` | `makerlab-ck` | `commons.makerlab…` · `set_roles` | 0 · 60 Tgas | `account`, `roles` (JSON array) |

`set_profile` covers both a labelled demo override and its restore: fill it once with the changed
profile, then again with the block from `profiles/washer.json`.

## Test: Trezu's engine, compared byte for byte with our scripts

```bash
pnpm trezu:test     # fetch the pinned engine (once, network), then vitest scripts/trezu
```

`scripts/trezu/templates.test.ts` loads Trezu's own `parseManifest` (manifest schema),
`buildFormSchema` (the fill-form validation the UI runs) and `buildTemplateProposal` (the engine).
For six fills it checks that Trezu's `kind` equals `encodeProposal(...)` from `scripts/lib/dao.ts`
with the same method, args, deposit and gas used in `seed-testnet.ts` and demo steps 1, 14 and 16.
The six fills are fund_float, set_profile override, set_profile restore, set_operators,
register_asset and set_roles. It also checks that Trezu refuses a malformed account, a missing
profile and a dangling `{{placeholder}}`. Result on 2026-11-13: 10/10 passed. Without the engine,
the 8 engine tests are skipped and the 2 static checks still run.

**Why fetched, not vendored:** the Trezu repository has no license file (GitHub API `license: null`,
checked 2026-11-13), so we do not copy its source into this MIT repo. `scripts/trezu/fetch-engine.sh`
downloads 6 files at the pinned commit into a temp dir outside the repo and checks each sha256
against `engine.lock.json`. It then installs the engine's five MIT dependencies at exact versions
with `--ignore-scripts`: zod 4.4.3, big.js 7.0.1, clsx 2.1.1, tailwind-merge 3.6.0 and
date-fns 4.4.0. None has transitive dependencies, and all were published months ago.

## The real proposal (`evidence/trezu.json`)

```bash
pnpm trezu:file -- --dry   # print Trezu's proposal only
pnpm trezu:file            # idempotent: re-verifies if evidence/trezu.json already records it
```

`scripts/trezu/file-proposal.ts` builds the proposal with Trezu's engine and refuses to file unless
it equals our `encodeProposal` output. It then calls `proposeAndPass` from `scripts/lib/dao.ts`:
council member nil proposes with a 1 NEAR bond, nil and ozan approve, and the bond is refunded on
approval.

| What | Value |
| :--- | :--- |
| Proposal | `dorm-b-ck.sputnikv2.testnet#13`, Approved, votes nil + ozan |
| Description | `* Proposal Action: custom <br>* Template: [trezu-tmpl:commonkit-fund-float-washer-01] <br>* Summary: fund_float washer-01 0.05 NEAR (…)` |
| add_proposal | `D521qH6mg4qm3Tt1Ck57Mo9JVsY6pgzqXZxjAWpPVF6n` |
| vote (nil) | `3e2fuLVdKXjYxTE3SFqWwBweP6nDREdYrdsP9mv6MVct` |
| vote (ozan, executes; `commonkit:float_funded`) | `EHzqNtodFNQjiEYFFEMswNX9VCbPjYsje9NjgkeEb8b2` |
| Checked by views | status Approved; on-chain `kind` and description equal the engine output; washer-01 `float_free` +0.05 NEAR (0.80 → 0.85, below its 1 NEAR cap) |
| NEAR spent | gas 0.000512 (nil) + 0.000808 (ozan); 0.05 moved from the Dorm B treasury into washer-01's capped float; root 0 |

## Trezu UI, run locally on testnet (`screenshots/`)

Trezu `nt-fe` at the same commit was installed with `bun install --frozen-lockfile --ignore-scripts`.
We ran it with `NEXT_PUBLIC_NEAR_NETWORK=testnet` against `scripts/testnet-mock-backend.mjs`, the
dev-only backend that ships with Trezu and serves `get_proposals`/`get_proposal`/`get_policy`/
`get_config` from testnet RPC (see their `nt-fe/README.md`). Screenshots were taken with Playwright
at 1440×1000:

- `trezu-local-makerlab-requests-1440.png`: the Makerlab DAO's requests (All tab). The list includes
  #10, which Trezu shows as a "Payment Request" of 4 NEAR to `supplier…` whose requester is
  `printer-01…`: the asset contract opened it itself.
- `trezu-local-makerlab-10-transfer-to-supplier-1440.png`: #10 detail (recipient, amount, 2/2
  approvals, Executed).
- `trezu-local-dorm-b-requests-1440.png`: the Dorm B DAO's requests, with #13 at the top.
- `trezu-local-dorm-b-13-template-fund-float-1440.png`: #13 detail (fund_float, 60 TGas, 0.05 NEAR,
  args `{}`, 2/2, Executed).

## What does not work, or was not tested

- **The hosted Trezu app (trezu.app) was not used.** Its backend is mainnet-only, and COMMONKIT is
  testnet-only.
- **The templates are not stored in Trezu.** Template CRUD lives in Trezu's backend, so the local UI
  shows #13 as a plain "Function Call". The `[trezu-tmpl:…]` tag is only in the on-chain description.
- **#13 was filed by our script, not from Trezu's fill form with a wallet.** The script sends exactly
  what Trezu's engine built, and the test proves those bytes are equal.
- **Trezu templates fix receiver, method, deposit and gas.** So the templates are per account, the
  float top-up amount is fixed at 0.05 NEAR, `set_roles` gas fits the current 2 active Makerlab
  assets (10 + 25 per asset), and `set_operators` cannot set `agent_id` to `null`.
- **In mock mode, some routes fail.** Routes the mock forwards to Trezu's production backend (auth,
  assets, subscription) return 401/404/500 for testnet DAOs. The UI shows a "Staging" badge, and
  execution-transaction links stay empty (no indexer).

Credit: Trezu by NEAR DevHub, https://github.com/NEAR-DevHub/trezu (commit
`62cf0e41d4b2d2358a496d47c80fcd2e59094247`). This folder holds only our own manifests, the lock
file and screenshots; no Trezu source.
