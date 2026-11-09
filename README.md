# COMMONKIT

**Shared things that pay for their own upkeep — and open up to the people who keep them alive.**

> Today a shared machine's money and rules live in one admin's spreadsheet. On COMMONKIT they live in the machine's own keyless NEAR account: no one can drain it, and no one can take back what you earned.

Built at NEAR HACKATHON 2026 · Track: **Social Money** · Testnet only.

> ⚠️ This README is a skeleton. Claude Code fills each section only with verified facts (tx links, test names, files). See `docs/SUBMISSION.md` §1.

## Try it in 2 minutes

- Hosted demo (no wallet): `<URL>`
- Do **open the 3D printer page** → see its own account, float vs cap, maintenance gauge and who keeps it alive.
- Do **open Proof** → see keyless accounts, identical code hashes across assets, ledger invariants, DAO proposals.
- Do **run `./scripts/simulate.sh washer`** → see the full loop on a simulated dorm washer in a second DAO.

## What we built during the hackathon

<!-- bullets with links -->

## The loop

<!-- mermaid from docs/ARCHITECTURE.md §4.4 -->

## Scenarios

| # | Scenario | Asset | Adapter | Status |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Makerspace printer | 3D printer | moonraker | <!-- real hardware --> |
| 2 | Risky workshop machine | Laser cutter (stand-in: …) | smart_plug | <!-- real hardware --> |
| 3 | Dorm laundry | Washer | simulator | simulation |
| 4 | Shared EV charger | Charger | ocpp | profile example only |
| 5 | Community cargo bike | Bike | smart_lock | profile example only |
| 6 | Shared GPU server | GPU | api_gateway | profile example only |
| 7 | Farming co-op | Tractor | smart_plug / manual_qr | profile example only |
| 8 | School equipment | Microscope | manual_qr | profile example only |

## Pilot

<!-- real numbers with links; consent; lowered thresholds note -->

## Judge flow

<!-- 18 steps: Do X → See Y · pnpm demo:step N · evidence link -->

## Verify it yourself

```bash
./scripts/verify.sh
./scripts/simulate.sh washer
```

## Social Money compliance

<!-- table -->

## Architecture

<!-- accounts, contracts, bridge, agent; links to docs/ -->

## Security model and honest limits

<!-- from docs/PRODUCT_TR.md §20 -->

## Trezu

<!-- paragraph from docs/DAO_INTEGRATION.md §7 -->

## Run locally

```bash
pnpm install
pnpm build:contracts
pnpm test:contracts
pnpm test
```

## Built with

<!-- libraries, templates, AI tools -->

## Hackathon window

All code in this repository was written after the hackathon announcement (2026-10-19). First commit: <!-- link -->

## License

MIT
