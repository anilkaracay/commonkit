import { join } from "node:path";
import { z } from "zod";
import { MAX_METRICS, MAX_METRIC_NAME, type Metrics } from "../adapters/types.js";
import { readStateFile, safeName, writeStateFile } from "../util/state-file.js";

const bigintString = z.string().regex(/^\d+$/).transform((s) => BigInt(s));
const metricsRecord = z.record(z.string(), bigintString);

const fileSchema = z.object({
  asset_id: z.string(),
  /** Added to the raw device value so the series never decreases (device reset, state loss). */
  offsets: metricsRecord,
  /** Highest value ever produced for each metric. */
  last: metricsRecord,
  /** Values in the last successful chain write. */
  reported: metricsRecord.nullable(),
});

/** Validates adapter output before it can reach the chain (zod on device data). */
export const adapterMetricsSchema = z
  .record(
    z.string().min(1).max(MAX_METRIC_NAME).regex(/^[a-z][a-z0-9_]*$/),
    z.bigint().nonnegative().max(BigInt(Number.MAX_SAFE_INTEGER)),
  )
  .refine((m) => Object.keys(m).length <= MAX_METRICS, `at most ${MAX_METRICS} metrics`);

export interface CounterAdjustment {
  metric: string;
  raw: bigint;
  previous: bigint;
  newOffset: bigint;
}

function serialize(m: Metrics): Record<string, string> {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.toString()]));
}

/**
 * Per-asset monotonic counters, persisted in bridge/state/<asset>.counters.json.
 * If a device counter goes backwards (power loss, firmware reset, simulator state wiped)
 * the store raises an offset so the reported series stays monotonic, as the contract requires.
 */
export class CounterStore {
  private offsets: Metrics = {};
  private last: Metrics = {};
  private reported: Metrics | null = null;
  private readonly path: string;

  constructor(
    private readonly assetId: string,
    stateDir: string,
  ) {
    this.path = join(stateDir, `${safeName(assetId)}.counters.json`);
  }

  async load(): Promise<void> {
    const saved = await readStateFile(this.path, fileSchema);
    if (saved) {
      this.offsets = saved.offsets;
      this.last = saved.last;
      this.reported = saved.reported;
    }
  }

  /** Never lets the local series start below what the chain already holds. */
  async seedFromChain(chainMetrics: Metrics): Promise<void> {
    let changed = false;
    for (const [m, v] of Object.entries(chainMetrics)) {
      if ((this.last[m] ?? -1n) < v) {
        this.last[m] = v;
        changed = true;
      }
    }
    if (changed) await this.persist();
  }

  /** Applies offsets to raw device values; returns monotonic values and any adjustments made. */
  async apply(raw: Metrics): Promise<{ metrics: Metrics; adjustments: CounterAdjustment[] }> {
    const parsed = adapterMetricsSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`adapter returned invalid metrics: ${parsed.error.message}`);
    const out: Metrics = {};
    const adjustments: CounterAdjustment[] = [];
    let changed = false;
    for (const [m, rawValue] of Object.entries(parsed.data)) {
      let offset = this.offsets[m] ?? 0n;
      let value = rawValue + offset;
      const previous = this.last[m];
      if (previous !== undefined && value < previous) {
        offset += previous - value;
        value = previous;
        this.offsets[m] = offset;
        adjustments.push({ metric: m, raw: rawValue, previous, newOffset: offset });
        changed = true;
      }
      if (previous === undefined || value > previous) {
        this.last[m] = value;
        changed = true;
      }
      out[m] = value;
    }
    if (changed) await this.persist();
    return { metrics: out, adjustments };
  }

  /** true if any metric differs from the last successful chain write. */
  differsFromReported(m: Metrics): boolean {
    if (!this.reported) return true;
    return Object.entries(m).some(([k, v]) => this.reported?.[k] !== v);
  }

  async markReported(m: Metrics): Promise<void> {
    this.reported = { ...this.reported, ...m };
    await this.persist();
  }

  snapshot(): { last: Metrics; reported: Metrics | null } {
    return { last: { ...this.last }, reported: this.reported ? { ...this.reported } : null };
  }

  private async persist(): Promise<void> {
    await writeStateFile(this.path, {
      asset_id: this.assetId,
      offsets: serialize(this.offsets),
      last: serialize(this.last),
      reported: this.reported ? serialize(this.reported) : null,
    });
  }
}
