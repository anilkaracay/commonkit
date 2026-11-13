import type { DemoThreshold } from '../data/hooks';
import type { Trigger } from '../data/types';
import { describeTrigger } from '../lib/metrics';
import { TxLink } from './TxLink';

/** A rule lowered for the demo by DAO proposal: say so quietly, show the production value, link the tx. */
export function DemoThresholdChip({ demo, compact = false }: { demo: DemoThreshold; compact?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 text-xs text-text-3" title={`Production: ${demo.production}`}>
      <span aria-hidden className="size-[7px] rounded-[2px] border border-current" />
      <span className="font-medium text-text-2">demo threshold</span>
      {!compact && <span>· production {demo.production}</span>}
      {!compact && demo.tx && <TxLink hash={demo.tx} label="proposal" />}
    </span>
  );
}

/**
 * A rule's live threshold in words, always followed by the demo-threshold label when the live value
 * was lowered from the production profile. Use it wherever a threshold is shown.
 */
export function RuleThreshold({ trigger, demo, compact = false }: { trigger: Trigger; demo?: DemoThreshold; compact?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="num">{describeTrigger(trigger)}</span>
      {demo && <DemoThresholdChip demo={demo} compact={compact} />}
    </span>
  );
}
