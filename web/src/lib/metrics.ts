/** Human formatting for telemetry counters and upkeep rule progress (per trigger, D-017). */
import type { RuleStatus, Trigger, U64Num } from '../data/types';

function groupInt(v: bigint): string {
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "nozzle_seconds" → "nozzle time"; "cycles" → "cycles"; "jobs_total" → "jobs". */
export function metricLabel(metric: string): string {
  if (metric.endsWith('_seconds')) return `${metric.slice(0, -'_seconds'.length).replace(/_/g, ' ')} time`;
  return metric.replace(/_total$/, '').replace(/_/g, ' ');
}

/** Seconds counters render as hours/minutes, everything else as a grouped integer. */
export function formatMetric(metric: string, value: U64Num | bigint): string {
  const v = BigInt(value);
  if (metric.endsWith('_seconds')) {
    if (v < 3600n) return `${v / 60n} min`;
    const tenths = (v * 10n) / 3600n;
    return `${groupInt(tenths / 10n)}${tenths % 10n === 0n ? '' : `.${tenths % 10n}`} h`;
  }
  return groupInt(v);
}

function formatHours(h: bigint): string {
  if (h >= 48n) return `${h / 24n} d${h % 24n ? ` ${h % 24n} h` : ''}`;
  return `${h} h`;
}

export type TriggerKind = 'Metric' | 'Schedule' | 'Report';

export function triggerKind(t: Trigger): TriggerKind {
  return 'Metric' in t ? 'Metric' : 'Schedule' in t ? 'Schedule' : 'Report';
}

/** Short trigger description: "nozzle time ≥ 30 min", "every 7 d", "1 fault report". */
export function describeTrigger(t: Trigger): string {
  if ('Metric' in t) return `${metricLabel(t.Metric.metric)} ≥ ${formatMetric(t.Metric.metric, t.Metric.threshold)}`;
  if ('Schedule' in t) return `every ${formatHours(BigInt(t.Schedule.every_hours))}`;
  return `${t.Report.min_reports} fault report${t.Report.min_reports === 1 ? '' : 's'}`;
}

export interface RuleProgress {
  rule: RuleStatus;
  used: bigint;
  threshold: bigint;
  remaining: bigint;
  /** used / threshold, display only, may exceed 1. */
  fraction: number;
  /** Formats a quantity of this rule's unit ("18 min", "3 d", "2 reports", "41 cycles"). */
  format(v: bigint): string;
  /** Same quantity without a trailing word unit ("41" instead of "41 cycles"); time units stay. */
  bare(v: bigint): string;
  /** "nozzle time since last upkeep" etc. */
  caption: string;
}

export function ruleProgress(rule: RuleStatus): RuleProgress {
  const t = rule.trigger;
  let used: bigint;
  let threshold: bigint;
  let format: (v: bigint) => string;
  let bare: (v: bigint) => string;
  let caption: string;
  // `due_value` is computed by the contract per trigger: Metric delta, Schedule hours, Report count.
  used = BigInt(rule.due_value);
  if ('Metric' in t) {
    threshold = BigInt(t.Metric.threshold);
    const m = t.Metric.metric;
    format = (v) => (m.endsWith('_seconds') ? formatMetric(m, v) : `${formatMetric(m, v)} ${metricLabel(m)}`);
    bare = (v) => formatMetric(m, v);
    caption = `${metricLabel(m)} since last upkeep`;
  } else if ('Schedule' in t) {
    threshold = BigInt(t.Schedule.every_hours);
    format = formatHours;
    bare = formatHours;
    caption = 'time since last done';
  } else {
    threshold = BigInt(t.Report.min_reports);
    format = (v) => `${v} report${v === 1n ? '' : 's'}`;
    bare = (v) => String(v);
    caption = 'active fault reports';
  }
  if (used < 0n) used = 0n;
  const remaining = threshold > used ? threshold - used : 0n;
  const fraction = threshold === 0n ? 1 : Number((used * 10_000n) / threshold) / 10_000;
  return { rule, used, threshold, remaining, fraction, format, bare, caption };
}

/** The rule closest to (or furthest past) its threshold: what the gauge shows. */
export function mostDueRule(rules: RuleStatus[]): RuleProgress | null {
  let best: RuleProgress | null = null;
  for (const r of rules) {
    const p = ruleProgress(r);
    if (!best || p.fraction > best.fraction) best = p;
  }
  return best;
}
