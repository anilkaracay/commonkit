/**
 * What the agent reads from and writes to one asset contract (CONTRACT_SPEC §3.3, §3.5, §3.6).
 * Amounts are bigint yocto, timestamps bigint ns, ids bigint. View shapes follow the contract's
 * JSON (contracts/asset/src/views.rs, types.rs) after decoding in chain/schemas.ts.
 */

export const UPKEEP_KINDS = [
  "Maintenance",
  "Restock",
  "Cleaning",
  "Inspection",
  "Repair",
  "Rebalance",
  "Supervision",
] as const;
export type UpkeepKind = (typeof UPKEEP_KINDS)[number];

export type Trigger =
  | { type: "Metric"; metric: string; threshold: bigint }
  | { type: "Schedule"; everyHours: number }
  | { type: "Report"; minReports: number };

export interface UpkeepRule {
  ruleId: string;
  kind: UpkeepKind;
  trigger: Trigger;
  title: string;
  rewardRights: number;
  rewardCash: bigint;
  reimbursableMax: bigint;
  requiresVerificationTest: boolean;
  claimTimeoutHours: number;
}

/** The parts of `get_profile` the agent uses. */
export interface ProfileView {
  displayName: string;
  periodDays: number;
  periodRewardQuota: number;
  autoRewardCashCap: bigint;
  rules: UpkeepRule[];
}

/** One row of `get_rule_status`. */
export interface RuleStatus {
  ruleId: string;
  kind: UpkeepKind;
  trigger: Trigger;
  /** Metric: counter value; Schedule: hours since last reward; Report: active reports. */
  current: bigint;
  /** Metric: value at last reward; Schedule: ns timestamp of last reward (or contract creation); Report: 0. */
  baseline: bigint;
  /** Metric: delta since baseline; Schedule: hours since last; Report: active reports. */
  dueValue: bigint;
  due: boolean;
  /** Schedule only (ns). */
  nextDueEstimate: bigint | null;
  openTask: bigint | null;
  rewardRights: number;
  rewardCash: bigint;
  reimbursableMax: bigint;
}

export type TaskStatus = "Open" | "Claimed" | "Submitted" | "Approved" | "Rewarded" | "Rejected" | "Expired" | "Cancelled";

export type ExpenseState =
  | { type: "None" }
  | { type: "Reserved" }
  | { type: "NeedsEscalation" }
  | { type: "Escalated"; escalationId: bigint }
  | { type: "Paid" };

export interface TaskView {
  id: bigint;
  ruleId: string;
  kind: UpkeepKind;
  status: TaskStatus;
  openedBy: string;
  manual: boolean;
  claimer: string | null;
  claimedAt: bigint | null;
  claimTimeoutHours: number;
  expense: bigint;
  expenseState: ExpenseState;
  createdAt: bigint;
}

export type EscalationStatus = "Submitting" | "Submitted" | "Approved" | "Rejected" | "Expired" | "Failed";

export interface EscalationView {
  id: bigint;
  kind: string;
  receiver: string;
  amount: bigint;
  reason: string;
  taskId: bigint | null;
  proposalId: bigint | null;
  status: EscalationStatus;
  bondSettled: boolean;
  submittedAt: bigint;
}

export interface LedgerView {
  floatFree: bigint;
  floatCap: bigint;
  depositsHeld: bigint;
  rewardsReserved: bigint;
}

export interface PeriodView {
  startedAt: bigint;
  rightsMinted: number;
  rightsReserved: number;
}

export interface WiringView {
  daoId: string;
  agentId: string | null;
  daoProposalBond: bigint | null;
  daoProposalPeriod: bigint | null;
  openEscalations: number;
}

export interface FaultsView {
  ruleId: string;
  reports: number;
}

export interface ServiceStatusView {
  inService: boolean;
  since: bigint;
}

/** Enough to decide later whether an ambiguous write could still land (D-601). */
export interface WriteRef {
  method: string;
  txHash: string | null;
  /** Access-key nonce the transaction used; a later landed nonce makes it permanently invalid. */
  nonce: bigint | null;
  sentAtMs: number;
}

export interface TxOutcome {
  txHash: string;
}

export const MAX_OPEN_ESCALATIONS = 3;
export const MAX_RATIONALE_LEN = 1000;
export const MAX_NOTE_LEN = 500;
export const MAX_REASON_LEN = 500;

/**
 * Everything the agent needs from one NEAR network. The fake (chain/fake.ts) backs tests, the
 * simulated run and the offline limits demo; chain/near.ts is the testnet adapter.
 *
 * Writes never take a `manual` flag: the agent can never bypass the contract's due check.
 */
export interface AgentChain {
  readonly kind: "fake" | "near";
  /** The account whose function-call keys sign the writes. */
  readonly agentAccountId: string;

  /** Timestamp (ns) of the latest final block. */
  getChainTime(): Promise<bigint>;
  getProfile(assetId: string): Promise<ProfileView>;
  getWiring(assetId: string): Promise<WiringView>;
  getRuleStatus(assetId: string): Promise<RuleStatus[]>;
  /** All tasks, ascending by id. */
  getTasks(assetId: string): Promise<TaskView[]>;
  getLedger(assetId: string): Promise<LedgerView>;
  getPeriod(assetId: string): Promise<PeriodView>;
  /** All escalations, ascending by id. */
  getEscalations(assetId: string): Promise<EscalationView[]>;
  getFaults(assetId: string): Promise<FaultsView[]>;
  getServiceStatus(assetId: string): Promise<ServiceStatusView>;

  openUpkeepTask(assetId: string, ruleId: string, rationale: string): Promise<TxOutcome & { taskId: bigint | null }>;
  annotateTask(assetId: string, taskId: bigint, note: string): Promise<TxOutcome>;
  escalate(
    assetId: string,
    req: { kind: "purchase" | "reimbursement"; receiver: string; amount: bigint; reason: string; taskId: bigint | null },
  ): Promise<TxOutcome & { escalationId: bigint | null }>;
  syncEscalation(assetId: string, escalationId: bigint): Promise<TxOutcome>;
  refreshDaoPolicy(assetId: string): Promise<TxOutcome>;

  /**
   * After an ambiguous write: true once the transaction can no longer land (it is final, or a
   * later nonce of the same key landed). Until then the agent must not attempt the same write.
   */
  isWriteSettled(ref: WriteRef): Promise<boolean>;
}

/**
 * A failed chain call.
 * - `code` set: the contract panicked with that E_* code; deterministic, nothing was applied.
 * - `ambiguous`: the transaction may have been applied (e.g. timeout after broadcast). The caller
 *   must re-read state and must not resend until `isWriteSettled(ref)`.
 * - neither: the call definitely did not apply (e.g. failed before broadcast, RPC view error).
 */
export class ChainError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly ambiguous = false,
    readonly ref: WriteRef | null = null,
  ) {
    super(message);
    this.name = "ChainError";
  }
}

/** First E_* code in a message; falls back to any E_* token so new spec codes are not lost. */
export function extractErrorCode(text: string, known: (t: string) => string | null): string | null {
  return known(text) ?? /\b(E_[A-Z][A-Z_]+)\b/.exec(text)?.[1] ?? null;
}

export const NS_PER_HOUR = 3_600_000_000_000n;
export const NS_PER_DAY = 24n * NS_PER_HOUR;
