# @commonkit/bridge

The service next to the devices. It checks NEP-413 signed member requests, asks the asset contract
`can_access`, unlocks and locks devices through adapters, and reports sessions, telemetry and
verification results. Spec: `docs/BRIDGE_AND_ADAPTERS.md`.

```bash
pnpm --filter @commonkit/bridge test        # vitest
pnpm --filter @commonkit/bridge typecheck
pnpm --filter @commonkit/bridge dev         # SIMULATION: fake chain + simulated devices (config.sim.yaml)
pnpm --filter @commonkit/bridge gen:vectors # regenerate test/fixtures/nep413-vectors.json (deterministic)
```

```bash
pnpm --filter @commonkit/bridge dev:emulated   # SIMULATION: real adapters -> device emulators (config.emulated.yaml)
pnpm --filter @commonkit/bridge emulate moonraker --port 7125 --speed 60 --api-key k   # one emulated device
```

`dev:emulated` starts an emulated Moonraker and an emulated Shelly Gen2 (a lamp-class load, the
laser cutter stand-in), then the bridge: printer-01 → `moonraker` adapter, laser-01 → `smart_plug`
adapter, washer-01 and fridge-01 → simulator. No hardware is involved anywhere (D-022). Every asset is
labelled simulated, and every emulator response carries `x-commonkit-emulated`.

`./scripts/simulate.sh <asset_type>` (repo root, D-420) runs this bridge as a child process with
`network: sandbox` against a local NEAR sandbox node with the real contracts; `--fake` runs
`scripts/simulate-fake.ts` (bridge + agent on their fake chains, in-process).

`dev` uses an **in-memory fake chain**: nothing is written to NEAR. Every log line, event and evidence
line is labelled `simulated: true`, and sim evidence goes to `state/sim/evidence/`, never to `evidence/`.
`chain: near` reads through `@commonkit/sdk` and writes through `@commonkit/sdk/signer`, with one
function-call key per asset (`signer_env` or the keychain key listed in `deployments/testnet.json`; D-412).

## HTTP API

| Method | Path | Notes |
| :--- | :--- | :--- |
| GET | `/health` | network, chain kind, adapters online, `simulated` per asset |
| GET | `/assets` | device status, occupancy, active session, counters |
| POST | `/access/challenge` | `{asset_id, account_id, action?: access\|finish\|verify, reservation_id?, task_id?}` → `{nonce, message, recipient, action, expires_at, expires_at_iso}` |
| POST | `/access` | signed body (below) → `{ok, session_id, resumed, key_permission}` |
| GET | `/sessions/:id` | session state |
| POST | `/sessions/:id/finish` | signed by the holder (action `finish`) → `{ok, status, finish_tx}` |
| POST | `/verification/:asset/:task_id/run` | signed by the task claimer (action `verify`) → 202 `{ok, run_id}` |
| GET | `/verification/runs/:id` | run status, `passed`, `details_hash`, `tx` |
| GET | `/events` | Server-Sent Events (recent history, then live) |

Signed body: `{asset_id, account_id, reservation_id?, task_id?, public_key, signature, nonce, message, recipient?, callback_url?}`
where `signature` is the wallet's NEP-413 `signMessage` output (base64) for `{message, nonce, recipient}` from the challenge.
Rejections are `{ok: false, reason, detail}`; `reason` is one of the codes in `src/errors.ts`, for example
`NONCE_USED`, `NONCE_EXPIRED`, `RECIPIENT_MISMATCH`, `BAD_SIGNATURE`, `KEY_NOT_ON_ACCOUNT` or `RESERVATION_NOT_ACCESSIBLE`.

## manual_qr pilot flow (what the web app calls)

For items without electronics (D-024 pilot). Deep links go to the app at `<app_base_url>/a/<assetId>`
(`adapter_config.app_base_url`, default `http://localhost:5173/app`).

| Step | Who | App does | Bridge endpoint |
| :--- | :--- | :--- | :--- |
| Sticker on the item | — | QR codes of the three links | `GET /manual/:asset/links` → `{links: {reserve, return, fault}}` (`?action=reserve\|return\|fault`) |
| Reserve | member | `?action=reserve` → `reserve` on the asset contract (wallet) | — |
| Pick up | member | NEP-413 `signMessage` → `/access` | `POST /access/challenge {action: "access"}`, `POST /access` → `device.manual_qr {handover_code, handover_link, return_link}` |
| Handover (start) | steward | scans the member's `handover_link` QR (`?action=confirm&step=handover&session=…&code=…`), signs | `POST /access/challenge {action: "confirm", reservation_id}`, `POST /manual/:asset/:session_id/confirm {step: "handover", code}` + signed body |
| Return (finish) | steward | scans the sticker `?action=return`, reads the loan, signs | `GET /manual/:asset/session` → `{current, outstanding[]}` (never the code), then `POST /manual/:asset/:session_id/confirm {step: "return"}` |
| Fault | member | `?action=fault` → `report_fault` on the asset contract (wallet) | — |

