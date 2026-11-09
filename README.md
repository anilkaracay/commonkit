# COMMONKIT

**Shared things that pay for their own upkeep — and open up to the people who keep them alive.**

Fix it, refill it, clean it, check it, teach it — every kind of care that keeps a shared thing alive earns access to it.

> Today a shared machine's money and rules live in one admin's spreadsheet. On COMMONKIT they live in the machine's own keyless NEAR account: no one can drain it, and no one can take back what you earned.
>
> *Precisely:* no method deletes, downgrades or transfers a usage-right card once granted. The DAO can still make a card unusable in practice — by deactivating the asset, moving it to another group, or adding a credential requirement — and that limit is listed under "Security model and honest limits".

Built at NEAR HACKATHON 2026 · Track: **Social Money** · Testnet only.

> ⚠️ This README is a skeleton. Claude Code fills each section only with verified facts (tx links, test names, files). See `docs/SUBMISSION.md` §1.

## Try it in 2 minutes

- Hosted demo (no wallet): `<URL>`
- Do **open the 3D printer page** → see its own account, float vs cap, upkeep gauge and who keeps it alive.
- Do **open Proof** → see keyless accounts, identical code hashes across assets, ledger invariants, DAO proposals.
- Do **run `./scripts/simulate.sh washer`** → see the full loop on a simulated dorm washer in a second DAO.

## What we built during the hackathon

<!-- bullets with links -->

## The loop

<!-- mermaid from docs/ARCHITECTURE.md §4.4 -->

## Scenarios

12 asset profiles, one contract (`docs/PROFILES.md`, `profiles/*.json`). Grouped by upkeep kind; a profile appears under every kind it uses. Status comes from each profile's `meta.status`. "Pending" means planned as real hardware with no device session on testnet yet; it becomes "real hardware" only with a tx link.

| Upkeep kind | Profile: rule (trigger) | Adapter | Status |
| :--- | :--- | :--- | :--- |
| Maintenance | printer_3d: `nozzle_clean` (Metric), `bed_level` (Metric) | moonraker | real hardware (pending) |
| Maintenance | laser_cutter: `lens_clean` (Metric) | smart_plug | real hardware (pending; labelled stand-in allowed) |
| Maintenance | washer: `descale` (Metric) | simulator | simulation |
| Maintenance | gpu_server: `driver_update` (Schedule) · tractor: `oil_change` (Metric) | api_gateway · smart_plug | profile example only |
| Restock | printer_3d: `filament_spool` (Metric, receipt ≤ 0.5 NEAR) | moonraker | real hardware (pending) |
| Restock | washer: `detergent` (Metric, receipt ≤ 0.3 NEAR) | simulator | simulation |
| Restock | emergency_generator: `fuel_refill` (Metric, receipt ≤ 1 NEAR) | smart_plug | profile example only |
| Cleaning | washer: `filter_clean` (Metric) | simulator | simulation |
| Cleaning | community_fridge: `weekly_clean` (Schedule) · gpu_server: `dust_clean` · tractor: `pump_filter_clean` (Schedule) · microscope: `clean_inventory` · rehearsal_room: `room_clean` | smart_plug · api_gateway · smart_plug · manual_qr · smart_lock | profile example only |
| Inspection | laser_cutter: `monthly_safety_check` (Schedule) | smart_plug | real hardware (pending; labelled stand-in allowed) |
| Inspection | ev_charger: `cable_check` · cargo_bike: `brake_check`, `tire_check` · community_fridge: `temperature_check` · emergency_generator: `monthly_test_run` (Schedule) · tool_library_ladder: `safety_inspection` | ocpp · smart_lock · smart_plug · smart_plug · manual_qr | profile example only |
| Repair | printer_3d: `fault_repair` (Report) | moonraker | real hardware (pending) |
| Repair | washer: `fault_repair` (Report) | simulator | simulation |
| Repair | rehearsal_room: `fault_repair` (Report, 2 reports) | smart_lock | profile example only |
| Rebalance | cargo_bike: `return_home` (Report, 2 reports) | smart_lock | profile example only |
| Supervision | rehearsal_room: `evening_supervision` (Schedule) | smart_lock | profile example only |
| Teaching (credential flow, not a rule) | laser_cutter `laser_safety` | smart_plug | real hardware (pending) |

<!-- Replace "(pending)" only with a tx link to a real-device session. Every row also runs with ./scripts/simulate.sh <asset_type> (labelled simulation). -->

## Pilot

<!-- real numbers with links; consent; lowered thresholds note -->

## Judge flow

<!-- 21 steps (docs/DEMO_SCRIPT.md §2; step 21 = verify.sh): Do X → See Y · pnpm demo:step N · evidence link -->

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
