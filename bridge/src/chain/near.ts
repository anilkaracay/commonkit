import type { NearRpc } from "@commonkit/sdk";
import { RpcError, parseErrorCode } from "@commonkit/sdk";
import { z } from "zod";
import type { Metrics } from "../adapters/types.js";
import {
  ChainError,
  metricsToPairs,
  type AccessCheck,
  type AccessKeyPermission,
  type CallContext,
  type ChainClient,
  type ReservationView,
  type TaskView,
  type TelemetryView,
  type TxOutcome,
} from "./types.js";

/** U64 arrives as a JSON string; plain u64 fields (metrics) arrive as numbers. */
const u64 = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform((v) => BigInt(v));

const reservationStatus = z.enum([
  "PendingAuthorization",
  "Confirmed",
  "InSession",
  "Finished",
  "Closed",
  "Disputed",
  "Cancelled",
  "Rejected",
  "NoShow",
]);
const taskStatus = z.enum(["Open", "Claimed", "Submitted", "Approved", "Rewarded", "Rejected", "Expired", "Cancelled"]);
const metricPairs = z.array(z.tuple([z.string(), u64]));

const accessCheckSchema = z.object({
  ok: z.boolean(),
  reason: z.string().nullable().optional(),
  window_start: u64.optional(),
  window_end: u64.optional(),
});
const reservationSchema = z.object({
  id: u64,
  holder: z.string(),
  start_slot: u64,
  slots: z.number().int(),
  status: reservationStatus,
  session_started_at: u64.nullable().optional(),
  session_finished_at: u64.nullable().optional(),
});
const taskSchema = z.object({
  id: u64,
  rule_id: z.string(),
  status: taskStatus,
  claimer: z.string().nullable().optional(),
  verification: z.object({ passed: z.boolean(), details_hash: z.string() }).nullable().optional(),
});
const telemetrySchema = z.object({ metrics: metricPairs, updated_at: u64, reports: u64 });
const blockSchema = z.object({ header: z.object({ timestamp_nanosec: z.string().regex(/^\d+$/) }) });
const accessKeySchema = z.object({
  permission: z.union([
    z.literal("FullAccess"),
    z.object({
      FunctionCall: z.object({ receiver_id: z.string(), method_names: z.array(z.string()) }),
    }),
  ]),
});

/** Signs and sends a function call from the bridge account (function-call key per asset). */
export interface TxSigner {
  functionCall(receiverId: string, methodName: string, args: object, gasTgas: number): Promise<TxOutcome>;
}

/** Gas per bridge call (Tgas). Generous until measured on testnet (CONTRACT_SPEC §8). */
export const BRIDGE_GAS_TGAS = {
  mark_session_started: 30,
  mark_session_finished: 100,
  report_telemetry: 30,
  submit_verification_result: 30,
} as const;

/**
 * Real NEAR implementation. Reads go through @commonkit/sdk NearRpc (finality final).
 * Writes go through an injected TxSigner; until signing lands (research B5) a client without
 * a signer refuses every write instead of pretending.
 */
export class NearChainClient implements ChainClient {
  readonly kind = "near" as const;

  constructor(
    private readonly rpc: NearRpc,
    private readonly signer: TxSigner | null = null,
  ) {}

  async getChainTime(): Promise<bigint> {
    const block = blockSchema.parse(await this.rpc.call("block", { finality: "final" }));
    return BigInt(block.header.timestamp_nanosec);
  }

  async viewAccessKey(accountId: string, publicKey: string): Promise<AccessKeyPermission | null> {
    let raw: unknown;
    try {
      raw = await this.rpc.call("query", {
        request_type: "view_access_key",
        finality: "final",
        account_id: accountId,
        public_key: publicKey,
      });
    } catch (err) {
      if (isUnknownKey(err)) return null;
      throw err;
    }
    const { permission } = accessKeySchema.parse(raw);
    if (permission === "FullAccess") return { kind: "full_access" };
    return {
      kind: "function_call",
      receiverId: permission.FunctionCall.receiver_id,
      methodNames: permission.FunctionCall.method_names,
    };
  }

