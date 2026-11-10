import type { Gauges, Metrics } from "../adapters/types.js";
import type { AssetRuntime } from "../runtime.js";
import type { CounterAdjustment } from "./counters.js";

export interface Reading {
  metrics: Metrics;
  gauges: Gauges | null;
  adjustments: CounterAdjustment[];
}

/**
 * Reads device counters (+ gauge-derived counters) and makes them monotonic. `sample: true` takes a
 * gauge sample (telemetry ticks only, so sample counts follow telemetry_interval_sec); otherwise the
 * current derived counters are used as they are.
 */
export async function readCounters(rt: AssetRuntime, opts: { sample: boolean }): Promise<Reading> {
  const raw = await rt.adapter.readMetrics();
  let gauges: Gauges | null = null;
  let derived: Metrics = rt.gauges.counters();
  if (opts.sample && rt.adapter.readGauges) {
    gauges = await rt.adapter.readGauges();
    derived = await rt.gauges.sample(gauges);
  }
  for (const name of Object.keys(derived)) {
    if (name in raw) throw new Error(`derived counter ${name} collides with a device metric`);
  }
  // Every simulated asset (simulator, emulated device, fake chain) carries `simulated = 1` on chain (D-401).
  const label: Metrics = rt.simulated && raw.simulated === undefined ? { simulated: 1n } : {};
  const { metrics, adjustments } = await rt.counters.apply({ ...raw, ...derived, ...label });
  return { metrics, gauges, adjustments };
}
