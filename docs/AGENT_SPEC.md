# AGENT_SPEC — the asset operations agent

One agent process can serve several assets, but **each asset has its own agent account binding** (`agent_id` on the asset, set by the DAO). For the demo one agent account `agent-01.<community>.<root>` serves the community's assets with one function-call key per asset contract.

## 1. What it is (and is not)

- It **is** the asset's operator: it watches the asset's on-chain telemetry, fault reports and rule status, opens upkeep tasks (any `UpkeepKind`, D-017) when the profile says they are due, escalates purchases and large reimbursements to the DAO, and explains each action in plain language.
- It **is not** a decision-maker over money or truth: it cannot approve tasks, pay anyone, change profiles, or invent tasks the telemetry does not justify. The contract enforces this; the agent cannot bypass it even if its code is changed.

## 2. Loop

```
every POLL_SECONDS (default 30; demo 5):
  for asset in assets:
    status = view get_rule_status()        # every trigger type: Metric, Schedule, Report
    for rule in status where rule.due and not rule.open_task:
       rationale = explain(rule, recent telemetry, fault reports, recent reservations, history of this rule)
       call open_upkeep_task(rule_id, rationale)               # function-call key; never passes manual
       log + SSE event
    for task in open tasks older than claim_timeout and unclaimed:
       call annotate_task(task_id, "Still open after N h; consider raising reward via DAO")
    for purchase need in pending_needs(asset):                  # see §4
       call escalate("purchase", receiver, amount, reason, task_id)
    for task in approved tasks with expense_state == NeedsEscalation:   # see §4
       call escalate("reimbursement", claimer, expense, reason, task_id)
    for escalation in submitted escalations:
       call sync_escalation(id)
    if ledger float runway < MIN_RUNWAY_PERIODS:
       call annotate (asset-level note) suggesting a DAO price/float change  # informational only
```

The agent is **idempotent**: it reads state before every write and never re-opens a rule that already has an open task (the contract also rejects it with `E_TASK_ALREADY_OPEN`).

The agent does not compute "due" itself. It trusts `get_rule_status().due`, which the contract evaluates per trigger (CONTRACT_SPEC §3.3): **Metric** — `telemetry[metric] - baseline >= threshold`; **Schedule** — `now - last reward >= every_hours`; **Report** — active fault reports from distinct members `>= min_reports`. The same check runs again inside `open_upkeep_task`, so a stale or wrong agent view fails with `E_RULE_NOT_DUE`. The agent **never** passes `manual=true`; only a council member may bypass the due check, and the task records it.

## 3. Rationale generation

1. Deterministic template (always available), one per `UpkeepKind`, filled with the trigger facts from `get_rule_status` (`current`, `baseline`, threshold / interval / `min_reports`) and the rule's reward. The numbers below are examples of the format, not results:

   | Kind | Template example |
   | :--- | :--- |
   | Maintenance | `"Nozzle time since last cleaning: 212.4 h (threshold 200 h). 14 prints since then, 2 failed (14%). Opening 'Clean the nozzle and run a calibration print' with reward: 2 usage rights."` |
   | Restock | `"Filament used since last spool: 334 m (threshold 330 m). Opening 'Load a new filament spool' with reward: 1 usage right; a receipt of up to 0.5 NEAR can be reimbursed."` |
   | Cleaning | `"Last cleaning 7 days ago (every 168 h). Opening 'Empty, clean and sanitize the fridge' with reward: 2 usage rights."` |
   | Inspection | `"Distance since last brake check: 312 km (threshold 300 km). Opening 'Check and adjust the brakes' with reward: 2 usage rights."` |
   | Repair | `"2 members reported a fault (needed: 2). Opening 'Diagnose and repair the reported fault' with reward: 3 usage rights; parts up to 0.5 NEAR can be reimbursed with a receipt."` |
   | Rebalance | `"2 members reported the bike away from its home spot (needed: 2). Opening 'Bring the bike back to its home spot' with reward: 1 usage right."` |
   | Supervision | `"Last open-room evening 7 days ago (every 168 h). Opening 'Host the weekly open-room evening' with reward: 2 usage rights."` |

   Report-trigger rationales give the count of reports only, never reporter names or note contents (notes are hashes on chain). The reimbursement sentence appears only when `reimbursable_max > 0`.
2. Optional LLM polish via NEAR AI Cloud (OpenAI-compatible, research F1):
   - Input: the template facts as JSON. Output schema (zod): `{ rationale: string (≤ 600 chars) }`.
   - The LLM may only rephrase; the agent validates that every number in the output appears in the input facts. If validation fails or the call fails/times out (3 s), use the template.
   - Record `rationale_source: "template" | "llm"` in the task note.

## 4. Purchase needs (escalation)

- Profile rules may declare `purchase` hints in the agent config (not on-chain), e.g. `nozzle_clean` → after 3 cleanings, propose buying a new nozzle kit (amount, supplier/receiver account).
- The agent calls `escalate("purchase", receiver, amount, reason, task_id)`; the asset contract opens a Sputnik `Transfer` proposal paying the receiver directly from the DAO treasury after a vote.
- The demo uses a team account as "supplier" and says so.
- **Reimbursement escalation (D-017):** when `approve_task` leaves a Restock/Repair expense at `expense_state = NeedsEscalation` (expense above `auto_reward_cash_cap`), the agent calls `escalate("reimbursement", receiver = claimer, amount = expense, reason, task_id)`. The contract checks that the task is in that state and that receiver and amount match exactly; the DAO vote decides. The agent never reserves or pays an expense itself; expenses at or below the cap are handled by the verifier/council approvals in the contract.

## 5. Limits demo (must be shown and tested)

| Attempt | Expected |
| :--- | :--- |
| Open a task for a rule whose delta < threshold | `E_RULE_NOT_DUE` |
| Open a task for a Schedule rule before `every_hours` have passed (fridge `weekly_clean`, DEMO_SCRIPT step 20) | `E_RULE_NOT_DUE` |
| Open a second task for the same rule | `E_TASK_ALREADY_OPEN` |
| Exceed period quota | `E_QUOTA_EXCEEDED` |
| Call `approve_task` | `E_MISSING_ROLE` / `E_SELF_VERIFY` |
| Call any money method (e.g. `fund_float` payout, `sweep` is fine — public) | not possible / no effect |
| Use the key after DAO calls `set_operators(agent_id=None)` | `E_NOT_AGENT` |
| Attach deposit with its function-call key | rejected by the protocol (function-call keys cannot attach deposits) |

`agent/src/limits-demo.ts` runs these against testnet and writes `evidence/agent-limits.json`.

## 6. Interfaces

- Reads via `packages/sdk`. Writes via function-call keys from env: `AGENT_ACCOUNT_ID`, `AGENT_KEY_<ASSET_ALIAS>`.
- `GET /events` SSE (same format as bridge) so the web "live" panel can show "Agent opened task #3 because…".
- Config `agent/config.yaml`: assets, poll interval, purchase hints, LLM on/off.

## 7. Tests

- Unit: rule evaluation for all three trigger types, one template per `UpkeepKind`, LLM output validation (numbers must match), idempotency, reimbursement escalation only for `NeedsEscalation` tasks, `manual` never sent.
- Integration (sandbox): agent opens a task only when due (Metric, Schedule after fast-forward, Report after `min_reports`); limit attempts fail with the right codes.
