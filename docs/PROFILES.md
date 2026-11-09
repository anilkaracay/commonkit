# PROFILES — the 8 scenarios as asset profiles

Each file in `profiles/` is a JSON `Profile` (CONTRACT_SPEC §2.1) plus a non-chain `meta` block used by the web app, the bridge and the agent. Amounts below are in NEAR for readability; files store yocto strings. Values are demo values; thresholds marked *(pilot)* are deliberately lowered.

| File | asset_type | unit | slot | price/slot | deposit (trusted) | float cap | credential | group | adapter | key rules | status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `printer_3d.json` | printer_3d | job | 30 min | 0.25 | 2 (0.5 after 3 clean) | 3 | — | makerlab-fab | moonraker | `nozzle_clean`: nozzle_seconds ≥ 720 000 (200 h; *pilot 1 800*) → 2 rights, test: calibration print · `bed_level`: jobs_total ≥ 50 → 1 right | real hardware |
| `laser_cutter.json` | laser_cutter | session_minutes | 15 min | 0.1 | 3 (1 after 3 clean) | 3 | laser_safety | makerlab-fab | smart_plug | `lens_clean`: run_seconds ≥ 144 000 (40 h; *pilot 600*) → 2 rights, test: power profile | real hardware (stand-in allowed) |
| `washer.json` | washer | cycle | 60 min | 0.2 | 0 | 1 | — | dorm-b-laundry | simulator | `filter_clean`: cycles ≥ 30 → 3 rights · `descale`: cycles ≥ 120 → 5 rights | simulation |
| `ev_charger.json` | ev_charger | kWh (billed per slot in v1) | 60 min | 0.5 | 0 | 5 | — | site-ev | ocpp | `cable_check`: sessions ≥ 100 → 2 rights | profile example only |
| `cargo_bike.json` | cargo_bike | km (billed per slot in v1) | 60 min | 0.2 | 3 (1 after 5 clean) | 2 | — | street-bikes | smart_lock | `brake_check`: km ≥ 300 → 2 rights · `tire_check`: km ≥ 500 → 1 right | profile example only |
| `gpu_server.json` | gpu_server | gpu_hour | 60 min | 0.3 | 0 | 5 | gpu_basics | lab-compute | api_gateway | `driver_update`: days_since_update ≥ 30 → 2 rights (digital, test-verified) · `dust_clean`: gpu_hours ≥ 1 000 → 3 rights | profile example only |
| `tractor.json` | tractor | hour | 4 h | 1 | 5 (2 after 3 clean) | 10 | tractor_operator | coop-field | smart_plug / manual_qr | `oil_change`: engine_seconds ≥ 360 000 (100 h) → 4 rights | profile example only |
| `microscope.json` | microscope | loan | 1 day | 0 | 1 | 1 | — | school-lab | manual_qr | `clean_inventory`: uses ≥ 20 → 1 right | profile example only |

Notes:
- v1 bills every asset per time slot; the "unit" label (kWh, km, cycle) is what telemetry measures and what the UI shows. Metered billing per unit is a documented next step — do not claim it.
- `meta` block (not on-chain): `{ display_name, community, icon, photo, scenario_story_tr, scenario_story_en, purchase_hints: [{rule_id, after_n, item, amount, receiver}] }`.
- A JSON schema (`profiles/profile.schema.json`) mirrors `validate_profile`; CI validates all 8 files.
- `scenarios/<asset_type>.yaml` drives the simulator for every profile so judges can run `./scripts/simulate.sh <asset_type>` for any of the 8 (labelled simulation).
