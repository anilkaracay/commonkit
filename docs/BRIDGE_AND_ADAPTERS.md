# BRIDGE_AND_ADAPTERS

The bridge is a small TypeScript service that runs next to the devices (Raspberry Pi or a laptop on the same LAN). It is the **only** thing that can talk to the device APIs and the **only** account allowed to report sessions and telemetry to the asset contracts.

## 1. Responsibilities

1. Verify member access requests (NEP-413 signed messages).
2. Ask the asset contract `can_access(account, reservation_id)` (view).
3. Call `mark_session_started` first, then unlock / start the device through its adapter (D-404: if the chain write fails, the device was never unlocked).
4. Watch the session; lock the device at the end or at timeout; call `mark_session_finished(metrics)`.
5. Periodically read device metrics and call `report_telemetry`.
6. Run the rule's verification test after an upkeep task is submitted (rules with `requires_verification_test`); call `submit_verification_result`.
7. Log everything (structured JSON logs + `evidence/bridge-<date>.jsonl`).

## 2. Configuration (`bridge/config.yaml` + `.env`)

```yaml
network: testnet
rpc_url: ${NEAR_RPC_URL}
bridge_account: bridge-01.makerlab.<root>
# private key: env BRIDGE_PRIVATE_KEY (function-call key, restricted to asset contracts + methods)
assets:
  - asset_id: printer-01.makerlab.<root>
    adapter: moonraker
    adapter_config: { base_url: http://printer.local:7125, api_key_env: MOONRAKER_API_KEY }
    telemetry_interval_sec: 60
    session_timeout_min: 240
  - asset_id: laser-01.makerlab.<root>
    adapter: smart_plug
    adapter_config: { vendor: shelly_gen2, base_url: http://plug-laser.local, channel: 0 }
    telemetry_interval_sec: 30
    session_timeout_min: 60
  - asset_id: washer-01.dorm-b.<root>
    adapter: simulator
    adapter_config: { scenario: scenarios/washer.yaml, speed: 60 }
    telemetry_interval_sec: 5
```

Per-asset keys added by the bridge decisions: `verification_tests: {<rule_id>: {type, ...}}` (D-407; simulator assets default to `{type: simulated}`), `safety: {dangerous, stand_in?, human_present_confirmed}` (D-408), and `gauges` (D-410, §4.6). `chain: near | fake` selects the real NEAR client or an in-memory model of the asset contract whose output is labelled simulated and never written to `evidence/` (D-409).

**One bridge account, one function-call key per asset contract** (a NEAR function-call key is bound to one receiver contract). The bridge keeps a key per asset in env (`BRIDGE_KEY_<ASSET_ALIAS>`), all for the same bridge account. Allowed methods: `mark_session_started, mark_session_finished, report_telemetry, submit_verification_result`.

## 3. HTTP API (Fastify, zod-validated)

| Method | Path | Body | Result |
| :--- | :--- | :--- | :--- |
| GET | `/health` | — | adapters status |
| GET | `/assets` | — | configured assets + live device state |
| POST | `/access/challenge` | `{asset_id, account_id, action: access\|finish\|verify (default access), reservation_id \| task_id}` (D-403) | `{nonce (32 bytes b64), message, recipient: "commonkit-bridge:<bridge_account>", expires_at}` |
| POST | `/access` | `{asset_id, reservation_id, account_id, public_key, signature, nonce, message}` + optional multipart job file | `{ok, session_id, reason?}` |
| POST | `/sessions/:id/finish` | signed like `/access` (holder can end early) | `{ok}` |
| POST | `/verification/:asset/:task_id/run` | signed by the task claimer (action `verify`) | checks on chain: task `Submitted`, signer is the claimer, no result yet; returns 202 `{run_id}`; progress over SSE and `GET /verification/runs/:id` (D-407) |
| GET | `/events` | — | Server-Sent Events of bridge actions (for the live demo screen) |

### 3.1 NEP-413 verification (must all pass)

