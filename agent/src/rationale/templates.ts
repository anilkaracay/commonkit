/**
 * Deterministic rationale per UpkeepKind (AGENT_SPEC §3.1). Every number comes from
 * `get_rule_status` and the profile rule; nothing is estimated. Report-trigger rationales give
 * the report count only, never reporters or notes.
 */
import { yoctoToNear } from "@commonkit/sdk";
import type { RuleStatus, UpkeepKind, UpkeepRule } from "../chain/types.js";

/** Display of one telemetry counter: label, unit and how many raw units make one display unit. */
interface MetricDisplay {
  label: string;
  unit: string;
  scale: bigint;
}

/** Known counters from profiles/*.json (D-410 derived counters included). */
const METRICS: Record<string, MetricDisplay> = {
  nozzle_seconds: { label: "Nozzle time", unit: "h", scale: 3600n },
  run_seconds: { label: "Run time", unit: "h", scale: 3600n },
  engine_seconds: { label: "Engine time", unit: "h", scale: 3600n },
  gpu_hours: { label: "GPU time", unit: "h", scale: 1n },
  filament_used_mm: { label: "Filament used", unit: "m", scale: 1000n },
  fuel_used_dl: { label: "Fuel used", unit: "L", scale: 10n },
  km: { label: "Distance", unit: "km", scale: 1n },
  jobs_total: { label: "Jobs", unit: "jobs", scale: 1n },
  cycles: { label: "Cycles", unit: "cycles", scale: 1n },
  uses: { label: "Uses", unit: "uses", scale: 1n },
  sessions: { label: "Sessions", unit: "sessions", scale: 1n },
  temp_high_samples: { label: "Readings above the temperature limit", unit: "readings", scale: 1n },
};

/** What "last time" means for each kind ("since last cleaning", "Last cleaning 7 days ago"). */
const KIND_NOUN: Record<UpkeepKind, string> = {
  Maintenance: "maintenance",
  Restock: "restock",
  Cleaning: "cleaning",
  Inspection: "check",
  Repair: "repair",
  Rebalance: "rebalance",
  Supervision: "supervised session",
};

/** Report-trigger wording per kind. */
const REPORT_PHRASE: Partial<Record<UpkeepKind, string>> = {
  Repair: "reported a fault",
  Rebalance: "reported the asset away from its home spot",
};

export function metricDisplay(metric: string): MetricDisplay {
  return METRICS[metric] ?? { label: metric.replace(/_/g, " "), unit: "", scale: 1n };
}

/** `value / scale` with at most one decimal, truncated (never rounded up), trailing ".0" dropped. */
export function scaled(value: bigint, scale: bigint): string {
  const tenths = (value * 10n) / scale;
  const whole = tenths / 10n;
  const frac = tenths % 10n;
  return frac === 0n ? whole.toString() : `${whole}.${frac}`;
}

function withUnit(value: bigint, d: MetricDisplay): string {
  const n = scaled(value, d.scale);
  return d.unit ? `${n} ${d.unit}` : n;
}

/** "7 days" for whole multiples of a day from 48 h on, otherwise hours. */
export function ago(hours: bigint): string {
  if (hours >= 48n && hours % 24n === 0n) return `${hours / 24n} days`;
  if (hours >= 48n) return `${hours / 24n} days ${hours % 24n} h`;
  return `${hours} h`;
}

function plural(n: number | bigint, one: string, many: string): string {
  return `${n} ${BigInt(n) === 1n ? one : many}`;
}

export function near(yocto: bigint): string {
  return `${yoctoToNear(yocto, 4)} NEAR`;
}

/** The facts the rationale is built from; also the only input the LLM sees (numbers checked). */
export interface RationaleFacts {
  asset: string;
  rule_id: string;
  kind: UpkeepKind;
  trigger: "Metric" | "Schedule" | "Report";
  title: string;
  /** The trigger sentence's numbers, as displayed. */
  observed: Record<string, string | number>;
  reward_rights: number;
  reward_cash_near: string | null;
  reimbursable_max_near: string | null;
  out_of_service: boolean;
}

export interface FactsContext {
  assetName: string;
  /** Number of Rewarded tasks of this rule so far (Schedule wording: "No cleaning recorded yet"). */
  completedBefore: number;
  outOfService: boolean;
}

export function buildFacts(status: RuleStatus, rule: UpkeepRule, ctx: FactsContext): RationaleFacts {
  const t = status.trigger;
  let observed: Record<string, string | number>;
  if (t.type === "Metric") {
    const d = metricDisplay(t.metric);
    observed = {
      metric: t.metric,
      since_last: withUnit(status.dueValue, d),
      threshold: withUnit(t.threshold, d),
    };
  } else if (t.type === "Schedule") {
    observed = { hours_since_last: Number(status.dueValue), since_last: ago(status.dueValue), every_hours: t.everyHours };
  } else {
    observed = { active_reports: Number(status.dueValue), min_reports: t.minReports };
  }
  return {
    asset: ctx.assetName,
    rule_id: status.ruleId,
    kind: status.kind,
    trigger: t.type,
    title: rule.title,
    observed,
    reward_rights: status.rewardRights,
    reward_cash_near: status.rewardCash > 0n ? near(status.rewardCash) : null,
    reimbursable_max_near: status.reimbursableMax > 0n ? near(status.reimbursableMax) : null,
    out_of_service: ctx.outOfService,
  };
}

function triggerSentence(f: RationaleFacts, status: RuleStatus, completedBefore: number): string {
  const t = status.trigger;
  const noun = KIND_NOUN[f.kind];
  if (t.type === "Metric") {
    const d = metricDisplay(t.metric);
    return `${d.label} since last ${noun}: ${f.observed["since_last"]} (threshold ${f.observed["threshold"]}).`;
  }
  if (t.type === "Schedule") {
    return completedBefore === 0
      ? `No ${noun} recorded in the last ${status.dueValue} h (every ${t.everyHours} h).`
      : `Last ${noun} ${f.observed["since_last"]} ago (every ${t.everyHours} h).`;
  }
  const phrase = REPORT_PHRASE[f.kind] ?? "reported a problem";
  return `${plural(status.dueValue, "member", "members")} ${phrase} (needed: ${t.minReports}).`;
}

function rewardSentence(f: RationaleFacts): string {
  const rights = plural(f.reward_rights, "usage right", "usage rights");
  const cash = f.reward_cash_near ? ` and ${f.reward_cash_near}` : "";
  let s = `Opening '${f.title}' with reward: ${rights}${cash}`;
  if (f.reimbursable_max_near) {
    s +=
      f.kind === "Repair"
        ? `; parts up to ${f.reimbursable_max_near} can be reimbursed with a receipt`
        : `; a receipt of up to ${f.reimbursable_max_near} can be reimbursed`;
  }
  return `${s}.`;
}

/** Template rationale (≤ 1000 chars; titles are ≤ 200 chars on chain). */
export function templateRationale(f: RationaleFacts, status: RuleStatus, completedBefore: number): string {
  const parts = [triggerSentence(f, status, completedBefore), rewardSentence(f)];
  if (f.kind === "Repair" && f.out_of_service) parts.push("The asset stays out of service until the repair is approved and rewarded.");
  return parts.join(" ");
}
