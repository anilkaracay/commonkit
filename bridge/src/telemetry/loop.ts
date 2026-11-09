import { AdapterOfflineError } from "../adapters/types.js";
import { readCounters } from "./read.js";
import type { ChainClient } from "../chain/types.js";
import { ChainError } from "../chain/types.js";
import type { EventBus } from "../events/bus.js";
import type { AssetRuntime } from "../runtime.js";
import type { KeyedMutex } from "../util/mutex.js";

export type TickResult = "reported" | "unchanged" | "offline" | "failed";

/**
 * Reads device counters, keeps them monotonic (CounterStore) and reports changes with
 * report_telemetry. Writes for one asset are serialised with session finishes (chainMutex),
 * so the chain never sees a lower value after a higher one.
 */
export class TelemetryLoop {
  private readonly offline = new Set<string>();

  constructor(
    private readonly assets: Map<string, AssetRuntime>,
    private readonly chain: ChainClient,
    private readonly bus: EventBus,
    private readonly chainMutex: KeyedMutex,
  ) {}

  async tickOnce(assetId: string): Promise<TickResult> {
    const rt = this.assets.get(assetId);
    if (!rt) throw new Error(`unknown asset ${assetId}`);
    const emit = (type: string, data: Record<string, unknown>, level: "info" | "warn" | "error" = "info") =>
      this.bus.emit({ type, assetId, simulated: rt.simulated, data, level });

    return this.chainMutex.run(assetId, async () => {
      let applied;
      try {
        applied = await readCounters(rt, { sample: true });
      } catch (err) {
        if (err instanceof AdapterOfflineError) {
          if (!this.offline.has(assetId)) emit("telemetry_skipped", { reason: "offline", error: err.message }, "warn");
          this.offline.add(assetId);
          return "offline";
        }
        emit("telemetry_failed", { error: (err as Error).message }, "error");
        return "failed";
      }
      if (this.offline.delete(assetId)) emit("device_online", {});
      for (const a of applied.adjustments) {
        emit("counter_offset_applied", { metric: a.metric, raw: a.raw, previous: a.previous, offset: a.newOffset }, "warn");
      }
      if (!rt.counters.differsFromReported(applied.metrics)) return "unchanged";
      try {
        const { txHash } = await this.chain.reportTelemetry(assetId, applied.metrics, { simulated: rt.simulated });
        await rt.counters.markReported(applied.metrics);
        emit("telemetry_reported", { metrics: applied.metrics, gauges: applied.gauges, tx: txHash });
        return "reported";
      } catch (err) {
        if (err instanceof ChainError && err.code === "E_TELEMETRY_NOT_MONOTONIC") {
          // The chain holds higher values than this bridge (state lost): adopt them, next tick catches up.
          const onChain = await this.chain.getTelemetry(assetId).catch(() => null);
          if (onChain) await rt.counters.seedFromChain(onChain.metrics);
        }
        emit("telemetry_failed", { error: (err as Error).message, code: err instanceof ChainError ? err.code : null }, "warn");
        return "failed";
      }
    });
  }
}