Rules: the confirmer must hold the `steward` role on the asset (`get_roles`) and is never the holder;
the handover code must match; the return ends the session and counts one `use`. If the reservation's
deadline passes first, the session ends on chain and the loan stays `outstanding`; a later
steward-confirmed return still counts the use. Rejections: `NOT_STEWARD`, `CONFIRM_REFUSED` (holder,
wrong code, never handed over), `NOT_MANUAL_ASSET`.

## Scenario format (simulator)

YAML or JSON, validated with zod (`src/adapters/simulator/scenario.ts`). One scenario per profile in
`../scenarios/<asset_type>.yaml` (used by `./scripts/simulate.sh`, D-420; their extra top-level
`simulate:` block is stripped by this schema); unit-test fixtures in `test/fixtures/scenarios/`.

```yaml
scenario: washer            # id; also the simulator state key
simulated: true             # required, must be true
seed: 20261114              # deterministic jitter
speed: 60                   # simulated seconds per real second (adapter_config.speed overrides)
metrics:                    # <= 15 counters (+ any gauges); `simulated` is reserved
  cycles:      { initial: 27, per_session: 1, curve: step }      # added when a session completes
  run_seconds: { initial: 97200, per_session: 2700, curve: linear } # grows during the session
  energy_wh:   { initial: 24300, per_session: 700, curve: linear, idle_per_hour: 1 }
session: { duration_sec: 2700, jitter_pct: 10 }
verification: { duration_sec: 300, default: pass }
failures:
  - { kind: session_error, session: 3, at_fraction: 0.5, add: { jobs_failed: 1 } }
  - { kind: verification_fail, run: 2 }
  - { kind: offline, from_sec: 36000, until_sec: 36900 }   # simulated seconds since first start
```

Metrics may also be **gauges**, levels that go up and down, such as `temperature_c` or `fuel_level`:

```yaml
  temperature_c: { type: gauge, initial: 4, per_session: 1.5, idle_per_hour: -2, min: 3, max: 18 }
failures:
  - { kind: gauge_set, metric: temperature_c, at_sec: 7200, value: 12 }   # door left ajar
verification: { sets: { temperature_c: 4 } }   # a passed check finds the gauge restored
```

The contract accepts only monotonic counters, so a gauge never goes on chain raw. The asset's bridge
config derives counters from it, sampled on every telemetry tick. The live value appears in
`telemetry_reported` events and `/assets`.

```yaml
gauges:
  temperature_c: [{ derive: samples_above, limit: 8, counter: temp_high_samples }]
  fuel_level:    [{ derive: decrease_sum, counter: fuel_used_dl, scale: 10 }, { derive: increase_count, min_step: 5, counter: refills }]
```

Scenario examples: `washer`, `printer_3d` (includes `filament_used_mm`), `laser_cutter`, `community_fridge` (`temperature_c`), `tractor` (`fuel_level`).

A counter's value at simulated time `t` is `initial + floor(idle_per_hour * t / 3600) + completed sessions + running session (linear only)`.
A session locked early adds its linear share but no step counters. Every report also carries the metric
`simulated = 1`, so the on-chain telemetry itself says it is simulated.

## Adapters

`src/adapters/types.ts` defines the interface. Every adapter passes `test/adapter.contract.ts`:

| Adapter | Tested against | Metrics |
| :--- | :--- | :--- |
| `simulator` | 5 scenarios | per scenario (+ gauges) |
| `moonraker` | Moonraker emulator | `print_seconds`, `nozzle_seconds`, `jobs_total`, `jobs_failed`, `filament_used_mm` |
| `octoprint` | OctoPrint emulator | same, counted by the adapter |
| `smart_plug` | Shelly Gen2, Shelly Gen1, Tasmota emulators | `energy_wh`, `run_seconds`, `cycles` (+ `temperature_c` gauge, Gen2) |
| `manual_qr` | steward confirmations | `uses` |

Safety: an asset with `safety.dangerous: true` and a real adapter does not load unless it has a
labelled `safety.stand_in` (shown in events) or `human_present_confirmed: true`, which an operator sets
only while a person is physically at the device. The demo laser is an emulated lamp-class load.

## Emulators

`src/emulators/`: Moonraker, OctoPrint, Shelly Gen2, Shelly Gen1 and Tasmota, each implementing only the
documented API subset the adapters use (research E1–E9). Faults can be switched at runtime:
`POST /__emulator/faults {"offline"|"auth_fail"|"job_error"|"stuck": true}`. See BRIDGE_AND_ADAPTERS §4.7.
