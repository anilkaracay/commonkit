# FRONTEND_SPEC — web app

Vite + React + TypeScript + Tailwind. Static build, hosted (Vercel or GitHub Pages). Reads testnet via RPC without a wallet; wallet only for actions. Mobile-first.

## 1. Design direction (from PRODUCT_TR §12)

- **The asset is a character.** Each asset page opens like a "machine card": name, account id, live status (in service / **OUT OF SERVICE**), upkeep gauge, "who keeps me alive" list.
- **One-glance upkeep gauge:** per rule, progress to due in the rule's own terms (Metric: delta vs threshold; Schedule: time since last vs `every_hours`, with `next_due_estimate`; Report: active reports vs `min_reports`), float in the kasa (vs cap), open task.
- **Upkeep kinds are visible:** every task row and task page shows an icon + label for its `UpkeepKind` (Maintenance, Restock, Cleaning, Inspection, Repair, Rebalance, Supervision — `web/src/components/UpkeepKind.tsx`), and the trigger type.
- **Chain visible, not noisy:** a small "tx" link on each important row; full detail in "Proof".
- **Simulation is visible everywhere (D-022):** every asset carries the "SIMULATED" badge (board card, asset page header, task pages, proof rows, demo overlay), as a quiet, designed-in label (outlined square + SIMULATED, no colour badge). Assets whose bridge adapter talks to a device emulator (printer-01 → emulated Moonraker, laser-01 → emulated Shelly) also show an **"emulated device"** label next to the adapter name; simulator assets (washer-01, fridge-01) show "simulator". No screen says or implies a physical device.
- No marketing hero. The home page *is* the board.
- Typography & palette (D-030): the shared `@commonkit/design` system — white/ice surfaces, ink type, cobalt actions, orange only for due/open upkeep, red only for refusals and out of service; CK Sans (Mona Sans subset) + Geist Mono for ids and hashes; tabular figures for every number. Light only. Accessible contrast. Visual first: asset cards and pages lead with the machine's poster still. Details in `web/DESIGN.md`.
- Every screen used in the 90-second video must look good at phone width and at 1080p.

## 2. Routes

The landing page (`landing/`, D-025) owns `/`. The app is built with Vite base `/app/` and every route lives under `/app`; the combined static site is built by `pnpm build:site` (landing at `/`, app at `/app/`, SPA fallback for `/app/*`, see `vercel.json`).

| Route | Wallet? | Content |
| :--- | :--- | :--- |
| `/app` | no | **Board**: communities → assets (cards with status + gauge; an out-of-service asset shows an **OUT OF SERVICE** state with since-time and reason hash), open tasks across assets **grouped by upkeep kind**, latest rights minted, latest proposals. "Same contract" strip showing all asset accounts with identical `code_hash`. **Scenario matrix**: the 12 profiles (PROFILES.md) grouped by upkeep kind, each with a Status column: "simulation (testnet asset)" for printer-01, laser-01, washer-01, fridge-01; "profile example only (simulator scenario)" for the other eight. |
| `/app/c/:community` | no | Community: DAO id + council + treasury, commons contract, groups, credential kinds, roles, governance panel (recent proposals) |
| `/app/a/:assetId` | no | Asset card: live status (bridge SSE if reachable, else chain) incl. service state (`get_service_status`) and service log (`get_service_log`), telemetry, rules status (due bars per trigger, `get_rule_status`), active fault reports per rule (`get_faults`, counts only), kasa (float/cap, deposits held, reserved rewards, swept total, reimbursements paid), availability calendar (reservations disabled while out of service), reservations, tasks, escalations, reputation leaderboard (`upkeeps`, `fault_reports`), profile. **"Report a fault"** button (wallet): enabled only for accounts with a session in the last 14 days; the note is hashed in the browser and only the hash goes on chain; `E_NO_RECENT_SESSION` / `E_ALREADY_REPORTED` shown as plain messages. Stewards/council see "Set out of service"; council sees "Return to service". |
| `/app/a/:assetId/reserve` | yes | Pick slots → shows fee/deposit or "use a right" → sign `reserve` |
| `/app/a/:assetId/access/:reservationId` | yes | "Start" → NEP-413 sign → POST to bridge → show result (emulated printer starts / emulated plug on, labelled SIMULATED) |
| `/app/t/:assetId/:taskId` | partly | Task detail: kind icon + label, trigger and due value at open, rationale (agent; "manual" badge if a council member bypassed the due check), rule facts, claim / submit evidence (hash computed in browser from a photo; photo never uploaded on-chain). Restock/Repair tasks also take an **expense** (NEAR, capped by `reimbursable_max`, shown next to the field) and a **receipt hash** (computed in the browser from a receipt photo/PDF, never uploaded); the page shows `expense_state` (Reserved / needs council / NeedsEscalation → proposal link / Paid → Reimbursement op tx). Verification result, approvals, reward cards with links |
| `/app/me` | yes | My cards (rights + credentials), reservations, tasks, reputation |
| `/app/train` | yes | Trainers propose credentials; verifiers approve |
| `/app/approvals` | yes | Stewards: confirm returns; verifiers: approve tasks/credentials (expense and receipt hash shown on Restock/Repair tasks); council: second approvals (incl. expenses above `council_threshold_cash`), service restore |
| `/app/proof` | no | Everything verify.sh checks, live: keyless accounts, code hashes, ledger invariants, DAO proposal links, evidence tx list per demo step |
| `/app/agent` | no | Agent feed: actions with rationale, limits-demo results |
| `/app/pilot` | yes (step 1) | Pilot onboarding in Turkish (D-024): 1) create/connect a testnet wallet, 2) get funded ("ask the organiser" + copy account id), 3) scan the item QR → deep link to the asset page with the reservation / return / fault action. Strings live in one file for review. |

## 3. Data layer

- `packages/sdk` client: `view(contract, method, args)`; typed wrappers for every view in CONTRACT_SPEC.
- React Query for caching; polling 5–10 s on asset pages.
- Tx links: explorer base URL from config (research B16); if an explorer API can list txs with logs for an account, use it for per-row links; otherwise read `evidence/*.json` shipped with the build (`/evidence/index.json`).
- Event decoding: `EVENT_JSON:` logs parsed by `packages/sdk/events.ts` where tx data is available.

## 4. Wallet

- Use the currently recommended connector (research B17) with testnet + NEP-413 `signMessage` support.
- Actions call contract methods with exact attached deposits computed from views (`get_profile`, `get_reputation`).
- Show human-readable errors by mapping `E_*` codes (CONTRACT_SPEC §10) to messages.

## 5. Demo mode

- `?demo=1` hides wallet chrome, enlarges key numbers, and shows a small "step n/21" overlay driven by `evidence/index.json` — useful for recording.
- A "Run simulation" button on every asset triggers nothing on-chain by itself; it links to the README command (judges run `simulate.sh`) and shows the latest simulated run's evidence.

## 6. Acceptance

- Opens with no wallet, no console errors, Lighthouse a11y ≥ 90 on `/` and `/a/:id`.
- All four testnet assets (printer-01, laser-01, washer-01, fridge-01) visible with correct live numbers from testnet, each with the SIMULATED badge.
- Every number on `/proof` matches verify.sh output.
- Works on a 390 px wide screen.
