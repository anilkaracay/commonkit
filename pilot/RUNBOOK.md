# Pilot runbook (one page)

Plan and rules: `docs/PILOT.md` (D-024). Testnet only. Nobody joins before they consent.

## Roles

| Role | Who | Does |
| :--- | :--- | :--- |
| Organiser | team member | runs the day; funds accounts; keeps the paper log; files evidence |
| Steward | one participant (steward role via DAO) | hands the item over only for a confirmed reservation; checks it on return; `confirm_return` |
| Verifier | another participant (verifier role via DAO), never the worker | approves the upkeep task |
| Participants | ≥ 5 real people | reserve, use, return, report faults, do the upkeep task |

## Before the day

1. Human confirms item, people, place (H1); plug model if layer (b) (H2).
2. Asset for the item deployed with the `manual_qr` adapter; lowered thresholds set by DAO `set_profile` (tx in evidence).
3. Steward and verifier roles set by DAO proposal (two different people).
4. Hosted app reachable; regenerate QR sheets with the real domain: `pnpm --filter @commonkit/scripts pilot:qr --base-url https://<domain>`. Print `pilot/qr/<alias>.pdf` (3 pages: check out, return, report a fault). Sheets for simulated assets carry a SIMULATED banner; the plug sheet carries STAND-IN.
5. Send the consent message (PILOT §4). Add each "yes" to `pilot/participants.local.json` (gitignored, account ids only).
6. Run `scripts/pilot/fund-participants.ts` (2 testnet NEAR each, consenting accounts only).

## On the day (order)

1. 2-minute explanation (PILOT §3). Each participant opens the app in their own wallet.
2. Check out: participant scans the **check out** QR → reserves a slot → shows the confirmed reservation → steward hands the item over.
3. Return: participant brings it back → steward scans the **return** QR → checks the item → confirms the return (deposit refund on chain).
4. Repeat until ≥ 10 reservations across ≥ 5 people.
5. Upkeep: when the task comes due, one participant claims it, does it, submits evidence (photo hash only); a different participant (verifier) approves → rights minted.
6. Faults: anyone who used the item and sees a problem scans **report a fault**.
7. Plug layer (b), if present: no reservation → plug stays off; reservation → bridge switches on; session end → off. Film only consenting people; the lamp is labelled a stand-in.
8. Organiser exports tx hashes to `evidence/pilot/` and fills the counts in PILOT §1.

## If the network or the app fails

- Keep going on paper: the steward writes time, account id, action (out / return / fault / upkeep) and the reservation id if known on the paper log. The item still goes out only to someone with a reservation made earlier, or the hand-over waits.
- When the network is back, the participant or steward enters the action on chain; the evidence file marks each such entry "entered later from the paper log" with the original time. No paper-only action is counted as on-chain in the README.
- Keep a photo of the paper log locally (gitignored); do not commit it.
