import { z } from "zod";
import type { Logger } from "pino";
import type { LocalClock } from "../util/clock.js";

/** Live device state as reported by the adapter. */
export interface DeviceStatus {
  online: boolean;
  /** true = the device cannot be used by a member right now. */
  locked: boolean;
  /** true = a use (session, verification run) is in progress. */
  busy: boolean;
  details: Record<string, unknown>;
}

/** What an adapter knows about the session it is unlocking for. */
export interface SessionContext {
  sessionId: string;
  assetId: string;
  reservationId: bigint;
  accountId: string;
  /** Chain time (ns) at which the bridge granted access. */
  grantedAtChainNs: bigint;
  /** Optional job file (moonraker/octoprint). Not used by the simulator. */
  jobFile?: { name: string; path: string };
}

/** Verification tests a profile rule can require. Validated from bridge config. */
export const verificationTestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("calibration_print"),
    file: z.string().min(1),
    max_minutes: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("power_profile"),
    expect: z.object({
      min_watts: z.number().nonnegative(),
      max_watts: z.number().positive(),
      seconds: z.number().int().positive(),
    }),
  }),
  z.object({
    type: z.literal("simulated"),
    /** Simulated seconds the test takes (scaled by the simulator speed). */
    duration_sec: z.number().int().positive().optional(),
  }),
]);
export type VerificationTest = z.infer<typeof verificationTestSchema>;

export interface VerificationOutcome {
  passed: boolean;
  details: Record<string, unknown>;
  /** Lowercase hex sha256 of the canonical JSON of `details`. Reported on-chain. */
  detailsHash: string;
}

/** Cumulative counters, monotonic per metric for a given device lifetime. */
export type Metrics = Record<string, bigint>;

/** Contract limits for telemetry (CONTRACT_SPEC §3.3). */
export const MAX_METRICS = 16;
export const MAX_METRIC_NAME = 32;

/**
 * Shared adapter interface (BRIDGE_AND_ADAPTERS §4). Every adapter must pass
 * test/adapter.contract.ts. Adapters must start locked after init() (fail closed).
 */
export interface Adapter {
  readonly kind: string;
  /** true for the simulator; propagates the `simulated` label to logs, events, telemetry. */
  readonly simulated: boolean;
  init(): Promise<void>;
  status(): Promise<DeviceStatus>;
  lock(): Promise<void>;
  unlock(session: SessionContext): Promise<void>;
  readMetrics(): Promise<Metrics>;
  runVerification(test: VerificationTest): Promise<VerificationOutcome>;
  sessionDone(session: SessionContext): Promise<boolean>;
  close?(): Promise<void>;
}

/** Everything an adapter may use from the bridge. */
export interface AdapterContext {
  assetId: string;
  /** Directory for adapter-private persistent state (bridge/state). */
  stateDir: string;
  clock: LocalClock;
  logger: Logger;
  /** Base directory used to resolve relative paths in adapter_config. */
  configDir: string;
}

export class AdapterOfflineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterOfflineError";
  }
}
