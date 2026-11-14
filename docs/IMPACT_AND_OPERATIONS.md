# First deployment, outcomes and operations

First customer profile: **one staffed makerspace, one printer and an existing Sputnik DAO**. Its operating budget buys setup/support; its council governs spending and rules, its steward runs the service, and members book and contribute. This proposed operating model links value, responsibilities and acceptance criteria.

## Current testnet baseline

Two Sputnik DAOs, two community contracts and four machine accounts run on NEAR testnet with emulated/simulated devices and team-controlled members. The [recorded flow](JUDGE_FLOW.md) covers the full loop. The [browser check](../evidence/browser-wallet-qa.json) confirms booking/cancellation/refund with a local signer; participant-wallet onboarding belongs in acceptance testing.

A read-only recount of [the 21-step evidence](../evidence/steps.json), deduplicating transaction records by hash, finds **7 `reservation_confirmed`, 4 `session_started`, 3 `task_rewarded`, 1 `right_consumed` and 3 `swept` event occurrences**. These selected test-sequence counts demonstrate measurable events; they are not chain-wide totals or customer utilization.

## Value and measurement

Proposed comparison: two-week baseline, then four-week supervised trial with fixed opening hours and machine scope. Council agrees these planning assumptions before recruitment. Report denominators, sample size and pending cases.

| Outcome | Definition and collection | Proposed acceptance criterion |
| --- | --- | --- |
| Useful access | Started booked slots ÷ available slots; reconcile `reservation_confirmed`, cancellations and `session_started` by asset/reservation ID. Steward records opening hours and downtime. Report occupied time separately from booked time. | At least 10 completed sessions by at least 5 consenting members; utilization reported against the baseline, with paid/right-funded slots separated. |
| Upkeep completed sooner | Elapsed time from `task_opened` to `task_rewarded`; report median, slowest case and still-open task ages. Use receipt block timestamps, not screenshot time. Separate work-submission time from approval delay. | At least 3 complete, independently approved tasks; median completion time at most the baseline, or an agreed 72-hour service target if comparable baseline tasks are unavailable. |
| Steward workload | Weekly minutes logged for booking help, wallet help, returns, approvals, incidents and reconciliation; compare minutes per completed session as well as total hours. | Routine workload per completed session at most baseline; setup/training time reported separately. |
| Fair, usable rewards | Join `task_rewarded.right_ids` to card views and `right_consumed`; distinguish earned, outstanding, expired and redeemed rights. | At least 2 earned-right redemptions; every sampled reward has an independent approval trail. |
| Clear returns and disputes | `return_confirmed`, `dispute_opened` and resolution records, plus steward-recorded complaints; disputes ÷ completed returns, with unresolved ages. | Every return reconciled and every dispute assigned to a council reviewer within 48 hours; disputes per return at most baseline. |

Existing [reservation](../contracts/asset/src/reservations.rs), [task](../contracts/asset/src/tasks.rs) and [reward](../contracts/asset/src/rewards.rs) events have an [SDK decoder](../packages/sdk/src/events.ts). Join finalized receipts/current views with the steward's local log; a continuous outcome dashboard is a future implementation choice. Use an explicit trial boundary, deduplicate receipt/log positions, retain block timestamps and pending failures. Accounts/annotations are public; keep identities local and publish permitted aggregates.

## Deployment acceptance

- [ ] **Agree the service:** council names a buyer, steward, independent verifier and technical operator; approves opening hours, trial goals, expense limits and support budget. Capture the baseline.
- [ ] **Rehearse on testnet:** members hold their own wallets; test connection, booking, signed access, return, refund and right redemption. Record wallet-help time.
- [ ] **Commission locally:** validate printer adapter/physical controls, network interruption, restart and operator replacement. Document safe shutdown; steward signs off supervision.
- [ ] **Run the supervised trial:** reconcile weekly event/time logs, fees, held deposits, refunds and rights; a different member verifies contributions. Council reviews exceptions.
- [ ] **Decide continuation:** council reviews outcomes and actual costs. Agree real-money deployment, pricing and migration separately; current demo rates use testnet NEAR.

## Responsibilities and failure handling

