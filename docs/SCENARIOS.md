# Scenarios: 12 profiles, one contract

Every profile runs on the same `asset` WASM; only the profile JSON and the device adapter change ([`PROFILES.md`](PROFILES.md), [`profiles/*.json`](../profiles)). Back to the [README](../README.md), which lists the same 12 scenarios by what the community needs.

The table groups rules by upkeep kind; a profile appears under every kind it uses. **Status** follows `meta.status` in each profile file: the four testnet assets are `simulation (testnet asset)`, the other eight `simulator profile`. No row is real hardware (D-022). Every profile also passes `./scripts/simulate.sh` (with its `asset_type`, or `all`) on a local NEAR sandbox ([`evidence/simulate-all-2026-11-10.txt`](../evidence/simulate-all-2026-11-10.txt)).

| Upkeep kind | Profile: rule (trigger) | Device path | Status | Testnet evidence |
| :--- | :--- | :--- | :--- | :--- |
| Maintenance | printer-01 (printer_3d): `nozzle_clean` (Metric), `bed_level` (Metric) | moonraker adapter → emulated Moonraker | simulation (testnet asset) | steps 7–8, 16 |
| Maintenance | laser-01 (laser_cutter): `lens_clean` (Metric) | smart_plug adapter → emulated Shelly | simulation (testnet asset) | — |
| Maintenance | washer-01 (washer): `descale` (Metric) | simulator | simulation (testnet asset) | — |
| Maintenance | gpu_server: `driver_update` (Schedule) · tractor: `oil_change` (Metric) | simulator | simulator profile | — |
| Restock | printer-01: `filament_spool` (Metric, receipt ≤ 0.5 NEAR) | moonraker adapter → emulated Moonraker | simulation (testnet asset) | step 18 |
| Restock | washer-01: `detergent` (Metric, receipt ≤ 0.3 NEAR) | simulator | simulation (testnet asset) | — |
| Restock | emergency_generator: `fuel_refill` (Metric, receipt ≤ 1 NEAR) | simulator | simulator profile | — |
| Cleaning | washer-01: `filter_clean` (Metric) | simulator | simulation (testnet asset) | step 16 |
| Cleaning | fridge-01 (community_fridge): `weekly_clean` (Schedule) | simulator | simulation (testnet asset) | step 20 |
| Cleaning | gpu_server: `dust_clean` · tractor: `pump_filter_clean` (Schedule) · microscope: `clean_inventory` · rehearsal_room: `room_clean` | simulator | simulator profile | — |
| Inspection | laser-01: `monthly_safety_check` (Schedule) · fridge-01: `temperature_check` (Metric) | emulated Shelly · simulator | simulation (testnet asset) | — |
| Inspection | ev_charger: `cable_check` · cargo_bike: `brake_check`, `tire_check` · emergency_generator: `monthly_test_run` (Schedule) · tool_library_ladder: `safety_inspection` | simulator | simulator profile | — |
| Repair | printer-01: `fault_repair` (Report) | moonraker adapter → emulated Moonraker | simulation (testnet asset) | — |
| Repair | washer-01: `fault_repair` (Report) | simulator | simulation (testnet asset) | step 19 |
| Repair | rehearsal_room: `fault_repair` (Report, 2 reports) | simulator | simulator profile | — |
| Rebalance | cargo_bike: `return_home` (Report, 2 reports) | simulator | simulator profile | — |
| Supervision | rehearsal_room: `evening_supervision` (Schedule) | simulator | simulator profile | — |
| Teaching (credential flow, not a rule) | laser-01 `laser_safety` | emulated Shelly | simulation (testnet asset) | steps 11–13 |

Profiles whose adapter the bridge does not have (OCPP, smart lock, API gateway, `manual_qr` loans) run on the simulator in `simulate.sh` (D-420).

## Simulation and emulators

Everything the demo shows on a device is simulated or emulated, and labelled so (D-022):

- `printer-01` and `laser-01` go through the bridge's real `moonraker` and `smart_plug` adapters against local device emulators that implement the documented API subset; the laser's load is an emulated 60 W lamp-class stand-in, so nothing is energised (judge steps 3, 8, 13).
- `washer-01` and `fridge-01` use the simulator; its reports put `simulated = 1` into on-chain telemetry (step 15, D-401).
- `simulate.sh` runs on a private local sandbox, not on testnet; `--fake` runs the bridge and agent on in-memory fake chains and says on every line that the contracts are not exercised (D-420).
- Demo thresholds lowered on testnet by labelled DAO proposals: [`JUDGE_FLOW.md`](JUDGE_FLOW.md#demo-overrides-on-testnet).
