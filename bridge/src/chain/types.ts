import type { Metrics } from "../adapters/types.js";

export type ReservationStatus =
  | "PendingAuthorization"
  | "Confirmed"
  | "InSession"
  | "Finished"
  | "Closed"
  | "Disputed"
  | "Cancelled"
  | "Rejected"
  | "NoShow";

export type TaskStatus = "Open" | "Claimed" | "Submitted" | "Approved" | "Rewarded" | "Rejected" | "Expired" | "Cancelled";

/** `asset.can_access(account, reservation_id)` (CONTRACT_SPEC §3.6). Times are chain ns. */
export interface AccessCheck {
  ok: boolean;
  reason: string | null;
  windowStart: bigint;
  windowEnd: bigint;
}

export interface ReservationView {
  id: bigint;
  holder: string;
  status: ReservationStatus;
  startSlot: bigint;
  slots: number;
  sessionStartedAt: bigint | null;
  sessionFinishedAt: bigint | null;
}

export interface TaskView {
  id: bigint;
  ruleId: string;
  status: TaskStatus;
  claimer: string | null;
  requiresVerificationTest: boolean;
  /** Set once a verifier approved; after that no new verification result is accepted. */
  verifier: string | null;
  verification: { passed: boolean; detailsHash: string } | null;
}

export interface TelemetryView {
  metrics: Metrics;
  updatedAt: bigint;
  reports: bigint;
}

/** RPC view_access_key result, reduced to what the bridge records. */
export type AccessKeyPermission =
  | { kind: "full_access" }
  | { kind: "function_call"; receiverId: string; methodNames: string[] };

export interface TxOutcome {
  txHash: string;
}

/** Bridge-side context for a write; `simulated` is logged by every implementation. */
export interface CallContext {
  simulated: boolean;
}

/**
 * Everything the bridge needs from NEAR. The fake (chain/fake.ts) is used in tests and sim mode;
 * the NEAR implementation (chain/near.ts) reads through @commonkit/sdk.
 * Write methods are only valid for the bridge account (function-call key per asset).
 */
export interface ChainClient {
  readonly kind: "fake" | "near";
  /** Timestamp (ns) of the latest final block. Used for every window check. */
  getChainTime(): Promise<bigint>;
  /** null when `publicKey` is not a current access key of `accountId`. */
  viewAccessKey(accountId: string, publicKey: string): Promise<AccessKeyPermission | null>;
  canAccess(assetId: string, accountId: string, reservationId: bigint): Promise<AccessCheck>;
  getReservation(assetId: string, reservationId: bigint): Promise<ReservationView | null>;
  getTask(assetId: string, taskId: bigint): Promise<TaskView | null>;
  getTelemetry(assetId: string): Promise<TelemetryView>;

  markSessionStarted(assetId: string, reservationId: bigint, ctx: CallContext): Promise<TxOutcome>;
  markSessionFinished(assetId: string, reservationId: bigint, metrics: Metrics, ctx: CallContext): Promise<TxOutcome>;
  reportTelemetry(assetId: string, metrics: Metrics, ctx: CallContext): Promise<TxOutcome>;
  submitVerificationResult(
    assetId: string,
    taskId: bigint,
    passed: boolean,
    detailsHash: string,
    ctx: CallContext,
  ): Promise<TxOutcome>;
}

/**
 * panic: executed and failed (deterministic). rejected: node refused, nothing applied.
 * ambiguous: outcome unknown and not settled. ambiguous_settled: settled; re-read state first.
 * rpc: transport/view failure. config: the bridge cannot sign for this asset.
 */
export type ChainErrorKind = "panic" | "rejected" | "ambiguous" | "ambiguous_settled" | "rpc" | "config";

/** A contract panic or RPC failure; `code` is the CONTRACT_SPEC §10 code when present. */
export class ChainError extends Error {
  readonly kind: ChainErrorKind;
  constructor(
    message: string,
    readonly code: string | null,
    kind?: ChainErrorKind,
    readonly txHash: string | null = null,
  ) {
    super(message);
    this.name = "ChainError";
    this.kind = kind ?? (code !== null ? "panic" : "rpc");
  }
}

/**
 * A contract panic with an E_* code is deterministic: retrying the same call gives the same answer.
 * RPC/network failures (code null) are worth retrying.
 */
export function isRetryableChainError(err: unknown): boolean {
  if (!(err instanceof ChainError)) return true;
  // Panics are deterministic; an unsettled ambiguous tx must not be resent blindly.
  return err.kind !== "panic" && err.kind !== "ambiguous" && err.kind !== "config";
}

/** First E_* code in a message; falls back to any E_* token so new spec codes are not lost. */
export function extractErrorCode(text: string, known: (t: string) => string | null): string | null {
  return known(text) ?? /\b(E_[A-Z][A-Z_]+)\b/.exec(text)?.[1] ?? null;
}

/** Metrics as sorted (name, value) pairs, the order the contract receives them. */
export function metricsToPairs(m: Metrics): Array<[string, bigint]> {
  return Object.keys(m)
    .sort()
    .map((k) => [k, m[k] as bigint]);
}
