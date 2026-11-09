/**
 * Agent event stream: one JSON log line, one JSONL evidence line and one SSE message per event.
 * The event shape is the bridge's (`bridge/src/events/bus.ts` BridgeEvent) so the web live panel
 * reads both feeds with one decoder.
 */
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface AgentEvent {
  seq: number;
  /** Wall-clock time of the agent host (informational only). */
  at: string;
  /** Chain time (ns, decimal string) when known. */
  chain_time_ns: string | null;
  type: string;
  asset_id: string | null;
  /** true for every event about a simulated asset or produced against the fake chain. */
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

export type LogSink = (line: string) => void;

/** Appends events to `<dir>/agent-<UTC date>.jsonl`; writes are serialised. */
export class EvidenceLog {
  private tail: Promise<void> = Promise.resolve();
  constructor(
    private readonly dir: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  append(event: AgentEvent): void {
    const file = join(this.dir, `agent-${new Date(this.now()).toISOString().slice(0, 10)}.jsonl`);
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

type Listener = (e: AgentEvent) => void;

export class EventBus {
  private seq = 0;
  private readonly recent: AgentEvent[] = [];
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly log: LogSink | null = (line) => process.stdout.write(line + "\n"),
    private readonly evidence: EvidenceLog | null = null,
    private readonly now: () => number = () => Date.now(),
    private readonly keep = 200,
  ) {}

  emit(input: EmitInput): AgentEvent {
    const event: AgentEvent = {
      seq: ++this.seq,
      at: new Date(this.now()).toISOString(),
      chain_time_ns: input.chainNs != null ? input.chainNs.toString() : null,
      type: input.type,
      asset_id: input.assetId,
      simulated: input.simulated,
      data: JSON.parse(toJson(input.data ?? {})) as Record<string, unknown>,
    };
    this.recent.push(event);
    if (this.recent.length > this.keep) this.recent.shift();
    this.evidence?.append(event);
    this.log?.(toJson({ level: input.level ?? "info", time: event.at, msg: event.type, ...event }));
    for (const l of this.listeners) l(event);
    return event;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  history(): readonly AgentEvent[] {
    return this.recent;
  }

  async flush(): Promise<void> {
    await this.evidence?.flush();
  }
}
