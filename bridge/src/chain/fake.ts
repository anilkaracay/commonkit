import type { Metrics } from "../adapters/types.js";
import { MAX_METRICS, MAX_METRIC_NAME } from "../adapters/types.js";
import { NS_PER_MS } from "../util/near.js";
import {
  ChainError,
  type AccessCheck,
  type AccessKeyPermission,
  type CallContext,
  type ChainClient,
  type ReservationStatus,
  type ReservationView,
  type TaskStatus,
  type TaskView,
  type TelemetryView,
  type TxOutcome,
} from "./types.js";

export interface FakeReservation {
  id: bigint;
  holder: string;
  status: ReservationStatus;
  windowStart: bigint;
  windowEnd: bigint;
  startSlot?: bigint;
  slots?: number;
  sessionStartedAt?: bigint | null;
  sessionFinishedAt?: bigint | null;
}

export interface FakeTask {
  id: bigint;
  ruleId: string;
  status: TaskStatus;
  claimer: string | null;
  requiresVerificationTest?: boolean;
  verifier?: string | null;
  verification?: { passed: boolean; detailsHash: string } | null;
}

export interface FakeCall {
  method: string;
  assetId: string;
  args: Record<string, unknown>;
  simulated: boolean;
  txHash: string;
}

type WriteMethod = "markSessionStarted" | "markSessionFinished" | "reportTelemetry" | "submitVerificationResult";

interface AssetState {
  inService: boolean;
  reservations: Map<bigint, FakeReservation>;
  tasks: Map<bigint, FakeTask>;
  telemetry: TelemetryView;
}

/**
 * In-memory stand-in for the asset contracts, mirroring CONTRACT_SPEC §3.2-3.3 rules that the
 * bridge depends on (windows, states, monotonic telemetry). Used by tests and by sim mode.
 * It is not the chain: anything it records is labelled `fake-tx-*`.
 */
export class FakeChainClient implements ChainClient {
  readonly kind = "fake" as const;
  readonly calls: FakeCall[] = [];
  private nowNs: bigint;
  private txSeq = 0;
  private readonly keys = new Map<string, Map<string, AccessKeyPermission>>();
  private readonly assets = new Map<string, AssetState>();
  private readonly failures = new Map<WriteMethod | "getChainTime" | "viewAccessKey", Error[]>();

  constructor(startNs = 1_800_000_000_000_000_000n) {
    this.nowNs = startNs;
  }

  // --- test controls -------------------------------------------------------
  advanceMs(ms: number): void {
    this.nowNs += BigInt(ms) * NS_PER_MS;
  }
  setTime(ns: bigint): void {
    this.nowNs = ns;
  }
  addAccessKey(accountId: string, publicKey: string, permission: AccessKeyPermission = { kind: "full_access" }): void {
    const m = this.keys.get(accountId) ?? new Map<string, AccessKeyPermission>();
    m.set(publicKey, permission);
    this.keys.set(accountId, m);
  }
  addReservation(assetId: string, r: FakeReservation): void {
    this.asset(assetId).reservations.set(r.id, { ...r });
  }
  addTask(assetId: string, t: FakeTask): void {
    this.asset(assetId).tasks.set(t.id, { ...t });
  }
  /** Models `set_out_of_service` (D-017): blocks can_access and mark_session_started. */
  setInService(assetId: string, inService: boolean): void {
    this.asset(assetId).inService = inService;
  }
  /** The next call to `method` throws `err` (queue; one per call). */
  failNext(method: WriteMethod | "getChainTime" | "viewAccessKey", err: Error = new ChainError("injected", null)): void {
    const q = this.failures.get(method) ?? [];
    q.push(err);
    this.failures.set(method, q);
  }
  reservation(assetId: string, id: bigint): FakeReservation | undefined {
    return this.asset(assetId).reservations.get(id);
  }
  task(assetId: string, id: bigint): FakeTask | undefined {
    return this.asset(assetId).tasks.get(id);
  }

  // --- views ---------------------------------------------------------------
  async getChainTime(): Promise<bigint> {
    this.maybeFail("getChainTime");
    return this.nowNs;
  }

  async viewAccessKey(accountId: string, publicKey: string): Promise<AccessKeyPermission | null> {
    this.maybeFail("viewAccessKey");
    return this.keys.get(accountId)?.get(publicKey) ?? null;
  }

  async canAccess(assetId: string, accountId: string, reservationId: bigint): Promise<AccessCheck> {
    const r = this.asset(assetId).reservations.get(reservationId);
    const deny = (reason: string): AccessCheck => ({
      ok: false,
      reason,
      windowStart: r?.windowStart ?? 0n,
      windowEnd: r?.windowEnd ?? 0n,
    });
    // Mirrors contracts/asset/src/views.rs can_access (reasons and order).
    if (!r) return deny("unknown_reservation");
    if (r.holder !== accountId) return deny("not_holder");
    if (!this.asset(assetId).inService) return deny("out_of_service");
    const ok = (reason: string): AccessCheck => ({ ok: true, reason, windowStart: r.windowStart, windowEnd: r.windowEnd });
    if (r.status === "InSession") return ok("session_active");
    if (r.status === "PendingAuthorization") return deny("pending_authorization");
    if (r.status !== "Confirmed") return deny("not_active");
    if (this.nowNs < r.windowStart) return deny("too_early");
    if (this.nowNs > r.windowEnd) return deny("start_window_closed");
    return ok("ok");
  }

  async getReservation(assetId: string, reservationId: bigint): Promise<ReservationView | null> {
    const r = this.asset(assetId).reservations.get(reservationId);
    if (!r) return null;
    return {
      id: r.id,
      holder: r.holder,
      status: r.status,
      startSlot: r.startSlot ?? 0n,
      slots: r.slots ?? 1,
      sessionStartedAt: r.sessionStartedAt ?? null,
      sessionFinishedAt: r.sessionFinishedAt ?? null,
    };
  }

