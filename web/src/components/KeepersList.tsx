import type { Task, Training } from '../data/types';
import { formatAgo } from '../lib/time';
import { Account } from './TxLink';

interface Keeper {
  account: string;
  maintenances: number;
  trainings: number;
  rights: number;
  lastNs: bigint;
}

/** Aggregates rewarded maintenance and approved trainings into the "who keeps me alive" list. */
export function keepersOf(tasks: Task[], trainings: Training[] = []): Keeper[] {
  const map = new Map<string, Keeper>();
  const get = (account: string) => {
    let k = map.get(account);
    if (!k) map.set(account, (k = { account, maintenances: 0, trainings: 0, rights: 0, lastNs: 0n }));
    return k;
  };
  for (const t of tasks) {
    if (t.status !== 'Rewarded' || !t.claimer) continue;
    const k = get(t.claimer);
    k.maintenances += 1;
    k.rights += t.minted_right_ids.length;
    if (BigInt(t.created_at) > k.lastNs) k.lastNs = BigInt(t.created_at);
  }
  for (const tr of trainings) {
    if (tr.status !== 'Approved') continue;
    const k = get(tr.trainer);
    k.trainings += 1;
    k.rights += Math.max(0, tr.minted.length - 1);
    if (BigInt(tr.created_at) > k.lastNs) k.lastNs = BigInt(tr.created_at);
  }
  return [...map.values()].sort((a, b) => b.maintenances + b.trainings - (a.maintenances + a.trainings) || Number(b.lastNs - a.lastNs));
}

export function KeepersList({ tasks, trainings, nowMs }: { tasks: Task[]; trainings?: Training[]; nowMs: number }) {
  const keepers = keepersOf(tasks, trainings);
  if (keepers.length === 0) {
    return <p className="text-sm text-ink-3">Nobody yet. The first person to finish a maintenance task shows up here.</p>;
  }
  return (
    <ol className="divide-y divide-line">
      {keepers.map((k) => (
        <li key={k.account} className="flex items-center gap-3 py-2.5">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-alive-soft font-display text-sm font-bold text-alive">
            {(k.account[0] ?? '?').toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate">
              <Account id={k.account} />
            </p>
            <p className="text-xs text-ink-2">
              {[k.maintenances && `${k.maintenances} maintenance${k.maintenances > 1 ? 's' : ''}`, k.trainings && `${k.trainings} training${k.trainings > 1 ? 's' : ''}`]
                .filter(Boolean)
                .join(' · ')}
              {k.lastNs > 0n && ` · ${formatAgo(k.lastNs, nowMs)}`}
            </p>
          </div>
          <span className="num shrink-0 text-sm font-semibold text-alive" title="usage rights earned">
            +{k.rights} <span className="text-xs font-normal text-ink-3">rights</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
