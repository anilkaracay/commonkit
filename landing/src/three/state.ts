/** Machine state from the asset views (snapshot or live read). Assets that are not deployed show empty bars. */
import type { AssetSnap } from '../lib/chain.ts';
import type { MachineState } from './types.ts';

const ratio = (a: string, b: string) => (BigInt(b) === 0n ? 0 : Number((BigInt(a) * 10000n) / BigInt(b)) / 10000);

export function stateOf(a: AssetSnap | undefined): MachineState {
  if (!a) return { float: 0, wear: 0, due: false, taskOpen: false, inService: true };
  const r = a.rules.find((x) => 'Metric' in x.trigger) ?? a.rules[0];
  const thr = r && 'Metric' in r.trigger ? Number((r.trigger as { Metric: { threshold: number | string } }).Metric.threshold) : 1;
  return {
    float: ratio(a.ledger.float_free, a.ledger.float_cap),
    wear: r ? Math.min(1, Number(r.due_value) / Math.max(1, thr)) : 0,
    due: r?.due ?? false,
    taskOpen: a.rules.some((x) => x.open_task !== null),
    inService: a.in_service,
  };
}
