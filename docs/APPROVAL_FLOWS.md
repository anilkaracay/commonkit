# Approval flows: what Sputnik DAO already provides, what COMMONKIT adds

The Social Money prompt ends: "Read the Sputnik DAO contract and the Trezu docs first, then tell me which approval flows already exist and which ones we need to add." This is that answer for COMMONKIT. Back to the [README](../README.md#how-a-community-runs-it).

**Sputnik DAO v2 already provides** (source: [near-daos/sputnik-dao-contract](https://github.com/near-daos/sputnik-dao-contract), `sputnikdao2` v2.3.1 is what the testnet factory deploys, [`contracts/tests/res/SOURCE.md`](../contracts/tests/res/SOURCE.md)):
- **Roles** in a policy: `Everyone`, a token-weighted `Member` role, or a `Group` of named accounts, each with permissions per proposal kind and action (`AddProposal`, `VoteApprove`, `VoteReject`, `VoteRemove`, `Finalize`, …).
- **Votes** with a threshold per role; the factory default gives the council 2 of 3 votes (`[1,2]`, D-103), a 1 NEAR proposal bond and a 7-day period ([`docs/RESEARCH_RESULTS.md`](RESEARCH_RESULTS.md) C3–C4).
- **Proposal kinds** including `Transfer`, `FunctionCall`, `ChangePolicy`, `AddMemberToRole`/`RemoveMemberFromRole`, `AddBounty`/`BountyDone` (with `bounty_claim`), and policy parameter changes.

**COMMONKIT adds**, without changing Sputnik:
- **Machine-opened proposals:** the asset contract calls `add_proposal` with its own bond for purchases and large reimbursements (step 10; research C8, D-101).
- **A capped float and automatic sweep:** each machine keeps at most `float_cap`; the excess goes to the DAO in the same transaction (step 6, `inv_custody_float_cap_sweeps_excess`); deposits are liabilities, never revenue (`inv_custody_deposits_never_swept`).
- **A bounded agent:** a function-call key that can only open tasks the contract says are due, within quotas, and can be removed by the DAO (step 16, [`evidence/agent-limits.json`](../evidence/agent-limits.json)).
- **An independent verifier** and a council second approval by amount; the worker, the agent and the bridge can never approve (`inv_no_self_verification_task`, step 17).
- **Exactly-once rewards** with retry-safe minting (`inv_exactly_once_reward_retry`, step 17 `E_ALREADY_REWARDED`).
- **Non-revocable rights:** no method deletes, downgrades or transfers a granted card (`inv_no_retroactive_revocation`, `inv_non_transferable`, step 17).
- **Physical access gated by a booking:** the bridge opens a device only after `can_access` and a chain write (steps 3–4).

We use Sputnik's roles, votes, `Transfer` and `FunctionCall`; we do not use its native bounties, because upkeep tasks pay usage rights (not treasury cash per claim) and are opened from on-chain rule status.

**Trezu** adds custom proposal templates on top of the same Sputnik flows. Five COMMONKIT templates compile with Trezu's own engine into the exact `FunctionCall` proposals our scripts send, and one filed a real testnet proposal: [`integrations/trezu/README.md`](../integrations/trezu/README.md).

Step numbers refer to [`JUDGE_FLOW.md`](JUDGE_FLOW.md); test names are in [`contracts/tests/tests/invariants.rs`](../contracts/tests/tests/invariants.rs).
