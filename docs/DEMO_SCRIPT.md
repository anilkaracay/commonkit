# DEMO_SCRIPT

## 1. The 90-second video (English voice-over or captions)

Record on a phone + screen capture. Real hardware for printer and plug device. Simulation always labelled.

| Time | Shot | Caption / VO |
| :--- | :--- | :--- |
| 0–10 s | Quick cuts: printer, washing machine, tractor, bike. Then the line on screen. | "Today a shared machine's money and rules live in one admin's spreadsheet. On COMMONKIT they live in the machine's own keyless account." |
| 10–18 s | Phone: reserve printer slot, sign. Cut to printer starting. | "Reserve on NEAR. The printer only prints for a valid on-chain reservation." |
| 18–25 s | Second phone, no reservation → bridge rejects; printer stays idle. | "No reservation, no print." |
| 25–40 s | Asset page: nozzle gauge crosses threshold → agent opens task with rationale. Ayşe cleans nozzle; calibration print; Mehmet approves → 2 cards appear in her wallet. | "The printer asks for its own maintenance. Whoever keeps it alive earns the right to use it." |
| 40–45 s | Montage, four ~1 s cuts, each with its kind chip: **refill** (filament spool swap, receipt hash, step 18) · **clean** (fridge Cleaning task on the board, SIMULATED badge, step 20) · **check** (washer fault → OUT OF SERVICE → Repair, SIMULATED badge, step 19) · **teach** (Ayşe trains Zeynep, step 12). | "Fix it, refill it, clean it, check it, teach it — every kind of care earns access." |
| 45–58 s | Zeynep tries the laser → rejected (no credential). Ayşe trains her → credential card → plug clicks on. | "Risky machines need a credential. Training others earns access too." |
| 58–68 s | Ledger bar: float hits cap → excess flows to DAO treasury. Parts purchase → Sputnik proposal opened by the printer's contract. | "The machine keeps a small float. Everything else goes back to the community treasury." |
| 68–77 s | Board: washer in dorm-b (SIMULATED badge), same `code_hash` strip. | "Same contract. Different commons." |
| 77–83 s | Council tries to delete Ayşe's right → tx fails. | "No one can take back what you earned." |
| 83–90 s | Pilot rep one-liner + repo/demo URLs. | "COMMONKIT — shared things that pay for their own upkeep." |

Total 90 s (10 + 8 + 7 + 15 + 5 + 13 + 10 + 9 + 6 + 7). The montage only shows steps that have evidence at recording time; a cut without evidence is dropped, not faked. Simulated cuts keep the SIMULATED badge on screen.

## 2. Judge flow (21 steps) — each step = `pnpm demo:step N`

Each step writes tx hashes to `evidence/steps.json`. "Do X → See Y" wording goes into README verbatim.

Numbering (D-801): steps 1–17 are unchanged from the earlier 18-step flow. The upkeep steps added by D-017 are 18–20. `verify.sh` moved from step 18 to step 21 so it runs last and checks the evidence of every step, including the reimbursement and out-of-service checks. Every other doc uses this numbering and the count 21.

