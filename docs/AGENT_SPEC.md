# AGENT_SPEC — the asset operations agent

One agent process can serve several assets, but **each asset has its own agent account binding** (`agent_id` on the asset, set by the DAO). For the demo one agent account `agent-01.<community>.<root>` serves the community's assets with one function-call key per asset contract.

## 1. What it is (and is not)

- It **is** the asset's operator: it watches the asset's on-chain telemetry and rule status, opens maintenance tasks when the profile says they are due, escalates purchases to the DAO, and explains each action in plain language.
- It **is not** a decision-maker over money or truth: it cannot approve tasks, pay anyone, change profiles, or invent tasks the telemetry does not justify. The contract enforces this; the agent cannot bypass it even if its code is changed.

## 2. Loop

```
every POLL_SECONDS (default 30; demo 5):
  for asset in assets:
    status = view get_rule_status()
    for rule in status where rule.due and not rule.open_task:
       rationale = explain(rule, recent telemetry, recent reservations, history of this rule)
       call open_maintenance_task(rule_id, rationale)          # function-call key
       log + SSE event
    for task in open tasks older than claim_timeout and unclaimed:
       call annotate_task(task_id, "Still open after N h; consider raising reward via DAO")
    for purchase need in pending_needs(asset):                  # see §4
       call escalate("purchase", receiver, amount, reason, task_id)
    for escalation in submitted escalations:
       call sync_escalation(id)
    if ledger float runway < MIN_RUNWAY_PERIODS:
       call annotate (asset-level note) suggesting a DAO price/float change  # informational only
```

The agent is **idempotent**: it reads state before every write and never re-opens a rule that already has an open task (the contract also rejects it with `E_TASK_ALREADY_OPEN`).

## 3. Rationale generation

1. Deterministic template (always available):
   `"Nozzle time since last cleaning: 212.4 h (threshold 200 h). 14 prints since then, 2 failed (14%). Opening 'Nozzle cleaning' with reward: 2 usage rights."`
2. Optional LLM polish via NEAR AI Cloud (OpenAI-compatible, research F1):
   - Input: the template facts as JSON. Output schema (zod): `{ rationale: string (≤ 600 chars) }`.
   - The LLM may only rephrase; the agent validates that every number in the output appears in the input facts. If validation fails or the call fails/times out (3 s), use the template.
   - Record `rationale_source: "template" | "llm"` in the task note.

## 4. Purchase needs (escalation)

- Profile rules may declare `purchase` hints in the agent config (not on-chain), e.g. `nozzle_clean` → after 3 cleanings, propose buying a new nozzle kit (amount, supplier/receiver account).
- The agent calls `escalate("purchase", receiver, amount, reason, task_id)`; the asset contract opens a Sputnik `Transfer` proposal paying the receiver directly from the DAO treasury after a vote.
- The demo uses a team account as "supplier" and says so.

## 5. Limits demo (must be shown and tested)

| Attempt | Expected |
| :--- | :--- |
| Open a task for a rule whose delta < threshold | `E_RULE_NOT_DUE` |
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

- Unit: rule evaluation, template rendering, LLM output validation (numbers must match), idempotency.
- Integration (sandbox): agent opens a task only when due; limit attempts fail with the right codes.
