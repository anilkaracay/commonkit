/**
 * Escalation needs (AGENT_SPEC §4), computed only from on-chain tasks/escalations plus the
 * profile's off-chain purchase hints. Pure functions: the loop re-reads state and calls these
 * again right before every escalate, so a need that was met in the meantime disappears.
 */
import type { EscalationView, TaskView } from "./chain/types.js";
import { MAX_REASON_LEN } from "./chain/types.js";
import { near } from "./rationale/templates.js";

export interface PurchaseHint {
  rule_id: string;
  /** Propose a purchase after every `after_n` rewarded tasks of the rule. */
  after_n: number;
  item: string;
  amount: bigint;
  receiver: string;
}

export interface EscalationNeed {
  /** Stable identity of the need: one escalation per key, ever (unless the previous one Failed). */
  key: string;
  kind: "purchase" | "reimbursement";
  receiver: string;
  amount: bigint;
  taskId: bigint;
  reason: string;
}

/** Escalations that still count for dedupe: everything except `Failed` (add_proposal failed, bond back). */
function blocksRetry(e: EscalationView): boolean {
  return e.status !== "Failed";
}

/**
 * One purchase per completed cycle of `after_n` rewarded tasks, anchored on the task that
 * completed the cycle. Only the latest cycle is considered: an agent that was offline for two
 * cycles proposes one kit, not two. A Rejected proposal is the DAO's answer and is not re-asked.
 */
export function purchaseNeeds(
  hints: readonly PurchaseHint[],
  tasks: readonly TaskView[],
  escalations: readonly EscalationView[],
  opts: { supplierIsTeamAccount: boolean },
): EscalationNeed[] {
  const needs: EscalationNeed[] = [];
  for (const h of hints) {
    if (h.after_n <= 0 || h.amount <= 0n) continue;
    const rewarded = tasks.filter((t) => t.ruleId === h.rule_id && t.status === "Rewarded").sort((a, b) => cmp(a.id, b.id));
    const cycles = Math.floor(rewarded.length / h.after_n);
    if (cycles === 0) continue;
    const anchor = rewarded[cycles * h.after_n - 1]!;
    const done = escalations.some((e) => e.kind === "purchase" && e.taskId === anchor.id && blocksRetry(e));
    if (done) continue;
    const supplier = opts.supplierIsTeamAccount ? ` Receiver ${h.receiver} is a COMMONKIT team account acting as the demo supplier.` : "";
    needs.push({
      key: `purchase:${h.rule_id}:${anchor.id}`,
      kind: "purchase",
      receiver: h.receiver,
      amount: h.amount,
      taskId: anchor.id,
      reason: clip(
        `${h.item} for '${h.rule_id}': ${rewarded.length} rewarded tasks so far, the profile suggests a new one every ${h.after_n} (latest task #${anchor.id}). Amount ${near(h.amount)}.${supplier}`,
      ),
    });
  }
  return needs;
}

/**
 * D-017: a Restock/Repair expense above `auto_reward_cash_cap` waits at NeedsEscalation; the agent
 * asks the DAO to pay the claimer exactly the expense. The contract re-checks state, receiver and
 * amount; a reimbursement already submitted or approved is never asked again.
 */
export function reimbursementNeeds(
  tasks: readonly TaskView[],
  escalations: readonly EscalationView[],
  autoRewardCashCap: bigint,
): EscalationNeed[] {
  const needs: EscalationNeed[] = [];
  for (const t of tasks) {
    if (t.expenseState.type !== "NeedsEscalation" || t.claimer === null || t.expense <= 0n) continue;
    const pending = escalations.some((e) => e.kind === "reimbursement" && e.taskId === t.id && blocksRetry(e) && e.status !== "Rejected");
    if (pending) continue;
    needs.push({
      key: `reimbursement:${t.id}`,
      kind: "reimbursement",
      receiver: t.claimer,
      amount: t.expense,
      taskId: t.id,
      reason: clip(
        `Reimburse the documented ${t.kind} expense of ${near(t.expense)} for task #${t.id} ('${t.ruleId}') to its claimer. It is above the asset's automatic cash cap of ${near(autoRewardCashCap)}, so the DAO decides.`,
      ),
    });
  }
  return needs;
}

function cmp(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function clip(s: string): string {
  return s.length <= MAX_REASON_LEN ? s : s.slice(0, MAX_REASON_LEN - 1) + "…";
}
