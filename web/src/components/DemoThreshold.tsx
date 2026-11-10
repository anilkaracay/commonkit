import type { DemoThreshold } from '../data/hooks';
import { TxLink } from './TxLink';

/** A rule lowered for the demo by DAO proposal: say so, show the production value, link the tx. */
export function DemoThresholdChip({ demo }: { demo: DemoThreshold }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 rounded-md border border-dashed border-due px-1.5 py-0.5 text-[10px] text-due" title={`Production: ${demo.production}`}>
      <span className="font-mono font-semibold tracking-[0.06em] uppercase">demo threshold</span>
      <span className="text-ink-3">· production {demo.production}</span>
      {demo.tx && <TxLink hash={demo.tx} label="proposal" />}
    </span>
  );
}
