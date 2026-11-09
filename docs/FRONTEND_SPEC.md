# FRONTEND_SPEC — web app

Vite + React + TypeScript + Tailwind. Static build, hosted (Vercel or GitHub Pages). Reads testnet via RPC without a wallet; wallet only for actions. Mobile-first.

## 1. Design direction (from PRODUCT_TR §12)

- **The asset is a character.** Each asset page opens like a "machine card": name, account id, live status, maintenance gauge, "who keeps me alive" list.
- **One-glance maintenance gauge:** remaining usage until next due rule, float in the kasa (vs cap), open task.
- **Chain visible, not noisy:** a small "tx" link on each important row; full detail in "Proof".
- **Simulation is visibly different:** a "SIMULATED" badge and a muted/hatched style for simulator assets.
- No marketing hero. The home page *is* the board.
- Typography & palette: pick one distinctive, calm direction (load the frontend-design skill if available). Light + dark. Accessible contrast.
- Every screen used in the 90-second video must look good at phone width and at 1080p.

## 2. Routes

| Route | Wallet? | Content |
| :--- | :--- | :--- |
| `/` | no | **Board**: communities → assets (cards with status + gauge), open tasks across assets, latest rights minted, latest proposals. "Same contract" strip showing all asset accounts with identical `code_hash`. |
| `/c/:community` | no | Community: DAO id + council + treasury, commons contract, groups, credential kinds, roles, governance panel (recent proposals) |
| `/a/:assetId` | no | Asset card: live status (bridge SSE if reachable, else chain), telemetry, rules status (due bars), kasa (float/cap, deposits held, reserved rewards, swept total), availability calendar, reservations, tasks, escalations, reputation leaderboard, profile |
| `/a/:assetId/reserve` | yes | Pick slots → shows fee/deposit or "use a right" → sign `reserve` |
| `/a/:assetId/access/:reservationId` | yes | "Start" → NEP-413 sign → POST to bridge → show result (printer starts / plug on) |
| `/t/:assetId/:taskId` | partly | Task detail: rationale (agent), rule facts, claim / submit evidence (hash computed in browser from a photo; photo never uploaded on-chain), verification result, approvals, reward cards with links |
| `/me` | yes | My cards (rights + credentials), reservations, tasks, reputation |
| `/train` | yes | Trainers propose credentials; verifiers approve |
| `/approvals` | yes | Stewards: confirm returns; verifiers: approve tasks/credentials; council: second approvals |
| `/proof` | no | Everything verify.sh checks, live: keyless accounts, code hashes, ledger invariants, DAO proposal links, evidence tx list per demo step |
| `/agent` | no | Agent feed: actions with rationale, limits-demo results |

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

- `?demo=1` hides wallet chrome, enlarges key numbers, and shows a small "step n/18" overlay driven by `evidence/index.json` — useful for recording.
- A "Run simulation" button on simulator assets triggers nothing on-chain by itself; it links to the README command (judges run `simulate.sh`) and shows the latest simulated run's evidence.

## 6. Acceptance

- Opens with no wallet, no console errors, Lighthouse a11y ≥ 90 on `/` and `/a/:id`.
- All three demo assets visible with correct live numbers from testnet.
- Every number on `/proof` matches verify.sh output.
- Works on a 390 px wide screen.
