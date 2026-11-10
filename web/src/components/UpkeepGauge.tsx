import type { RuleStatus, UpkeepRule } from '../data/types';
import { describeTrigger, mostDueRule, ruleProgress } from '../lib/metrics';
import { KindIcon } from './UpkeepKind';
import { formatDateTime } from '../lib/time';
import type { DemoThreshold } from '../data/hooks';
import { DemoThresholdChip } from './DemoThreshold';

const ARC = 270; // degrees of the dial

function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const p = (d: number) => `${cx + r * Math.cos(rad(d))} ${cy + r * Math.sin(rad(d))}`;
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${p(fromDeg)} A ${r} ${r} 0 ${large} 1 ${p(toDeg)}`;
}

function toneFor(fraction: number, open: boolean): { stroke: string; text: string } {
  if (fraction >= 1 || open) return { stroke: 'var(--ck-due-fill)', text: 'text-due' };
  if (fraction >= 0.8) return { stroke: 'var(--ck-due-fill)', text: 'text-due' };
  return { stroke: 'var(--ck-alive)', text: 'text-alive' };
}

/**
 * One-glance upkeep dial: the rule closest to its trigger, what is left in the middle, open task
 * called out. Works for Metric, Schedule and Report triggers. Fraction is display-only.
 */
export function UpkeepGauge({
  rules,
  ruleDefs,
  size = 132,
}: {
  rules: RuleStatus[];
  ruleDefs: UpkeepRule[];
  size?: number;
}) {
  const p = mostDueRule(rules);
  if (!p) return null;
  const title = ruleDefs.find((r) => r.rule_id === p.rule.rule_id)?.title ?? p.rule.rule_id;
  const open = p.rule.open_task !== null;
  const shown = Math.min(p.fraction, 1);
  const tone = toneFor(p.fraction, open);
  const c = size / 2;
  const r = c - 9;
  const start = -ARC / 2;
  const due = p.fraction >= 1;
  // Never a percentage over 100: a due rule says so in words, with the real figure.
  const pct = Math.min(99, Math.floor(p.fraction * 100));
  const label = due ? `${p.long(p.used)} · ${p.ruleText}` : `${p.format(p.remaining)} left`;
  return (
    <figure
      className="relative m-0 shrink-0"
      style={{ width: size, height: size }}
      aria-label={`${title}: ${p.format(p.used)} of ${p.format(p.threshold)}${open ? `, task #${p.rule.open_task} open` : ''}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <path d={arcPath(c, c, r, start, start + ARC)} stroke="var(--ck-line)" strokeWidth="9" fill="none" strokeLinecap="round" />
        {/* threshold tick marks every 10% */}
        {Array.from({ length: 11 }, (_, i) => {
          const d = start + (ARC * i) / 10;
          const rad = ((d - 90) * Math.PI) / 180;
          return (
            <line
              key={i}
              x1={c + (r - 9) * Math.cos(rad)}
              y1={c + (r - 9) * Math.sin(rad)}
              x2={c + (r - (i % 5 === 0 ? 15 : 12)) * Math.cos(rad)}
              y2={c + (r - (i % 5 === 0 ? 15 : 12)) * Math.sin(rad)}
              stroke="var(--ck-line-strong)"
              strokeWidth="1"
            />
          );
        })}
        {shown > 0 && (
          <path d={arcPath(c, c, r, start, start + ARC * Math.max(shown, 0.01))} stroke={tone.stroke} strokeWidth="9" fill="none" strokeLinecap="round" />
        )}
      </svg>
      <figcaption className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
        {due ? (
          <span className={`key-num font-display leading-none font-bold ${tone.text}`} style={{ ['--key-base' as string]: `${size / 160}rem` }}>
            Due now
          </span>
        ) : (
          <span className={`num key-num leading-none font-semibold ${tone.text}`} style={{ ['--key-base' as string]: `${size / 140}rem` }}>
            {pct}%
          </span>
        )}
        <span className={`mt-1 leading-tight text-ink-2 ${due ? 'line-clamp-3 text-[10px]' : 'text-[11px]'}`}>{label}</span>
        <span className="line-clamp-2 text-[11px] leading-tight font-medium text-ink" title={title}>
          <KindIcon kind={p.rule.kind} size={11} /> {title}
        </span>
      </figcaption>
    </figure>
  );
}

/** Per-rule due bars for the asset page. */
export function RuleBars({ rules, ruleDefs, demo }: { rules: RuleStatus[]; ruleDefs: UpkeepRule[]; demo?: Map<string, DemoThreshold> }) {
  return (
    <ul className="space-y-3">
      {rules.map((rule) => {
        const p = ruleProgress(rule);
        const def = ruleDefs.find((r) => r.rule_id === rule.rule_id);
        const tone = toneFor(p.fraction, rule.open_task !== null);
        return (
          <li key={rule.rule_id}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5 font-medium">
                <KindIcon kind={rule.kind} />
                {def?.title ?? rule.rule_id}
              </span>
              <span className="num min-w-0 text-right text-xs break-words text-ink-2">
                {p.bare(p.used)} / {p.format(p.threshold)}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(p.fraction * 100))} aria-label={`${def?.title ?? rule.rule_id} progress`}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, p.fraction * 100)}%`, background: tone.stroke }} />
            </div>
            <div className="mt-1 flex justify-between gap-2 text-[11px] text-ink-3">
              <span>
                {rule.kind} · {describeTrigger(rule.trigger)}
              </span>
              <span className={tone.text}>
                {rule.open_task
                  ? `task #${rule.open_task} open`
                  : rule.due
                    ? 'due'
                    : rule.next_due_estimate
                      ? `next ${formatDateTime(rule.next_due_estimate)}`
                      : `${def?.reward_rights ?? 0} right(s) on completion`}
              </span>
            </div>
            {demo?.get(rule.rule_id) && (
              <div className="mt-1">
                <DemoThresholdChip demo={demo.get(rule.rule_id) as DemoThreshold} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
