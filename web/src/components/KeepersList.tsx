import type { Task, Training } from '../data/types';
import { formatAgo } from '../lib/time';
import { Account } from './TxLink';
import { useMembers } from './useMembers';

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

function initials(name: string): string {
  const parts = name.replace(/\..*$/, '').split(/[\s._-]+/).filter((w) => /^\p{L}/u.test(w) && w !== 'demo');
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function KeepersList({ tasks, trainings, nowMs }: { tasks: Task[]; trainings?: Training[]; nowMs: number }) {
  const members = useMembers();
  const keepers = keepersOf(tasks, trainings);
  if (keepers.length === 0) {
    return <p className="py-2 text-sm text-text-3">Nobody yet. The first person to finish an upkeep task shows up here.</p>;
  }
  return (
    <ol className="divide-y divide-line">
      {keepers.map((k) => (
        <li key={k.account} className="flex items-center gap-3.5 py-3.5 first:pt-0 last:pb-0">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
            {initials(members.get(k.account) ?? k.account)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate">
              <Account id={k.account} />
            </p>
            <p className="mt-0.5 text-sm text-text-3">
              {[k.maintenances && `${k.maintenances} upkeep${k.maintenances > 1 ? 's' : ''}`, k.trainings && `${k.trainings} training${k.trainings > 1 ? 's' : ''}`]
                .filter(Boolean)
                .join(' · ')}
              {k.lastNs > 0n && ` · ${formatAgo(k.lastNs, nowMs)}`}
            </p>
          </div>
          <span className="shrink-0 text-right" title="usage rights earned">
            <span className="num block text-lg leading-none font-semibold">+{k.rights}</span>
            <span className="text-xs text-text-3">rights</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