  async getTask(assetId: string, taskId: bigint): Promise<TaskView | null> {
    const t = this.asset(assetId).tasks.get(taskId);
    if (!t) return null;
    return {
      id: t.id,
      ruleId: t.ruleId,
      status: t.status,
      claimer: t.claimer,
      requiresVerificationTest: t.requiresVerificationTest ?? true,
      verifier: t.verifier ?? null,
      verification: t.verification ?? null,
    };
  }

  async getTelemetry(assetId: string): Promise<TelemetryView> {
    const t = this.asset(assetId).telemetry;
    return { metrics: { ...t.metrics }, updatedAt: t.updatedAt, reports: t.reports };
  }

  // --- writes (bridge only) ------------------------------------------------
  async markSessionStarted(assetId: string, reservationId: bigint, ctx: CallContext): Promise<TxOutcome> {
    this.maybeFail("markSessionStarted");
    const r = this.mustReservation(assetId, reservationId);
    if (r.status !== "Confirmed") throw new ChainError(`E_BAD_STATE: reservation is ${r.status}`, "E_BAD_STATE");
    if (!this.asset(assetId).inService) throw new ChainError("E_OUT_OF_SERVICE: asset is out of service", "E_OUT_OF_SERVICE");
    if (this.nowNs < r.windowStart || this.nowNs > r.windowEnd) {
      throw new ChainError("E_WINDOW_CLOSED: outside start window", "E_WINDOW_CLOSED");
    }
    r.status = "InSession";
    r.sessionStartedAt = this.nowNs;
    return this.record("mark_session_started", assetId, { reservation_id: reservationId }, ctx);
  }

  async markSessionFinished(assetId: string, reservationId: bigint, metrics: Metrics, ctx: CallContext): Promise<TxOutcome> {
    this.maybeFail("markSessionFinished");
    const r = this.mustReservation(assetId, reservationId);
    if (r.status !== "InSession") throw new ChainError(`E_BAD_STATE: reservation is ${r.status}`, "E_BAD_STATE");
    this.applyTelemetry(assetId, metrics);
    r.status = "Finished";
    r.sessionFinishedAt = this.nowNs;
    return this.record("mark_session_finished", assetId, { reservation_id: reservationId, metrics: { ...metrics } }, ctx);
  }

  async reportTelemetry(assetId: string, metrics: Metrics, ctx: CallContext): Promise<TxOutcome> {
    this.maybeFail("reportTelemetry");
    this.applyTelemetry(assetId, metrics);
    return this.record("report_telemetry", assetId, { metrics: { ...metrics } }, ctx);
  }

  async submitVerificationResult(
    assetId: string,
    taskId: bigint,
    passed: boolean,
    detailsHash: string,
    ctx: CallContext,
  ): Promise<TxOutcome> {
    this.maybeFail("submitVerificationResult");
    const t = this.asset(assetId).tasks.get(taskId);
    if (!t) throw new ChainError("E_BAD_STATE: task not found", "E_BAD_STATE");
    if (t.status !== "Submitted" || t.verifier) {
      throw new ChainError("E_BAD_STATE: task is not awaiting verification", "E_BAD_STATE");
    }
    if (!/^[0-9a-f]{64}$/.test(detailsHash)) {
      throw new ChainError("E_INVALID_ARGS: details_hash must be a hex sha256", "E_INVALID_ARGS");
    }
    t.verification = { passed, detailsHash };
    return this.record("submit_verification_result", assetId, { task_id: taskId, passed, details_hash: detailsHash }, ctx);
  }

  // --- internals -----------------------------------------------------------
  private asset(id: string): AssetState {
    let a = this.assets.get(id);
    if (!a) {
      a = { inService: true, reservations: new Map(), tasks: new Map(), telemetry: { metrics: {}, updatedAt: 0n, reports: 0n } };
      this.assets.set(id, a);
    }
    return a;
  }

  private mustReservation(assetId: string, id: bigint): FakeReservation {
    const r = this.asset(assetId).reservations.get(id);
    if (!r) throw new ChainError("E_BAD_STATE: reservation not found", "E_BAD_STATE");
    return r;
  }

  private applyTelemetry(assetId: string, metrics: Metrics): void {
    const names = Object.keys(metrics);
    const t = this.asset(assetId).telemetry;
    const merged = { ...t.metrics, ...metrics };
    if (Object.keys(merged).length > MAX_METRICS || names.some((n) => n.length > MAX_METRIC_NAME)) {
      throw new ChainError("E_BAD_STATE: too many metrics or name too long", "E_BAD_STATE");
    }
    for (const n of names) {
      const prev = t.metrics[n];
      if (prev !== undefined && (metrics[n] as bigint) < prev) {
        throw new ChainError(`E_TELEMETRY_NOT_MONOTONIC: ${n}`, "E_TELEMETRY_NOT_MONOTONIC");
      }
    }
    t.metrics = merged;
    t.updatedAt = this.nowNs;
    t.reports += 1n;
  }

  private record(method: string, assetId: string, args: Record<string, unknown>, ctx: CallContext): TxOutcome {
    const txHash = `fake-tx-${++this.txSeq}`;
    this.calls.push({ method, assetId, args, simulated: ctx.simulated, txHash });
    return { txHash };
  }

  private maybeFail(method: WriteMethod | "getChainTime" | "viewAccessKey"): void {
    const q = this.failures.get(method);
    const err = q?.shift();
    if (err) throw err;
  }
}
