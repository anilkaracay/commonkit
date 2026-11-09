import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import type { Metrics, SessionContext } from "../adapters/types.js";
import type { ChainClock } from "../chain/clock.js";
import { ChainError, isRetryableChainError, type AccessKeyPermission, type ChainClient } from "../chain/types.js";
import { BridgeError } from "../errors.js";
import type { EventBus } from "../events/bus.js";
import type { AssetRuntime } from "../runtime.js";
import type { LocalClock } from "../util/clock.js";
import type { KeyedMutex } from "../util/mutex.js";
import { NS_PER_SEC } from "../util/near.js";
import { readCounters } from "../telemetry/read.js";
import { withRetry } from "../util/retry.js";
import { readStateFile, writeStateFile } from "../util/state-file.js";

export type SessionStatus = "active" | "finishing" | "finished";
export type FinishReason = "device_done" | "timeout" | "holder" | "operator";

export interface Session {
  id: string;
  assetId: string;
  reservationId: bigint;
  accountId: string;
  publicKey: string;
  keyPermission: AccessKeyPermission["kind"];
  startedAtChainNs: bigint;
  deadlineChainNs: bigint;
  status: SessionStatus;
  finishReason: FinishReason | null;
  startTx: string | null;
  finishTx: string | null;
  metricsAtStart: Metrics | null;
  metricsAtEnd: Metrics | null;
}

const big = z.string().regex(/^\d+$/).transform((s) => BigInt(s));
const metricsSchema = z.record(z.string(), big).nullable();
const sessionFileSchema = z.object({
  sessions: z.array(
    z.object({
      id: z.string(),
      assetId: z.string(),
      reservationId: big,
      accountId: z.string(),
      publicKey: z.string(),
      keyPermission: z.enum(["full_access", "function_call"]),
      startedAtChainNs: big,
      deadlineChainNs: big,
      status: z.enum(["active", "finishing", "finished"]),
      finishReason: z.enum(["device_done", "timeout", "holder", "operator"]).nullable(),
      startTx: z.string().nullable(),
      finishTx: z.string().nullable(),
      metricsAtStart: metricsSchema,
      metricsAtEnd: metricsSchema,
    }),
  ),
});

export interface SessionManagerDeps {
  assets: Map<string, AssetRuntime>;
  chain: ChainClient;
  chainClock: ChainClock;
  localClock: LocalClock;
  bus: EventBus;
  chainMutex: KeyedMutex;
  stateDir: string;
  retry?: { attempts: number; baseDelayMs: number };
}

export interface StartRequest {
  assetId: string;
  reservationId: bigint;
  accountId: string;
  publicKey: string;
  keyPermission: AccessKeyPermission;
}

/**
 * Session lifecycle: chain start -> unlock -> watch -> lock -> chain finish.
 * The chain records the start before the device unlocks (fail closed, D-404).
 * Sessions are persisted so a restarted bridge keeps watching and finishing them.
 */