1. `nonce` was issued by `/access/challenge` for this action, unused, not expired (300 s, chain time); it is marked used on its first submission even if later checks fail. Nonces live in memory, so a restart invalidates them (D-403).
2. `recipient` equals our recipient string; `message` equals the issued message (contains asset, reservation id, nonce, expiry).
3. Signature valid for the NEP-413 payload (borsh-serialized per the NEP — use a vetted library or implement exactly per spec; add test vectors).
4. `public_key` is a current **full-access** key of `account_id` (RPC `view_access_key`, final). A function-call key is refused with `KEY_NOT_FULL_ACCESS` (D-019): a key handed to some dapp must never open a physical device.
5. `can_access(account_id, reservation_id).ok == true` (reason `ok`, or `session_active` for resumption). `out_of_service` → 403 `OUT_OF_SERVICE`; any other reason → 403 `RESERVATION_NOT_ACCESSIBLE` with the contract's reason. While the asset is out of service (CONTRACT_SPEC §3.3) `can_access` returns `ok=false, reason="out_of_service"`; the bridge answers 403 `OUT_OF_SERVICE` and the device stays locked. `E_OUT_OF_SERVICE` from `mark_session_started` (service changed between view and write) gives the same 403, and because the chain write comes first the device was never unlocked (D-404, D-410).

Any failure → 403 with the precise reason; log it and emit `access_rejected` (these rejections are demo evidence: "no reservation → printer does not print").

## 4. Adapter interface

```ts
export interface Adapter {
  readonly kind: string;                       // "moonraker" | "smart_plug" | "manual_qr" | "simulator" | ...
  init(): Promise<void>;
  status(): Promise<DeviceStatus>;             // { online, locked, busy, details }
  lock(): Promise<void>;                       // make device unusable
  unlock(session: SessionContext): Promise<void>;   // allow use / start job
  readMetrics(): Promise<Record<string, bigint>>;   // cumulative counters, monotonic
  readGauges?(): Promise<Record<string, number>>;   // optional levels (temperature_c, fuel_level); never sent on chain raw (§4.6)
  runVerification(test: VerificationTest): Promise<VerificationOutcome>; // { passed, details, detailsHash }
  sessionDone(session: SessionContext): Promise<boolean>; // poll: has the use finished?
}
```

Every adapter has unit tests with a fake HTTP server (msw or nock) and one contract test (`adapter.contract.test.ts`) shared by all adapters.

### 4.1 `moonraker` (3D printer, Klipper)

- `unlock(session)`: upload job file with print=true (`POST /server/files/upload`, research E1). If no file (interactive session), just mark ready.
- `lock()`: printers are "locked" by the fact that only the bridge holds the API key and member-facing UIs are disabled or password-protected (research E5). Document exactly how in README.
- `readMetrics()`: from `GET /server/history/totals` → `job_totals {total_jobs, total_print_time, total_filament_used}` in seconds and mm (research E3) → `jobs_total`, `print_seconds`, `filament_used_mm` (the Restock rule `filament_spool`); `jobs_failed` from job history / `print_stats.state == error` (E2). `nozzle_seconds` = print_seconds since last nozzle change (simplest: `nozzle_seconds = print_seconds`; the on-chain rule baseline handles resets). E3 is from the Moonraker docs; in the demo the adapter reads it from the emulated Moonraker (§4.7), never a real printer (D-022).
- `runVerification({type: "calibration_print", file: "verify/calibration_cube.gcode", max_minutes})`: run print, wait for `complete` state without errors → passed. `detailsHash` = sha256 of the job record JSON.
- `sessionDone`: `print_stats.state in {complete, cancelled, error}`.

### 4.2 `octoprint` (fallback printer)

Same contract using OctoPrint REST (research E6).

### 4.3 `smart_plug` (any electric device)

- Vendors: `shelly_gen2` (RPC: `Switch.Set`, `Switch.GetStatus` → `apower`, `aenergy.total`), `shelly_gen1` (`/relay/0`, `/meter/0`), `tasmota` (`Power`, `Status 8`). Verify endpoints (research E7–E9).
- `lock()` = power off; `unlock()` = power on.
- `readMetrics()` → `energy_wh` (cumulative), `run_seconds` (seconds with power > `active_watts_threshold`), `cycles` (count of active→idle transitions lasting > `min_cycle_seconds`). Cycle detection runs in the bridge on a 1–5 s poll loop; persisted to `bridge/state/<asset>.json` so restarts keep counters monotonic.
- `sessionDone`: session timer elapsed, or (for cycle devices) a cycle ended.
- `runVerification({type: "power_profile", expect: {min_watts, max_watts, seconds}})` → passed if observed profile within bounds.
- Optional `temperature_c` gauge (community_fridge `temperature_check`) when the device exposes a temperature sensor. Research E7 verified only switch, power and energy fields, so no plug temperature read is claimed; in the demo the gauge comes from the emulator or the simulator, labelled simulation (D-022).
- **Safety:** a laser cutter is powered on only when a human is present. In the demo `laser-01` drives an emulated Shelly plug (§4.7), so nothing is energized (D-022). Enforced in config (D-408): a `dangerous` asset on a real adapter fails validation unless it has a labelled `stand_in` (copied into unlock events) or `human_present_confirmed: true`, which an operator sets only while a person is at the device and never commits.

