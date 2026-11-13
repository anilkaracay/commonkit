/** Human formatting for telemetry counters and upkeep rule progress (per trigger, D-017). */
import type { RuleStatus, Trigger, U64Num } from '../data/types';

function groupInt(v: bigint): string {
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Physical units carried in the metric name suffix: printed with the number, scaled when large. */
const UNIT_SUFFIX: [suffix: string, small: string, large: string, factor: bigint][] = [
  ['_mm', 'mm', 'm', 1000n],
  ['_wh', 'Wh', 'kWh', 1000n],
  ['_dl', 'dl', 'L', 10n],
];

function unitOf(metric: string) {
  return UNIT_SUFFIX.find(([suffix]) => metric.endsWith(suffix)) ?? null;
}

/** True when the formatted value already carries its unit (time, length, energy, volume). */
export function hasUnit(metric: string): boolean {
  return metric.endsWith('_seconds') || unitOf(metric) !== null;
}

/** "nozzle_seconds" → "nozzle time"; "filament_used_mm" → "filament used"; "jobs_total" → "jobs". */
export function metricLabel(metric: string): string {
  if (metric.endsWith('_seconds')) return `${metric.slice(0, -'_seconds'.length).replace(/_/g, ' ')} time`;
  const u = unitOf(metric);
  const base = u ? metric.slice(0, -u[0].length) : metric;
  return base.replace(/_total$/, '').replace(/_/g, ' ');
}

/** One decimal at most, grouped: 322000 / 1000 → "322", 341500 / 1000 → "341.5". */
function scaled(v: bigint, factor: bigint): string {
  const tenths = (v * 10n) / factor;
  return `${groupInt(tenths / 10n)}${tenths % 10n === 0n ? '' : `.${tenths % 10n}`}`;
}

const enPlural = new Intl.PluralRules('en');

/**
 * The counter's unit for a given count: "1 job", "13 jobs", "1 cycle", "330,000 filament used mm".
 * Labels are plural nouns; the singular drops a trailing "s" (unit words that do not end in "s"
 * stay as they are).
 */
export function unitWord(metric: string, count: bigint | number): string {
  const label = metricLabel(metric);
  const one = enPlural.select(Number(count)) === 'one';
  return one && label.endsWith('s') && !label.endsWith('ss') ? label.slice(0, -1) : label;
}

/** Seconds render as minutes/hours, mm/Wh/dl with their (scaled) unit, counts as grouped integers. */
export function formatMetric(metric: string, value: U64Num | bigint): string {
  const v = BigInt(value);
  const u = unitOf(metric);
  if (u) {
    const [, small, large, factor] = u;
    return v >= factor ? `${scaled(v, factor)} ${large}` : `${groupInt(v)} ${small}`;
  }
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
  /** The real figure in words: "4 h nozzle time", "52 h since last", "2 reports". */
  long(v: bigint): string;
  /** "rule every 30 min" | "rule every 7 d" | "rule at 1 report". */
  ruleText: string;
}

export function ruleProgress(rule: RuleStatus): RuleProgress {
  const t = rule.trigger;
  let used: bigint;
  let threshold: bigint;
  let format: (v: bigint) => string;
  let bare: (v: bigint) => string;
  let long: (v: bigint) => string;
  let ruleText: string;
  let caption: string;
  // `due_value` is computed by the contract per trigger: Metric delta, Schedule hours, Report count.
  used = BigInt(rule.due_value);
  if ('Metric' in t) {
    threshold = BigInt(t.Metric.threshold);
    const m = t.Metric.metric;
    format = (v) => (hasUnit(m) ? formatMetric(m, v) : `${formatMetric(m, v)} ${unitWord(m, v)}`);
    bare = (v) => formatMetric(m, v);
    long = (v) => (hasUnit(m) ? `${formatMetric(m, v)} ${metricLabel(m)}` : format(v));
    ruleText = `rule every ${format(threshold)}`;
    caption = `${metricLabel(m)} since last upkeep`;
  } else if ('Schedule' in t) {
    threshold = BigInt(t.Schedule.every_hours);
    format = formatHours;
    bare = formatHours;
    long = (v) => `${formatHours(v)} since last`;
    ruleText = `rule every ${formatHours(threshold)}`;
    caption = 'time since last done';
  } else {
    threshold = BigInt(t.Report.min_reports);
    format = (v) => `${v} report${v === 1n ? '' : 's'}`;
    bare = (v) => String(v);
    long = format;
    ruleText = `rule at ${format(threshold)}`;
    caption = 'active fault reports';
  }
  if (used < 0n) used = 0n;
  const remaining = threshold > used ? threshold - used : 0n;
  const fraction = threshold === 0n ? 1 : Number((used * 10_000n) / threshold) / 10_000;
  return { rule, used, threshold, remaining, fraction, format, bare, caption, long, ruleText };
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
