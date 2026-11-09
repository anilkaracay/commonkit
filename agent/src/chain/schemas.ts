/**
 * zod decoders from the asset contract's view JSON (near-sdk serde defaults) to chain/types.ts.
 * U64/U128 arrive as decimal strings; plain u64 fields (thresholds, metric values) as numbers.
 */
import { z } from "zod";
import {
  UPKEEP_KINDS,
  type EscalationView,
  type ExpenseState,
  type FaultsView,
  type LedgerView,
  type PeriodView,
  type ProfileView,
  type RuleStatus,
  type ServiceStatusView,
  type TaskView,
  type Trigger,
  type UpkeepRule,
  type WiringView,
} from "./types.js";

const big = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform((v) => BigInt(v));
const kind = z.enum(UPKEEP_KINDS);

export const triggerSchema = z
  .union([
    z.object({ Metric: z.object({ metric: z.string(), threshold: big }) }),
    z.object({ Schedule: z.object({ every_hours: z.number().int().positive() }) }),
    z.object({ Report: z.object({ min_reports: z.number().int().positive() }) }),
  ])
  .transform((t): Trigger => {
    if ("Metric" in t) return { type: "Metric", metric: t.Metric.metric, threshold: t.Metric.threshold };
    if ("Schedule" in t) return { type: "Schedule", everyHours: t.Schedule.every_hours };
    return { type: "Report", minReports: t.Report.min_reports };
  });

const ruleSchema = z
  .object({
    rule_id: z.string(),
    kind,
    trigger: triggerSchema,
    title: z.string(),
    reward_rights: z.number().int().nonnegative(),
    reward_cash: big,
    reimbursable_max: big,
    requires_verification_test: z.boolean(),
    claim_timeout_hours: z.number().int().nonnegative(),
  })
  .transform(
    (r): UpkeepRule => ({
      ruleId: r.rule_id,
      kind: r.kind,
      trigger: r.trigger,
      title: r.title,
      rewardRights: r.reward_rights,
      rewardCash: r.reward_cash,
      reimbursableMax: r.reimbursable_max,
      requiresVerificationTest: r.requires_verification_test,
      claimTimeoutHours: r.claim_timeout_hours,
    }),
  );

export const profileSchema = z
  .object({
    display_name: z.string(),
    period_days: z.number().int().positive(),
    period_reward_quota: z.number().int().nonnegative(),
    auto_reward_cash_cap: big,
    rules: z.array(ruleSchema),
  })
  .transform(
    (p): ProfileView => ({
      displayName: p.display_name,
      periodDays: p.period_days,
      periodRewardQuota: p.period_reward_quota,
      autoRewardCashCap: p.auto_reward_cash_cap,
      rules: p.rules,
    }),
  );

export const ruleStatusSchema = z
  .object({
    rule_id: z.string(),
    kind,
    trigger: triggerSchema,
    current: big,
    baseline: big,
    due_value: big,
    due: z.boolean(),
    next_due_estimate: big.nullable().optional(),
    open_task: big.nullable().optional(),
    reward_rights: z.number().int().nonnegative(),
    reward_cash: big,
    reimbursable_max: big,
  })
  .transform(
    (s): RuleStatus => ({
      ruleId: s.rule_id,
      kind: s.kind,
      trigger: s.trigger,
      current: s.current,
      baseline: s.baseline,
      dueValue: s.due_value,
      due: s.due,
      nextDueEstimate: s.next_due_estimate ?? null,
      openTask: s.open_task ?? null,
      rewardRights: s.reward_rights,
      rewardCash: s.reward_cash,
      reimbursableMax: s.reimbursable_max,
    }),
  );

const expenseStateSchema = z
  .union([
    z.enum(["None", "Reserved", "NeedsEscalation", "Paid", "Denied"]),
    z.object({ Escalated: z.object({ escalation_id: big }) }),
  ])
  .transform((e): ExpenseState => (typeof e === "string" ? { type: e } : { type: "Escalated", escalationId: e.Escalated.escalation_id }));

export const taskSchema = z
  .object({
    id: big,
    rule_id: z.string(),
    kind,
    status: z.enum(["Open", "Claimed", "Submitted", "Approved", "Rewarded", "Rejected", "Expired", "Cancelled"]),
    opened_by: z.string(),
    manual: z.boolean(),
    claimer: z.string().nullable().optional(),
    claimed_at: big.nullable().optional(),
    claim_timeout_hours: z.number().int().nonnegative(),
    expense: big,
    expense_state: expenseStateSchema,
    created_at: big,
  })
  .transform(
    (t): TaskView => ({
      id: t.id,
      ruleId: t.rule_id,
      kind: t.kind,
      status: t.status,
      openedBy: t.opened_by,
      manual: t.manual,
      claimer: t.claimer ?? null,
      claimedAt: t.claimed_at ?? null,
      claimTimeoutHours: t.claim_timeout_hours,
      expense: t.expense,
      expenseState: t.expense_state,
      createdAt: t.created_at,
    }),
  );

export const escalationSchema = z
  .object({
    id: big,
    kind: z.string(),
    receiver: z.string(),
    amount: big,
    reason: z.string(),
    task_id: big.nullable().optional(),
    proposal_id: big.nullable().optional(),
    status: z.enum(["Submitting", "Submitted", "Approved", "Rejected", "Expired", "Failed"]),
    bond_settled: z.boolean(),
    submitted_at: big,
  })
  .transform(
    (e): EscalationView => ({
      id: e.id,
      kind: e.kind,
      receiver: e.receiver,
      amount: e.amount,
      reason: e.reason,
      taskId: e.task_id ?? null,
      proposalId: e.proposal_id ?? null,
      status: e.status,
      bondSettled: e.bond_settled,
      submittedAt: e.submitted_at,
    }),
  );

export const ledgerSchema = z
  .object({ float_free: big, float_cap: big, deposits_held: big, rewards_reserved: big })
  .transform(
    (l): LedgerView => ({
      floatFree: l.float_free,
      floatCap: l.float_cap,
      depositsHeld: l.deposits_held,
      rewardsReserved: l.rewards_reserved,
    }),
  );

export const periodSchema = z
  .object({
    started_at: big,
    rights_minted: z.number().int().nonnegative(),
    rights_reserved: z.number().int().nonnegative().optional(),
  })
  .transform(
    (p): PeriodView => ({ startedAt: p.started_at, rightsMinted: p.rights_minted, rightsReserved: p.rights_reserved ?? 0 }),
  );

export const wiringSchema = z
  .object({
    dao_id: z.string(),
    agent_id: z.string().nullable().optional(),
    dao_proposal_bond: big.nullable().optional(),
    dao_proposal_period: big.nullable().optional(),
    open_escalations: z.number().int().nonnegative(),
  })
  .transform(
    (w): WiringView => ({
      daoId: w.dao_id,
      agentId: w.agent_id ?? null,
      daoProposalBond: w.dao_proposal_bond ?? null,
      daoProposalPeriod: w.dao_proposal_period ?? null,
      openEscalations: w.open_escalations,
    }),
  );

export const faultsSchema = z
  .array(z.object({ rule_id: z.string(), reports: z.array(z.unknown()) }))
  .transform((rows): FaultsView[] => rows.map((r) => ({ ruleId: r.rule_id, reports: r.reports.length })));

export const serviceStatusSchema = z
  .object({ in_service: z.boolean(), since: big })
  .transform((s): ServiceStatusView => ({ inService: s.in_service, since: s.since }));
