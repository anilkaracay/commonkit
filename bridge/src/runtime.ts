import type { Logger } from "pino";
import type { Adapter } from "./adapters/types.js";
import type { AssetConfig } from "./config.js";
import type { CounterStore } from "./telemetry/counters.js";
import type { GaugeTracker } from "./telemetry/gauges.js";

/** What occupies a device right now. One use at a time per asset. */
export type Occupancy = { kind: "session"; sessionId: string } | { kind: "verification"; runId: string } | null;

export interface AssetRuntime {
  config: AssetConfig;
  adapter: Adapter;
  counters: CounterStore;
  gauges: GaugeTracker;
  /** true if the device is simulated or the chain is the in-memory fake. */
  simulated: boolean;
  /** Child logger bound to { asset_id, simulated }, so every line about this asset is labelled. */
  logger: Logger;
  occupancy: Occupancy;
}