### 4.4 `manual_qr` (no electronics)

- `unlock`: returns a one-time QR code the steward scans to hand over the item; `lock`: steward scans return QR.
- Metrics: `uses` only.

### 4.5 `simulator` (judges, CI, scenario 3+)

- Reads `scenarios/<asset_type>.yaml` (format D-401, zod-validated, `simulated: true` required): per-metric counter curves (`linear | step`, `idle_per_hour`), `type: gauge` metrics (D-410), session durations, verification defaults, failure injections (`session_error`, `verification_fail`, `offline`, `gauge_set`), and a time `speed` multiplier.
- Deterministic with a seed. Every simulated report also sends the metric `simulated = 1`, so on-chain telemetry and `telemetry_reported` events carry the label themselves (D-401); the bridge log says simulated too.
- `scripts/simulate.sh <asset_type>` runs, for any of the 12 profiles (PROFILES.md): start bridge in sim mode → reserve → access → session → a rule becomes due (Metric threshold crossed, Schedule interval passed, or a `report_fault` for Report rules) → agent opens the upkeep task → claim → submit (with expense + receipt hash for Restock/Repair) → verification → approve → rights → use right. Prints a summary with tx links, every line labelled simulation.

### 4.6 Gauges become counters (D-410)

`report_telemetry` accepts only monotonic counters (`E_TELEMETRY_NOT_MONOTONIC`). Levels that go up and down (`temperature_c`, `fuel_level`) come from `readGauges()` and are never sent raw. Per asset, config `gauges` derives counters on every telemetry tick: `samples_above` / `samples_below` a limit (× `telemetry_interval_sec` ≈ time out of range), `decrease_sum` (× `scale`) and `increase_count` (rises ≥ `min_step`, e.g. refills). The profiles use the derived names: community_fridge `temp_high_samples ≥ 6`, emergency_generator `fuel_used_dl ≥ 200`. Derived counters get the normal monotonic protection (D-406); state in `bridge/state/<asset>.gauges.json`. Live gauge values appear in bridge events and `/assets` only, so a live temperature display reads the bridge, not the chain.

### 4.7 Device emulators (D-022; in progress, the bridge engineer refines this section)

No physical device is used in the hackathon. To keep the real code paths, the production adapters (`moonraker`, `octoprint`, `smart_plug` for Shelly Gen2 / Gen1 / Tasmota, `manual_qr`) run unchanged against **device emulators**: local HTTP servers that implement only the documented API subset these adapters call (research E1–E9), with:

- the device state machine (Moonraker `print_stats.state` standby → printing → complete / cancelled / error; Shelly switch on/off),
- cumulative counters the adapters read (`history/totals` jobs, print time, filament mm; `aenergy.total` Wh, `apower` W),
- the same auth as the device (Moonraker `X-Api-Key`; Shelly digest auth if enabled),
- failure modes (offline, job error, failed calibration, wrong key) driven by the scenario file, deterministic with a seed.

The bridge config points the adapter's `base_url` at the emulator; nothing else changes. Every emulator response path, bridge log line, event and UI badge says SIMULATED / emulated device, and the `simulated = 1` metric goes on chain as for the simulator (D-401). The adapter tests run against the same emulators. Honest limit: an emulator follows the documentation, not a real device, so no claim is made about real Moonraker or Shelly firmware (§5).

## 5. Device-side lock assumptions (honest limits)

- No physical device was tested (D-022). The adapters were tested only against the emulators in §4.7; the points below describe a real installation.
- Physical bypass (unplug the smart plug, press the printer's own buttons) is possible. We state it.
- The bridge is trusted; if compromised it could fake telemetry. Telemetry alone never pays anyone; the DAO can revoke the bridge operator on the asset contract.

## 6. Ops

- `pnpm dev:bridge` (local), `pnpm start:bridge` (Pi). Systemd unit example in `bridge/deploy/`.
- Clock: bridge uses chain time (final block `timestamp_nanosec`, cached ≤ 5 s) for challenge expiry and session deadlines, not the local clock (D-405).
- Retries: on RPC errors, exponential backoff; contract panics with an `E_*` code are not retried, they are deterministic (D-410). Never re-send `mark_session_started` or `mark_session_finished` for the same reservation (view check first). Chain writes for one asset are serialized (D-405).
- Counters: `bridge/state/<asset>.counters.json` keeps the highest value per metric, applies an offset when a device counter goes backwards, and seeds its floor from `get_telemetry` at start (D-406).
