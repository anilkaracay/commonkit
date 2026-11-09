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

`dev` uses an **in-memory fake chain**: nothing is written to NEAR. Every log line, event and evidence
line is labelled `simulated: true`, and sim evidence goes to `state/sim/evidence/`, never to `evidence/`.
`chain: near` reads through `@commonkit/sdk`. Writes still need the bridge transaction signer (not built
yet); until then the NEAR client refuses every write.

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

## Scenario format (simulator)

YAML or JSON, validated with zod (`src/adapters/simulator/scenario.ts`). Examples: `test/fixtures/scenarios/`.

```yaml
scenario: washer            # id; also the simulator state key
simulated: true             # required, must be true
seed: 20261114              # deterministic jitter
speed: 60                   # simulated seconds per real second (adapter_config.speed overrides)
metrics:                    # <= 15 metrics; `simulated` is reserved
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

A metric's value at simulated time `t` is `initial + floor(idle_per_hour * t / 3600) + completed sessions + running session (linear only)`.
A session locked early adds its linear share but no step counters. Every report also carries the metric
`simulated = 1`, so the on-chain telemetry itself says it is simulated.

## Adapters

`src/adapters/types.ts` defines the interface. Every adapter must pass `test/adapter.contract.ts`
(`describeAdapterContract`). This build has `simulator` only. `moonraker`, `octoprint`, `smart_plug` and
`manual_qr` are accepted in config but fail at startup until they are implemented.

Safety: an asset with `safety.dangerous: true` and a real adapter does not load unless it has a
labelled `safety.stand_in` (shown in events) or `human_present_confirmed: true`, which an operator sets
only while a person is physically at the device.
