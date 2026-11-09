/**
 * The agent's small local memory. Chain state is always the source of truth; this only holds
 * what the chain cannot tell us:
 * - writes whose outcome is unknown (D-601): the same write is held back until the chain says the
 *   transaction can no longer land;
 * - tasks already annotated (annotations are event-only, so they cannot be read back);
 * - when each escalation was last synced (throttle);
 * - the last reported skip reason per key (so a waiting rule does not spam the feed).
 * Optionally persisted as JSON (agent/state/, gitignored) so a restart keeps the write holds.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import type { AgentChain, WriteRef } from "./chain/types.js";

const fileSchema = z.object({
  pending: z.record(
    z.string(),
    z.object({ method: z.string(), txHash: z.string().nullable(), nonce: z.string().nullable(), sentAtMs: z.number() }),
  ),
  annotated: z.array(z.string()),
  lastSyncMs: z.record(z.string(), z.number()),
});

export class AgentMemory {
  private readonly pending = new Map<string, WriteRef>();
  private readonly annotated = new Set<string>();
  private readonly lastSyncMs = new Map<string, number>();
  private readonly lastSkip = new Map<string, string>();

  constructor(private readonly file: string | null = null) {
    if (!file) return;
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      return;
    }
    const parsed = fileSchema.parse(JSON.parse(raw));
    for (const [k, v] of Object.entries(parsed.pending))
      this.pending.set(k, { ...v, nonce: v.nonce === null ? null : BigInt(v.nonce) });
    for (const k of parsed.annotated) this.annotated.add(k);
    for (const [k, v] of Object.entries(parsed.lastSyncMs)) this.lastSyncMs.set(k, v);
  }

  /** True while an earlier attempt of this write may still land. Clears the hold once settled. */
  async isHeld(key: string, chain: AgentChain): Promise<boolean> {
    const ref = this.pending.get(key);
    if (!ref) return false;
    if (!(await chain.isWriteSettled(ref))) return true;
    this.pending.delete(key);
    this.save();
    return false;
  }

  hold(key: string, ref: WriteRef): void {
    this.pending.set(key, ref);
    this.save();
  }

  heldKeys(): string[] {
    return [...this.pending.keys()];
  }

  wasAnnotated(key: string): boolean {
    return this.annotated.has(key);
  }

  markAnnotated(key: string): void {
    this.annotated.add(key);
    this.save();
  }

  syncDue(key: string, nowMs: number, everyMs: number): boolean {
    const last = this.lastSyncMs.get(key);
    return last === undefined || nowMs - last >= everyMs;
  }

  markSynced(key: string, nowMs: number): void {
    this.lastSyncMs.set(key, nowMs);
    this.save();
  }

  /** Returns true when `reason` differs from the last one recorded for `key` (emit then). */
  skipChanged(key: string, reason: string): boolean {
    if (this.lastSkip.get(key) === reason) return false;
    this.lastSkip.set(key, reason);
    return true;
  }

  clearSkip(key: string): void {
    this.lastSkip.delete(key);
  }

  private save(): void {
    if (!this.file) return;
    const data = {
      pending: Object.fromEntries(
        [...this.pending].map(([k, v]) => [k, { ...v, nonce: v.nonce === null ? null : v.nonce.toString() }]),
      ),
      annotated: [...this.annotated],
      lastSyncMs: Object.fromEntries(this.lastSyncMs),
    };
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, this.file);
  }
}