| # | Do | See | Negative? |
| :--- | :--- | :--- | :--- |
| 1 | DAO proposal registers `printer-01`, sets profile, funds float | Proposal approved; asset float = 2 NEAR (cap 3, D-706); DAO treasury decreased | |
| 2 | Ali reserves 2 slots, pays 0.5 fee + 2 deposit | Reservation Confirmed; float +0.5; deposits_held +2 | |
| 3 | Ali requests access via bridge (signed) | Bridge 200; `session_started` event; printer prints (video) / simulator session | |
| 4 | Can (no reservation) requests access | Bridge 403 `no valid reservation`; no on-chain change | ✓ |
| 5 | Session finishes; steward confirms clean return | Deposit refund op Succeeded; Ali clean_returns = 1 | |
| 6 | More fees push float over cap | `swept` event; DAO treasury +excess | |
| 7 | Telemetry crosses `nozzle_clean` threshold; agent calls `open_upkeep_task` | `task_opened` (kind `Maintenance`, trigger `Metric`) with rationale; reward 2 rights | |
| 8 | Ayşe claims, submits evidence; bridge runs calibration; Mehmet approves | Task Rewarded; 2 `nft_mint` events; reputation record linked | |
| 9 | Ayşe reserves with a right (no fee) and prints | Right Locked → Consumed after session | |
| 10 | Agent escalates a nozzle kit purchase (4 NEAR) | Sputnik Transfer proposal created by the asset; council approves; supplier paid by DAO | |
| 11 | Zeynep reserves the laser without credential | Reservation Rejected; full refund | ✓ |
| 12 | Ayşe proposes training; Mehmet approves | Zeynep gets `laser_safety`; Ayşe gets 1 laser-group right | |
| 13 | Zeynep reserves laser; access via bridge | Plug on; session; plug off | |
| 14 | Ayşe uses printer-earned right on laser (same group) / on washer (other community) | Laser OK; washer `E_RIGHT_WRONG_GROUP` | ✓ (second half) |
| 15 | `simulate.sh washer` in dorm-b | Full loop on simulated washer; same asset `code_hash` | |
| 16 | Agent tries: task not due, duplicate task, over quota; agent after revocation | `E_RULE_NOT_DUE`, `E_TASK_ALREADY_OPEN`, `E_QUOTA_EXCEEDED`, `E_NOT_AGENT` | ✓ |
| 17 | Second reward claim for same task; claimer self-approve; council attempts to revoke a right (no method exists — show `nft_transfer`/any admin path fails) | `E_ALREADY_REWARDED`, `E_SELF_VERIFY`, `E_NON_TRANSFERABLE` / no such method | ✓ |
| 18 | Printer Restock: telemetry `filament_used_mm` crosses `filament_spool` (*pilot* 5 000 mm); agent opens the task. Ayşe claims, loads a spool, submits evidence with expense 0.6 NEAR + receipt hash; then resubmits with expense 0.4 NEAR + receipt hash. Mehmet (verifier) approves; a council member (≠ Mehmet) approves because 0.4 > `council_threshold_cash` 0.25 | First submit fails `E_EXPENSE_CAP` (0.6 > `reimbursable_max` 0.5). Then `task_opened` (kind `Restock`), `task_submitted {expense, receipt_hash}`, `task_council_approved`, task Rewarded, 1 `nft_mint`, Reimbursement op (`ref_id` = task id) Succeeded paying 0.4 NEAR to Ayşe, `expense_state = Paid`; `deposits_held` unchanged | ✓ (first submit) |
| 19 | Washer fault (simulation, dorm-b): a dorm-b demo account that used the washer in step 15 reports a fault (`report_fault`, note hash); a dorm-b account with no washer session tries the same; a steward calls `set_out_of_service(true)`; a member tries to reserve; the holder of a future washer reservation cancels it; the agent opens the `fault_repair` task; a member claims and submits; the simulated verification passes; a verifier approves | `fault_reported {active_reports: 1}`; second report fails `E_NO_RECENT_SESSION`; `out_of_service`; reserve fails `E_OUT_OF_SERVICE` and bridge `can_access` returns `out_of_service`; cancellation refunds the full fee (`reservation_cancelled`, `reason: "out_of_service"`, Refund op Succeeded); `task_opened` (kind `Repair`, trigger `Report`); task Rewarded; `service_restored` with `RepairRewarded{task_id}`; `get_service_log` shows the period closed | ✓ (second report, reserve) |
| 20 | Fridge Schedule cleaning (simulation): on `fridge-01` (community_fridge profile, simulator adapter) the agent limits script calls `open_upkeep_task("weekly_clean")` before the interval; after the interval the agent opens it. Testnet time cannot be fast-forwarded, so the testnet asset runs with a demo interval of 1 h set by a DAO `set_profile` proposal (in evidence); the 168 h interval is covered by the sandbox test `inv_schedule_rule_due_only_after_interval` | Before: `E_RULE_NOT_DUE`; `get_rule_status` shows `due: false` and `next_due_estimate`. After: `task_opened` (kind `Cleaning`, trigger `Schedule`, `due_value` ≥ 1 h) with a rationale | ✓ (before) |
| 21 | `./scripts/verify.sh` | All ✅: keyless, code hashes, ledgers, rights ↔ tasks, proposals, no Reimbursement op above its rule's `reimbursable_max`, every out-of-service period closed by a Rewarded Repair task or a council call (or shown as still open), 21 evidence steps | |

## 3. Recording checklist

- [ ] Phone screen recorder on; wallet on testnet; large font.
- [ ] Printer framed so the nozzle movement is visible when it starts.
- [ ] Plug device audible/visible click (lamp or soldering station LED).
- [ ] Web app in `?demo=1` mode.
- [ ] Each on-camera person has consented (PILOT.md).
- [ ] Subtitles burned in; total ≤ 90 s; export 1080p MP4 ≤ 512 MB (X limit — verify).