  async canAccess(assetId: string, accountId: string, reservationId: bigint): Promise<AccessCheck> {
    const r = accessCheckSchema.parse(
      await this.view(assetId, "can_access", { account: accountId, reservation_id: reservationId.toString() }),
    );
    return { ok: r.ok, reason: r.reason ?? null, windowStart: r.window_start ?? 0n, windowEnd: r.window_end ?? 0n };
  }

  async getReservation(assetId: string, reservationId: bigint): Promise<ReservationView | null> {
    const raw = await this.view(assetId, "get_reservation", { id: reservationId.toString() });
    if (raw === null) return null;
    const r = reservationSchema.parse(raw);
    return {
      id: r.id,
      holder: r.holder,
      status: r.status,
      startSlot: r.start_slot,
      slots: r.slots,
      sessionStartedAt: r.session_started_at ?? null,
      sessionFinishedAt: r.session_finished_at ?? null,
    };
  }

  async getTask(assetId: string, taskId: bigint): Promise<TaskView | null> {
    const raw = await this.view(assetId, "get_task", { id: taskId.toString() });
    if (raw === null) return null;
    const t = taskSchema.parse(raw);
    return {
      id: t.id,
      ruleId: t.rule_id,
      status: t.status,
      claimer: t.claimer ?? null,
      verification: t.verification ? { passed: t.verification.passed, detailsHash: t.verification.details_hash } : null,
    };
  }

  async getTelemetry(assetId: string): Promise<TelemetryView> {
    const t = telemetrySchema.parse(await this.view(assetId, "get_telemetry", {}));
    return { metrics: Object.fromEntries(t.metrics), updatedAt: t.updated_at, reports: t.reports };
  }

  async markSessionStarted(assetId: string, reservationId: bigint, _ctx: CallContext): Promise<TxOutcome> {
    return this.call(assetId, "mark_session_started", { id: reservationId.toString() });
  }

  async markSessionFinished(assetId: string, reservationId: bigint, metrics: Metrics, _ctx: CallContext): Promise<TxOutcome> {
    return this.call(assetId, "mark_session_finished", { id: reservationId.toString(), metrics: jsonPairs(metrics) });
  }

  async reportTelemetry(assetId: string, metrics: Metrics, _ctx: CallContext): Promise<TxOutcome> {
    return this.call(assetId, "report_telemetry", { metrics: jsonPairs(metrics) });
  }

  async submitVerificationResult(
    assetId: string,
    taskId: bigint,
    passed: boolean,
    detailsHash: string,
    _ctx: CallContext,
  ): Promise<TxOutcome> {
    return this.call(assetId, "submit_verification_result", {
      task_id: taskId.toString(),
      passed,
      details_hash: detailsHash,
    });
  }

  private async view(assetId: string, method: string, args: object): Promise<unknown> {
    try {
      return await this.rpc.view<unknown>(assetId, method, args);
    } catch (err) {
      throw toChainError(err);
    }
  }

  private async call(assetId: string, method: keyof typeof BRIDGE_GAS_TGAS, args: object): Promise<TxOutcome> {
    if (!this.signer) throw new ChainError(`no transaction signer configured; cannot call ${method}`, null);
    try {
      return await this.signer.functionCall(assetId, method, args, BRIDGE_GAS_TGAS[method]);
    } catch (err) {
      throw toChainError(err);
    }
  }
}

/** Contract args: Vec<(String, u64)> as JSON numbers. Counters stay far below 2^53. */
function jsonPairs(m: Metrics): Array<[string, number]> {
  return metricsToPairs(m).map(([k, v]) => {
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new ChainError(`metric ${k} exceeds 2^53`, null);
    return [k, Number(v)];
  });
}

function isUnknownKey(err: unknown): boolean {
  const text = err instanceof RpcError ? `${err.message} ${JSON.stringify(err.data)}` : String(err);
  return /UNKNOWN_ACCESS_KEY|does not exist while viewing/i.test(text);
}

function toChainError(err: unknown): ChainError {
  if (err instanceof ChainError) return err;
  const text = err instanceof RpcError ? `${err.message} ${JSON.stringify(err.data)}` : String(err);
  return new ChainError(text, parseErrorCode(text));
}