export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly finishing = new Set<string>();
  private readonly path: string;
  private readonly retry: { attempts: number; baseDelayMs: number };

  constructor(private readonly d: SessionManagerDeps) {
    this.path = join(d.stateDir, "sessions.json");
    this.retry = d.retry ?? { attempts: 4, baseDelayMs: 500 };
  }

  async load(): Promise<void> {
    const saved = await readStateFile(this.path, sessionFileSchema);
    for (const s of saved?.sessions ?? []) {
      this.sessions.set(s.id, s);
      const rt = this.d.assets.get(s.assetId);
      if (rt && s.status !== "finished") rt.occupancy = { kind: "session", sessionId: s.id };
    }
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  list(): Session[] {
    return [...this.sessions.values()];
  }

  activeFor(assetId: string): Session | undefined {
    return this.list().find((s) => s.assetId === assetId && s.status === "active");
  }

  async start(req: StartRequest): Promise<{ session: Session; resumed: boolean }> {
    const rt = this.runtime(req.assetId);
    const existing = this.list().find(
      (s) => s.assetId === req.assetId && s.reservationId === req.reservationId && s.status === "active",
    );
    if (existing) {
      // Resumption (can_access allows InSession): make sure the device is unlocked again.
      await this.unlockOrThrow(rt, existing);
      return { session: existing, resumed: true };
    }
    if (rt.occupancy) {
      throw new BridgeError(409, "DEVICE_BUSY", `device is busy (${rt.occupancy.kind})`);
    }
    // Claim the device synchronously, before any await, so concurrent requests cannot both pass.
    const id = randomUUID();
    rt.occupancy = { kind: "session", sessionId: id };
    try {
      return await this.startClaimed(rt, req, id);
    } catch (err) {
      if (rt.occupancy?.kind === "session" && rt.occupancy.sessionId === id && !this.sessions.has(id)) {
        rt.occupancy = null;
      }
      throw err;
    }
  }

  private async startClaimed(rt: AssetRuntime, req: StartRequest, id: string): Promise<{ session: Session; resumed: boolean }> {
    const status = await rt.adapter.status().catch((err: unknown) => {
      throw new BridgeError(503, "DEVICE_ERROR", (err as Error).message);
    });
    if (!status.online) throw new BridgeError(503, "DEVICE_OFFLINE", "device is offline");

    const now = await this.d.chainClock.now();
    const session: Session = {
      id,
      assetId: req.assetId,
      reservationId: req.reservationId,
      accountId: req.accountId,
      publicKey: req.publicKey,
      keyPermission: req.keyPermission.kind,
      startedAtChainNs: now,
      deadlineChainNs: now + BigInt(rt.config.session_timeout_min) * 60n * NS_PER_SEC,
      status: "active",
      finishReason: null,
      startTx: null,
      finishTx: null,
      metricsAtStart: null,
      metricsAtEnd: null,
    };
    try {
      session.startTx = await this.chainStart(rt, session);
    } catch (err) {
      const code = err instanceof ChainError ? err.code : null;
      this.emit(rt, "session_start_failed", { reservation_id: req.reservationId, code, error: (err as Error).message }, "error");
      if (code === "E_OUT_OF_SERVICE") {
        throw new BridgeError(403, "OUT_OF_SERVICE", "the asset went out of service; the device stays locked");
      }
      throw new BridgeError(502, "CHAIN_WRITE_FAILED", `mark_session_started failed: ${(err as Error).message}`);
    }
    session.metricsAtStart = await this.readMetricsSafe(rt);
    this.sessions.set(session.id, session);
    await this.persist();
    this.emit(rt, "session_started", {
      session_id: session.id,
      reservation_id: session.reservationId,
      account_id: session.accountId,
      key_permission: session.keyPermission,
      tx: session.startTx,
      deadline_chain_ns: session.deadlineChainNs,
    });
    await this.unlockOrThrow(rt, session);
    return { session, resumed: false };
  }

  /** Holder ends the session early. */
  async finishByHolder(sessionId: string, accountId: string): Promise<Session> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new BridgeError(404, "SESSION_NOT_FOUND", sessionId);
    if (s.accountId !== accountId) throw new BridgeError(403, "NOT_SESSION_HOLDER", "only the holder can end the session");
    if (s.status === "active") await this.finish(s, "holder");
    return s;
  }

  /** One watcher pass: finish sessions whose device is done or whose deadline (chain time) passed. */
  async pollOnce(): Promise<void> {
    for (const s of this.list()) {
      if (s.status === "finishing") {
        await this.chainFinish(this.runtime(s.assetId), s);
        continue;
      }
      if (s.status !== "active") continue;
      const rt = this.runtime(s.assetId);
      const done = await rt.adapter.sessionDone(this.context(s)).catch(() => false);
      if (done) {
        await this.finish(s, "device_done");
        continue;
      }
      const now = await this.d.chainClock.now().catch(() => null);
      if (now !== null && now >= s.deadlineChainNs) await this.finish(s, "timeout");
    }
  }

  private async finish(s: Session, reason: FinishReason): Promise<void> {
    const rt = this.runtime(s.assetId);
    if (s.status !== "active") return; // holder and watcher may race; first one wins
    s.status = "finishing";
    s.finishReason = reason;
    await this.persist();
    try {
      await rt.adapter.lock();
      this.emit(rt, "device_locked", { session_id: s.id, reason });
    } catch (err) {
      this.emit(rt, "device_lock_failed", { session_id: s.id, error: (err as Error).message }, "error");
    }
    if (rt.occupancy?.kind === "session" && rt.occupancy.sessionId === s.id) rt.occupancy = null;
    await this.chainFinish(rt, s);
  }

  private async chainFinish(rt: AssetRuntime, s: Session): Promise<void> {
    if (this.finishing.has(s.id)) return;
    this.finishing.add(s.id);
    try {
      await this.chainFinishOnce(rt, s);
    } finally {
      this.finishing.delete(s.id);
    }
  }

  private async chainFinishOnce(rt: AssetRuntime, s: Session): Promise<void> {
    const metrics = (await this.readMetricsSafe(rt)) ?? rt.counters.snapshot().last;
    try {
      const tx = await this.d.chainMutex.run(s.assetId, () =>
        withRetry(
          async () => {
            const view = await this.d.chain.getReservation(s.assetId, s.reservationId);
            if (view && view.status !== "InSession") return null; // already finished on chain: never re-send
            return (await this.d.chain.markSessionFinished(s.assetId, s.reservationId, metrics, { simulated: rt.simulated }))
              .txHash;
          },
          { ...this.retry, clock: this.d.localClock, retryable: isRetryableChainError },
        ),
      );
      await rt.counters.markReported(metrics);
      s.status = "finished";
      s.finishTx = tx;
      s.metricsAtEnd = metrics;
      await this.persist();
      this.emit(rt, "session_finished", {
        session_id: s.id,
        reservation_id: s.reservationId,
        reason: s.finishReason,
        tx,
        metrics,
        delta: delta(s.metricsAtStart, metrics),
      });
    } catch (err) {
      this.emit(
        rt,
        "session_finish_failed",
        { session_id: s.id, reservation_id: s.reservationId, error: (err as Error).message, will_retry: true },
        "error",
      );
    }
  }

  /** Records the start on chain once; idempotent through a view check before every attempt. */
  private async chainStart(rt: AssetRuntime, s: Session): Promise<string | null> {
    return this.d.chainMutex.run(s.assetId, () =>
      withRetry(
        async () => {
          const view = await this.d.chain.getReservation(s.assetId, s.reservationId);
          if (view?.status === "InSession") return null;
          return (await this.d.chain.markSessionStarted(s.assetId, s.reservationId, { simulated: rt.simulated })).txHash;
        },
        {
          ...this.retry,
          clock: this.d.localClock,
          retryable: isRetryableChainError,
          onError: (err, attempt) =>
            rt.logger.warn({ err: (err as Error).message, attempt }, "mark_session_started attempt failed"),
        },
      ),
    );
  }

  private async unlockOrThrow(rt: AssetRuntime, s: Session): Promise<void> {
    try {
      await rt.adapter.unlock(this.context(s));
      this.emit(rt, "device_unlocked", { session_id: s.id, reservation_id: s.reservationId, ...standIn(rt) });
    } catch (err) {
      // The chain says InSession; the member can retry /access (resumption). The deadline closes it otherwise.
      this.emit(rt, "device_unlock_failed", { session_id: s.id, error: (err as Error).message }, "error");
      throw new BridgeError(503, "DEVICE_ERROR", `unlock failed: ${(err as Error).message}`);
    }
  }

  private async readMetricsSafe(rt: AssetRuntime): Promise<Metrics | null> {
    try {
      return (await readCounters(rt, { sample: false })).metrics;
    } catch {
      return null;
    }
  }

  private context(s: Session): SessionContext {
    return {
      sessionId: s.id,
      assetId: s.assetId,
      reservationId: s.reservationId,
      accountId: s.accountId,
      grantedAtChainNs: s.startedAtChainNs,
    };
  }

  private runtime(assetId: string): AssetRuntime {
    const rt = this.d.assets.get(assetId);
    if (!rt) throw new BridgeError(404, "UNKNOWN_ASSET", assetId);
    return rt;
  }

  private emit(rt: AssetRuntime, type: string, data: Record<string, unknown>, level: "info" | "warn" | "error" = "info"): void {
    this.d.bus.emit({ type, assetId: rt.config.asset_id, simulated: rt.simulated, data, level });
  }

  private async persist(): Promise<void> {
    // Keep unfinished sessions plus the latest 50 finished ones.
    const all = this.list();
    const finished = all.filter((s) => s.status === "finished").slice(-50);
    const keep = [...all.filter((s) => s.status !== "finished"), ...finished];
    await writeStateFile(this.path, {
      sessions: keep.map((s) => JSON.parse(JSON.stringify(s, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)))),
    });
  }
}

function delta(start: Metrics | null, end: Metrics): Record<string, bigint> {
  if (!start) return {};
  return Object.fromEntries(Object.entries(end).map(([k, v]) => [k, v - (start[k] ?? 0n)]));
}

export function standIn(rt: AssetRuntime): Record<string, unknown> {
  return rt.config.safety.stand_in ? { stand_in: rt.config.safety.stand_in } : {};
}
