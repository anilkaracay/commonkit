# DEMO_SCRIPT

## 1. The 90-second video (English voice-over or captions)

Record on a phone + screen capture. Real hardware for printer and plug device. Simulation always labelled.

| Time | Shot | Caption / VO |
| :--- | :--- | :--- |
| 0–10 s | Quick cuts: printer, washing machine, tractor, bike. Then the line on screen. | "Today a shared machine's money and rules live in one admin's spreadsheet. On COMMONKIT they live in the machine's own keyless account." |
| 10–20 s | Phone: reserve printer slot, sign. Cut to printer starting. | "Reserve on NEAR. The printer only prints for a valid on-chain reservation." |
| 20–30 s | Second phone, no reservation → bridge rejects; printer stays idle. | "No reservation, no print." |
| 30–45 s | Asset page: nozzle gauge crosses threshold → agent opens task with rationale. Ayşe cleans nozzle; calibration print; Mehmet approves → 2 cards appear in her wallet. | "The printer asks for its own maintenance. Whoever keeps it alive earns the right to use it." |
| 45–60 s | Zeynep tries the laser → rejected (no credential). Ayşe trains her → credential card → plug clicks on. | "Risky machines need a credential. Training others earns access too." |
| 60–70 s | Ledger bar: float hits cap → excess flows to DAO treasury. Parts purchase → Sputnik proposal opened by the printer's contract. | "The machine keeps a small float. Everything else goes back to the community treasury." |
| 70–80 s | Board: washer in dorm-b (SIMULATED badge), same `code_hash` strip. | "Same contract. Different commons." |
| 80–85 s | Council tries to delete Ayşe's right → tx fails. | "No one can take back what you earned." |
| 85–90 s | Pilot rep one-liner + repo/demo URLs. | "COMMONKIT — shared things that pay for their own upkeep." |

## 2. Judge flow (18 steps) — each step = `pnpm demo:step N`

Each step writes tx hashes to `evidence/steps.json`. "Do X → See Y" wording goes into README verbatim.

| # | Do | See | Negative? |
| :--- | :--- | :--- | :--- |
| 1 | DAO proposal registers `printer-01`, sets profile, funds float | Proposal approved; asset float = 3 NEAR; DAO treasury decreased | |
| 2 | Ali reserves 2 slots, pays 0.5 fee + 2 deposit | Reservation Confirmed; float +0.5; deposits_held +2 | |
| 3 | Ali requests access via bridge (signed) | Bridge 200; `session_started` event; printer prints (video) / simulator session | |
| 4 | Can (no reservation) requests access | Bridge 403 `no valid reservation`; no on-chain change | ✓ |
| 5 | Session finishes; steward confirms clean return | Deposit refund op Succeeded; Ali clean_returns = 1 | |
| 6 | More fees push float over cap | `swept` event; DAO treasury +excess | |
| 7 | Telemetry crosses `nozzle_clean` threshold; agent opens task | `task_opened` with rationale; reward 2 rights | |
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
| 18 | `./scripts/verify.sh` | All ✅: keyless, code hashes, ledgers, rights ↔ tasks, proposals | |

## 3. Recording checklist

- [ ] Phone screen recorder on; wallet on testnet; large font.
- [ ] Printer framed so the nozzle movement is visible when it starts.
- [ ] Plug device audible/visible click (lamp or soldering station LED).
- [ ] Web app in `?demo=1` mode.
- [ ] Each on-camera person has consented (PILOT.md).
- [ ] Subtitles burned in; total ≤ 90 s; export 1080p MP4 ≤ 512 MB (X limit — verify).
