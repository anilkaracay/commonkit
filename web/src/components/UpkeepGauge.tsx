import type { RuleStatus, UpkeepRule } from '../data/types';
import { describeTrigger, mostDueRule, ruleProgress } from '../lib/metrics';
import { KindIcon } from './UpkeepKind';
import { formatDateTime } from '../lib/time';
import type { DemoThreshold } from '../data/hooks';
import { DemoThresholdChip } from './DemoThreshold';

const ARC = 240; // degrees of the dial, open at the bottom

function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const p = (d: number) => `${(cx + r * Math.cos(rad(d))).toFixed(2)} ${(cy + r * Math.sin(rad(d))).toFixed(2)}`;
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${p(fromDeg)} A ${r} ${r} 0 ${large} 1 ${p(toDeg)}`;
}

/** Blue while counting up; orange once a rule is due or has a task open. */
function isHot(fraction: number, open: boolean): boolean {
  return open || fraction >= 1;
}

/**
 * One-glance upkeep dial: the rule closest to its trigger. The arc stops at the end of its track
 * (never past 100 %); a due rule says so in words, with the real figure. Works for Metric, Schedule
 * and Report triggers. Fraction is display-only.
 */
export function UpkeepGauge({ rules, ruleDefs, size = 168 }: { rules: RuleStatus[]; ruleDefs: UpkeepRule[]; size?: number }) {
  const p = mostDueRule(rules);
  if (!p) return null;
  const title = ruleDefs.find((r) => r.rule_id === p.rule.rule_id)?.title ?? p.rule.rule_id;
  const open = p.rule.open_task !== null;
  const shown = Math.min(Math.max(p.fraction, 0), 1);
  const hot = isHot(p.fraction, open);
  const c = size / 2;
  const stroke = Math.max(5, Math.round(size / 28));
  const r = c - stroke;
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
        <path d={arcPath(c, c, r, start, start + ARC)} stroke="var(--ck-track)" strokeWidth={stroke} fill="none" strokeLinecap="round" />
        {shown > 0 && (
          <path
            d={arcPath(c, c, r, start, start + ARC * Math.max(shown, 0.012))}
            stroke={hot ? 'var(--ck-due-fill)' : 'var(--ck-fill)'}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
          />
        )}
      </svg>
      <figcaption className="absolute inset-0 flex -translate-y-[4%] flex-col items-center justify-center px-[16%] text-center">
        {due ? (
          <span className="key-num display leading-none text-due" style={{ ['--key-base' as string]: `${size / 150}rem` }}>
            Due now
          </span>
        ) : (
          <span className="key-num display leading-none text-text" style={{ ['--key-base' as string]: `${size / 92}rem` }}>
            {pct}%
          </span>
        )}
        <span className={`mt-1.5 leading-tight text-text-3 ${due ? 'line-clamp-3 text-[11px]' : 'line-clamp-2 text-xs'}`}>{label}</span>
      </figcaption>
      <p className="absolute inset-x-[20%] bottom-0 line-clamp-2 text-center text-xs leading-snug font-medium text-text-2" title={title}>
        {title}
      </p>
    </figure>
  );
}

/** Per-rule upkeep meters for the asset page: name, figure, 4 px gauge, one quiet note. */
export function RuleBars({ rules, ruleDefs, demo }: { rules: RuleStatus[]; ruleDefs: UpkeepRule[]; demo?: Map<string, DemoThreshold> }) {
  return (
    <ul className="divide-y divide-line">
      {rules.map((rule) => {
        const p = ruleProgress(rule);
        const def = ruleDefs.find((r) => r.rule_id === rule.rule_id);
        const hot = isHot(p.fraction, rule.open_task !== null);
        const d = demo?.get(rule.rule_id);
        return (
          <li key={rule.rule_id} className="py-3.5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <span className="flex min-w-0 items-start gap-2 font-medium">
                <span className="mt-1 text-slate-400">
                  <KindIcon kind={rule.kind} />
                </span>
                {def?.title ?? rule.rule_id}
              </span>
              <span className="num ml-auto text-sm whitespace-nowrap text-text-2">
                {p.bare(p.used)} / {p.format(p.threshold)}
              </span>
            </div>
            <div
              className={`ck-gauge mt-2 ${hot ? 'is-due' : ''}`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.round(p.fraction * 100))}
              aria-label={`${def?.title ?? rule.rule_id} progress`}
              style={{ ['--v' as string]: `${Math.min(100, p.fraction * 100)}%` }}
            >
              <span />
            </div>
            <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-text-3">
              <span>
                {rule.kind} · {describeTrigger(rule.trigger)}
              </span>
              {rule.open_task ? (
                <span className="inline-flex items-center gap-1.5 text-due">
                  <span aria-hidden className="size-1.5 rounded-full bg-due-fill" />
                  Task #{rule.open_task} open
                </span>
              ) : rule.due ? (
                <span className="text-due">Due</span>
              ) : (
                <span>
                  {rule.next_due_estimate ? `next ${formatDateTime(rule.next_due_estimate)}` : `${def?.reward_rights ?? 0} right(s) on completion`}
                </span>
              )}
            </div>
            {d && (
              <div className="mt-1.5">
                <DemoThresholdChip demo={d} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