| Owner | Operating responsibility |
| --- | --- |
| Community council / DAO | Approves profiles, roles, budgets, operator replacement and larger purchases. Funds the float and storage reserve; reviews disputes, reimbursement exceptions and service bills. Community revenue remains community money. |
| Local technical operator | Runs bridge/agent on a maintained community host; protects device credentials and per-machine function-call keys in keychain/environment ([signer model](BRIDGE_AND_ADAPTERS.md)). Backs up configuration/state and monitors logs. Assign an operator-account recovery custodian with authority kept separately from runtime keys; member keys stay in members' wallets. |
| Steward and independent verifier | Steward checks returns/condition; verifier approves work independently of worker, bridge and agent. Approved training gives the learner a credential and can give the trainer usage rights. |
| COMMONKIT service provider | Supplies installation, training, maintenance and agreed support without custody of community funds/member keys. Host access is separately agreed and revocable. |

The bridge is a **trusted device/telemetry operator**; physical safety stays with local controls and supervised procedures. Restricted keys cannot attach deposits; DAO replaces operators. Keyless machine contracts require a new deployment and migration for code changes ([security model](../README.md#security-model-and-limits)).

| Condition | Response with existing behavior |
| --- | --- |
| RPC/bridge/device interruption | A new unlock requires a successful chain session write first. Operator restores connectivity, reconciles chain/session state and follows local machine procedures for an active job; physical controls remain available. |
| Incorrect telemetry or disputed work | Verifier checks evidence before rewards; council can replace an operator. Reject or cancel the task through its permitted roles rather than treating telemetry as approval. |
| Failed payment/refund or reward callback | Inspect the recorded failed operation/reward state; use existing retry methods after correcting the cause. [Outbound operations](../contracts/asset/src/ops.rs) preserve liabilities and retry failed operations without double payment. |
| Fault or insufficient operating cash | Mark service status through permitted flows; reconcile cancellations/refunds, including any recorded fee refund owed. Council funds the float or votes on larger costs; deposits remain liabilities, not working capital. |

## Sustainability and a small model

**Service revenue:** setup/training plus recurring support from an agreed community budget; hardware owned or billed separately. This works independently of **`protocol_fee_bps = 0`** in every demo profile. Prices, demand and effort below are assumptions, not offers or bookings.

The [printer profile](../profiles/printer_3d.json) supplies concrete test parameters: 30-minute slots, 0.25 testnet NEAR per paid slot, a 2 NEAR deposit reduced to 0.5 after 3 clean returns, a 3 NEAR float cap and a separate 7 NEAR storage reserve. Rights cover up to 2 slots and expire after 60 days. Nozzle cleaning earns 2 rights; restock/repair expense caps are 0.5 NEAR. The normal profile threshold is 200 nozzle hours; labelled demo overrides accelerate testing. These values are test fixtures, not validated commercial prices.

| Illustrative monthly calculation | Result |
| --- | --- |
| Assume 80 available slots, 32 paid slots and 8 slots redeemed with rights | 40/80 = **50% started-slot utilization**, if all those bookings start. |
| Fee receipts = paid slots × rate | 32 × 0.25 = **8 NEAR**, before refunds. |
| Assume 3 NEAR maintenance/material costs and 0.5 NEAR network/other costs | **4.5 NEAR** cash contribution before service charges, labor, energy, capital costs and taxes. Larger costs go through the DAO; the 3 NEAR float is a balance cap, not a monthly spending limit. |
| Earned-right opportunity cost = redeemed slots × rate × displaced paid-demand fraction | 8 × 0.25 × d = **0–2 NEAR** for d between 0 and 1; 1 NEAR at d = 0.5. This is a counterfactual, not another cash expense to subtract from the 8 NEAR already collected. |
| Provider example, in a separate illustrative fiat budget | Setup 200 − (4 hours × 25 + 20 direct costs) = **80 contribution**; monthly support 40 − (1 hour × 25 + 5 hosting/direct costs) = **10 contribution**, before overhead/taxes. At 2 support hours it becomes **−15**. Units are hypothetical USD; they are not quoted prices. |

Separate cash and opportunity cost. Deposits, storage reserves and float are obligations/reserves, not provider revenue. Measure outstanding rights, redemption, peak-time displacement and expiry. Keep token community cash separate from fiat service margins unless conversion is explicit. Continuation depends on measured outcomes and willingness to pay.
