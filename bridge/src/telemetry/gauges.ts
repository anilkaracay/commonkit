import { join } from "node:path";
import { z } from "zod";
import { MAX_METRIC_NAME, type Gauges, type Metrics } from "../adapters/types.js";
import { readStateFile, safeName, writeStateFile } from "../util/state-file.js";

const counterName = z
  .string()
  .min(1)
  .max(MAX_METRIC_NAME)
  .regex(/^[a-z][a-z0-9_]*$/);

/**
 * How a gauge becomes a monotonic counter the contract accepts (D-410).
 * samples_above / samples_below count telemetry samples past a limit (x telemetry_interval_sec = time);
 * decrease_sum adds every drop (fuel used); increase_count counts rises of at least min_step (refills).
 */
export const gaugeDerivationSchema = z.discriminatedUnion("derive", [
  z.object({ derive: z.literal("samples_above"), limit: z.number(), counter: counterName }),
  z.object({ derive: z.literal("samples_below"), limit: z.number(), counter: counterName }),
  z.object({ derive: z.literal("decrease_sum"), counter: counterName, scale: z.number().positive().default(1) }),
  z.object({ derive: z.literal("increase_count"), counter: counterName, min_step: z.number().positive() }),
]);
export type GaugeDerivation = z.infer<typeof gaugeDerivationSchema>;
export const gaugesConfigSchema = z.record(counterName, z.array(gaugeDerivationSchema).min(1)).default({});

/** Validates adapter gauge output (device data). */
export const adapterGaugesSchema = z.record(counterName, z.number().finite());

const stateSchema = z.object({
  last: z.record(z.string(), z.number()),
  acc: z.record(z.string(), z.number().nonnegative()),
});

/** Per-asset gauge state, persisted in bridge/state/<asset>.gauges.json so restarts keep counting. */
export class GaugeTracker {
  private last: Record<string, number> = {};
  private acc: Record<string, number> = {};
  private live: Gauges | null = null;
  private readonly path: string;

  constructor(
    assetId: string,
    stateDir: string,
    private readonly config: Record<string, GaugeDerivation[]>,
  ) {
    this.path = join(stateDir, `${safeName(assetId)}.gauges.json`);
  }

  async load(): Promise<void> {
    const saved = await readStateFile(this.path, stateSchema);
    if (saved) {
      this.last = saved.last;
      this.acc = saved.acc;
    }
  }

  /** One telemetry sample: updates derived counters. Gauges without a derivation are only shown live. */
  async sample(raw: Gauges): Promise<Metrics> {
    const parsed = adapterGaugesSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`adapter returned invalid gauges: ${parsed.error.message}`);
    this.live = parsed.data;
    for (const [gauge, rules] of Object.entries(this.config)) {
      const v = parsed.data[gauge];
      if (v === undefined) continue;
      const prev = this.last[gauge];
      for (const r of rules) {
        const a = this.acc[r.counter] ?? 0;
        if (r.derive === "samples_above" && v > r.limit) this.acc[r.counter] = a + 1;
        else if (r.derive === "samples_below" && v < r.limit) this.acc[r.counter] = a + 1;
        else if (r.derive === "decrease_sum" && prev !== undefined && v < prev) this.acc[r.counter] = a + (prev - v) * r.scale;
        else if (r.derive === "increase_count" && prev !== undefined && v - prev >= r.min_step) this.acc[r.counter] = a + 1;
        else this.acc[r.counter] = a;
      }
      this.last[gauge] = v;
    }
    await writeStateFile(this.path, { last: this.last, acc: this.acc });
    return this.counters();
  }

  /** Current derived counters without taking a sample. */
  counters(): Metrics {
    const out: Metrics = {};
    for (const rules of Object.values(this.config)) {
      for (const r of rules) out[r.counter] = BigInt(Math.floor(this.acc[r.counter] ?? 0));
    }
    return out;
  }

  /** Last gauge values seen (for /assets and events). */
  liveValues(): Gauges | null {
    return this.live;
  }
}
