/** Human formatting for telemetry counters (u64 as strings). */
import type { RuleStatus } from '../data/types';

function groupInt(v: bigint): string {
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "nozzle_seconds" → "nozzle time"; "cycles" → "cycles"; "jobs_total" → "jobs". */
export function metricLabel(metric: string): string {
  if (metric.endsWith('_seconds')) return `${metric.slice(0, -'_seconds'.length).replace(/_/g, ' ')} time`;
  return metric.replace(/_total$/, '').replace(/_/g, ' ');
}

/** Seconds counters render as hours/minutes, everything else as a grouped integer. */
export function formatMetric(metric: string, value: string | bigint): string {
  const v = BigInt(value);
  if (metric.endsWith('_seconds')) {
    if (v < 3600n) return `${v / 60n} min`;
    const tenths = (v * 10n) / 3600n;
    return `${groupInt(tenths / 10n)}${tenths % 10n === 0n ? '' : `.${tenths % 10n}`} h`;
  }
  return groupInt(v);
}

export interface RuleProgress {
  rule: RuleStatus;
  used: bigint;
  threshold: bigint;
  remaining: bigint;
  /** used / threshold for display only, may exceed 1. */
  fraction: number;
}

export function ruleProgress(rule: RuleStatus): RuleProgress {
  const used = BigInt(rule.value) - BigInt(rule.baseline);
  const threshold = BigInt(rule.threshold);
  const remaining = threshold > used ? threshold - used : 0n;
  const fraction = threshold === 0n ? 1 : Number((used * 10_000n) / threshold) / 10_000;
  return { rule, used, threshold, remaining, fraction };
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
