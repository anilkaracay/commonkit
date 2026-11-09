/**
 * ADAPTER — testnet implementation of AgentChain. Views are complete (sdk NearRpc, finality
 * final, decoded by chain/schemas.ts). Writes go through an injected AgentTxSigner holding the
 * agent's function-call key per asset (AGENT_KEY_<ALIAS>); the signer is wired after M2 (accounts,
 * keys and deployments exist). Without a signer every write is refused (nothing is pretended).
 */
import { NearRpc, RpcError, parseErrorCode } from "@commonkit/sdk";
import { z } from "zod";
import {
  escalationSchema,
  faultsSchema,
  ledgerSchema,
  periodSchema,
  profileSchema,
  ruleStatusSchema,
  serviceStatusSchema,
  taskSchema,
  wiringSchema,
} from "./schemas.js";
import {
  ChainError,
  extractErrorCode,
  type AgentChain,
  type EscalationView,
  type FaultsView,
  type LedgerView,
  type PeriodView,
  type ProfileView,
  type RuleStatus,
  type ServiceStatusView,
  type TaskView,
  type TxOutcome,
  type WiringView,
  type WriteRef,
} from "./types.js";

/** Gas per agent call (Tgas). Generous until measured on testnet (CONTRACT_SPEC §8). */
export const AGENT_GAS_TGAS = {
  open_upkeep_task: 30,
  annotate_task: 10,
  escalate: 150,
  sync_escalation: 100,
  refresh_dao_policy: 100,
} as const;
export type AgentMethod = keyof typeof AGENT_GAS_TGAS;

/**
 * Signs and sends one function call with the agent's function-call key for `receiverId`
 * (no deposit: function-call keys cannot attach one). Must throw ChainError: with `code` for a
 * contract panic, with `ambiguous` + `ref` when the transaction may have landed.
 */
export interface AgentTxSigner {
  functionCall(receiverId: string, methodName: AgentMethod, args: object, gasTgas: number): Promise<{ txHash: string; returnValue: unknown }>;
  /** True once the transaction is final or can no longer land (a later nonce of the key landed). */
  isSettled(ref: WriteRef): Promise<boolean>;
}

const PAGE = 100;
const blockSchema = z.object({ header: z.object({ timestamp_nanosec: z.string().regex(/^\d+$/) }) });
const u64Return = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform((v) => BigInt(v));

export class NearAgentChain implements AgentChain {
  readonly kind = "near" as const;

  constructor(
    private readonly rpc: NearRpc,
    readonly agentAccountId: string,
    private readonly signer: AgentTxSigner | null = null,
  ) {}

  async getChainTime(): Promise<bigint> {
    try {
      return BigInt(blockSchema.parse(await this.rpc.call("block", { finality: "final" })).header.timestamp_nanosec);
    } catch (err) {
      throw toChainError(err);
    }
  }

  async getProfile(assetId: string): Promise<ProfileView> {
    return profileSchema.parse(await this.view(assetId, "get_profile"));
  }

  async getWiring(assetId: string): Promise<WiringView> {
    return wiringSchema.parse(await this.view(assetId, "get_wiring"));
  }

  async getRuleStatus(assetId: string): Promise<RuleStatus[]> {
    return z.array(ruleStatusSchema).parse(await this.view(assetId, "get_rule_status"));
  }

  async getTasks(assetId: string): Promise<TaskView[]> {
    return this.paged(assetId, "get_tasks", taskSchema);
  }

  async getLedger(assetId: string): Promise<LedgerView> {
    return ledgerSchema.parse(await this.view(assetId, "get_ledger"));
  }

  async getPeriod(assetId: string): Promise<PeriodView> {
    return periodSchema.parse(await this.view(assetId, "get_period"));
  }

  async getEscalations(assetId: string): Promise<EscalationView[]> {
    return this.paged(assetId, "get_escalations", escalationSchema);
  }

  async getFaults(assetId: string): Promise<FaultsView[]> {
    return faultsSchema.parse(await this.view(assetId, "get_faults", {}));
  }

  async getServiceStatus(assetId: string): Promise<ServiceStatusView> {
    return serviceStatusSchema.parse(await this.view(assetId, "get_service_status"));
  }

  async openUpkeepTask(assetId: string, ruleId: string, rationale: string): Promise<TxOutcome & { taskId: bigint | null }> {
    // Exactly these two arguments: the agent never sends `manual`.
    const r = await this.call(assetId, "open_upkeep_task", { rule_id: ruleId, rationale });
    return { txHash: r.txHash, taskId: u64OrNull(r.returnValue) };
  }

  async annotateTask(assetId: string, taskId: bigint, note: string): Promise<TxOutcome> {
    const r = await this.call(assetId, "annotate_task", { task_id: taskId.toString(), note });
    return { txHash: r.txHash };
  }

  async escalate(
    assetId: string,
    req: { kind: "purchase" | "reimbursement"; receiver: string; amount: bigint; reason: string; taskId: bigint | null },
  ): Promise<TxOutcome & { escalationId: bigint | null }> {
    const r = await this.call(assetId, "escalate", {
      kind: req.kind,
      receiver: req.receiver,
      amount: req.amount.toString(),
      reason: req.reason,
      task_id: req.taskId === null ? null : req.taskId.toString(),
    });
    return { txHash: r.txHash, escalationId: u64OrNull(r.returnValue) };
  }

  async syncEscalation(assetId: string, escalationId: bigint): Promise<TxOutcome> {
    return { txHash: (await this.call(assetId, "sync_escalation", { escalation_id: escalationId.toString() })).txHash };
  }

  async refreshDaoPolicy(assetId: string): Promise<TxOutcome> {
    return { txHash: (await this.call(assetId, "refresh_dao_policy", {})).txHash };
  }

  async isWriteSettled(ref: WriteRef): Promise<boolean> {
    if (!this.signer) return true;
    return this.signer.isSettled(ref);
  }

  private async paged<T>(assetId: string, method: string, schema: z.ZodType<T>): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const rows = z.array(z.unknown()).parse(await this.view(assetId, method, { from_index: String(from), limit: PAGE }));
      out.push(...rows.map((r) => schema.parse(r)));
      if (rows.length < PAGE) return out;
    }
  }

  private async view(assetId: string, method: string, args: object = {}): Promise<unknown> {
    try {
      return await this.rpc.view<unknown>(assetId, method, args);
    } catch (err) {
      throw toChainError(err);
    }
  }

  private async call(assetId: string, method: AgentMethod, args: object): Promise<{ txHash: string; returnValue: unknown }> {
    if (!this.signer) throw new ChainError(`no transaction signer configured; refusing ${method}`, null);
    try {
      return await this.signer.functionCall(assetId, method, args, AGENT_GAS_TGAS[method]);
    } catch (err) {
      throw toChainError(err);
    }
  }
}

function u64OrNull(v: unknown): bigint | null {
  const r = u64Return.safeParse(v);
  return r.success ? r.data : null;
}

export function toChainError(err: unknown): ChainError {
  if (err instanceof ChainError) return err;
  const text = err instanceof RpcError ? `${err.message} ${JSON.stringify(err.data)}` : String(err);
  return new ChainError(text, extractErrorCode(text, parseErrorCode));
}
