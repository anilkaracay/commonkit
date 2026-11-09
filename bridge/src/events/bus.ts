import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "pino";
import { simulatedField } from "../util/log.js";

export interface BridgeEvent {
  seq: number;
  /** Wall-clock time of the bridge host (informational only). */
  at: string;
  /** Chain time (ns, decimal string) when known; this is the time used for window checks. */
  chain_time_ns: string | null;
  type: string;
  asset_id: string | null;
  /** true for every event produced by a simulated device or the fake chain. */
  simulated: boolean;
  data: Record<string, unknown>;
}

export interface EmitInput {
  type: string;
  assetId: string | null;
  simulated: boolean;
  data?: Record<string, unknown>;
  chainNs?: bigint | null;
  level?: "info" | "warn" | "error";
}

/** JSON with bigint as decimal strings. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
}

function plain(data: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(toJson(data)) as Record<string, unknown>;
}

/**
 * Appends events to `<dir>/bridge-<UTC date>.jsonl`. Writes are serialised so lines never interleave.
 */
export class EvidenceLog {
  private tail: Promise<void> = Promise.resolve();
  constructor(
    private readonly dir: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  append(event: BridgeEvent): void {
    const file = join(this.dir, `bridge-${new Date(this.now()).toISOString().slice(0, 10)}.jsonl`);
    this.tail = this.tail
      .then(async () => {
        await mkdir(this.dir, { recursive: true });
        await appendFile(file, toJson(event) + "\n", "utf8");
      })
      .catch(() => undefined);
  }

  flush(): Promise<void> {
    return this.tail;
  }
}

type Listener = (e: BridgeEvent) => void;

/**
 * One stream for everything the bridge does: structured log line + evidence line + SSE.
 */
export class EventBus {
  private seq = 0;
  private readonly recent: BridgeEvent[] = [];
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly logger: Logger,
    private readonly evidence: EvidenceLog | null,
    private readonly now: () => number = () => Date.now(),
    private readonly keep = 200,
  ) {}

  emit(input: EmitInput): BridgeEvent {
    const event: BridgeEvent = {
      seq: ++this.seq,
      at: new Date(this.now()).toISOString(),
      chain_time_ns: input.chainNs != null ? input.chainNs.toString() : null,
      type: input.type,
      asset_id: input.assetId,
      simulated: input.simulated,
      data: plain(input.data ?? {}),
    };
    this.recent.push(event);
    if (this.recent.length > this.keep) this.recent.shift();
    this.evidence?.append(event);
    this.logger[input.level ?? "info"](
      { event: event.type, seq: event.seq, asset_id: event.asset_id, ...simulatedField(this.logger, event.simulated), data: event.data },
      event.type,
    );
    for (const l of this.listeners) l(event);
    return event;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  history(): readonly BridgeEvent[] {
    return this.recent;
  }

  async flush(): Promise<void> {
    await this.evidence?.flush();
  }
}
