# BRIDGE_AND_ADAPTERS

The bridge is a small TypeScript service that runs next to the devices (Raspberry Pi or a laptop on the same LAN). It is the **only** thing that can talk to the device APIs and the **only** account allowed to report sessions and telemetry to the asset contracts.

## 1. Responsibilities

1. Verify member access requests (NEP-413 signed messages).
2. Ask the asset contract `can_access(account, reservation_id)` (view).
3. Unlock / start the device through its adapter; call `mark_session_started`.
4. Watch the session; lock the device at the end or at timeout; call `mark_session_finished(metrics)`.
5. Periodically read device metrics and call `report_telemetry`.
6. Run the profile's verification test after maintenance submission; call `submit_verification_result`.
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

**One bridge account, one function-call key per asset contract** (a NEAR function-call key is bound to one receiver contract). The bridge keeps a key per asset in env (`BRIDGE_KEY_<ASSET_ALIAS>`), all for the same bridge account. Allowed methods: `mark_session_started, mark_session_finished, report_telemetry, submit_verification_result`.

## 3. HTTP API (Fastify, zod-validated)

| Method | Path | Body | Result |
| :--- | :--- | :--- | :--- |
| GET | `/health` | — | adapters status |
| GET | `/assets` | — | configured assets + live device state |
| POST | `/access/challenge` | `{asset_id, reservation_id, account_id}` | `{nonce (32 bytes b64), message, recipient: "commonkit-bridge:<bridge_account>", expires_at}` |
| POST | `/access` | `{asset_id, reservation_id, account_id, public_key, signature, nonce, message}` + optional multipart job file | `{ok, session_id, reason?}` |
| POST | `/sessions/:id/finish` | signed like `/access` (holder can end early) | `{ok}` |
| POST | `/verification/:asset/:task_id/run` | signed by the task claimer | runs verification test, reports result |
| GET | `/events` | — | Server-Sent Events of bridge actions (for the live demo screen) |

### 3.1 NEP-413 verification (must all pass)

1. `nonce` was issued by `/access/challenge`, unused, not expired (5 min); mark used.
2. `recipient` equals our recipient string; `message` equals the issued message (contains asset, reservation id, nonce, expiry).
3. Signature valid for the NEP-413 payload (borsh-serialized per the NEP — use a vetted library or implement exactly per spec; add test vectors).
4. `public_key` is a current access key of `account_id` (RPC `view_access_key`). Full-access or function-call key both accepted (record which).
5. `can_access(account_id, reservation_id).ok == true`.

Any failure → 403 with the precise reason; log it (these rejections are demo evidence: "no reservation → printer does not print").

## 4. Adapter interface

```ts
export interface Adapter {
  readonly kind: string;                       // "moonraker" | "smart_plug" | "manual_qr" | "simulator" | ...
  init(): Promise<void>;
  status(): Promise<DeviceStatus>;             // { online, locked, busy, details }
  lock(): Promise<void>;                       // make device unusable
  unlock(session: SessionContext): Promise<void>;   // allow use / start job
  readMetrics(): Promise<Record<string, bigint>>;   // cumulative counters, monotonic
  runVerification(test: VerificationTest): Promise<VerificationOutcome>; // { passed, details, detailsHash }
  sessionDone(session: SessionContext): Promise<boolean>; // poll: has the use finished?
}
```

Every adapter has unit tests with a fake HTTP server (msw or nock) and one contract test (`adapter.contract.test.ts`) shared by all adapters.

### 4.1 `moonraker` (3D printer, Klipper)

- `unlock(session)`: upload job file with print=true (`POST /server/files/upload`, research E1). If no file (interactive session), just mark ready.
- `lock()`: printers are "locked" by the fact that only the bridge holds the API key and member-facing UIs are disabled or password-protected (research E5). Document exactly how in README.
- `readMetrics()`: from `GET /server/history/totals` and `print_stats` → `print_seconds`, `jobs_total`, `jobs_failed`; `nozzle_seconds` = print_seconds since last nozzle change (we track the nozzle epoch locally and in-chain via baselines; simplest: `nozzle_seconds = print_seconds`, the rule baseline handles resets).
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
- **Safety:** a laser cutter is powered on only when a human is present; the demo can use a soldering station or lamp as the stand-in and must label it.

### 4.4 `manual_qr` (no electronics)

- `unlock`: returns a one-time QR code the steward scans to hand over the item; `lock`: steward scans return QR.
- Metrics: `uses` only.

### 4.5 `simulator` (judges, CI, scenario 3+)

- Reads `scenarios/<name>.yaml`: metric curves, cycle durations, failure injections, and a time `speed` multiplier.
- Deterministic with a seed. Every simulated metric report carries `simulated: true` in the bridge log, and the asset profile `adapter` is `simulator` so the web UI labels it.
- `scripts/simulate.sh <scenario>` runs: start bridge in sim mode → reserve → access → session → telemetry crosses threshold → agent opens task → claim → submit → verification → approve → rights → use right. Prints a summary with tx links.

## 5. Device-side lock assumptions (honest limits)

- Physical bypass (unplug the smart plug, press the printer's own buttons) is possible. We state it.
- The bridge is trusted; if compromised it could fake telemetry. Telemetry alone never pays anyone; the DAO can revoke the bridge operator on the asset contract.

## 6. Ops

- `pnpm dev:bridge` (local), `pnpm start:bridge` (Pi). Systemd unit example in `bridge/deploy/`.
- Clock: bridge uses chain time from the latest block for window checks, not the local clock.
- Retries: on RPC errors, exponential backoff; never re-send `mark_session_started` for the same reservation (idempotency check via view first).
