import { Link } from 'react-router';
import type { MaintenanceRule, Task } from '../data/types';
import { formatNear, toYocto } from '../lib/near';
import { formatAgo } from '../lib/time';
import { Pill, SimulatedBadge, type Tone } from './Badges';
import { Account, TxLink } from './TxLink';
import { useDemoLink } from '../demo/demo';

const statusTone: Record<Task['status'], Tone> = {
  Open: 'due',
  Claimed: 'due',
  Submitted: 'liability',
  Approved: 'liability',
  Rewarded: 'alive',
  Rejected: 'danger',
  Expired: 'muted',
  Cancelled: 'muted',
};

export function TaskRow({
  task,
  assetId,
  assetName,
  rule,
  simulated,
  nowMs,
  txHash,
}: {
  task: Task;
  assetId: string;
  assetName?: string;
  rule?: MaintenanceRule;
  simulated: boolean;
  nowMs: number;
  txHash?: string | null;
}) {
  const link = useDemoLink();
  return (
    <li className="relative flex items-start gap-3 py-3">
      <span className="num mt-0.5 w-8 shrink-0 text-xs text-ink-3">#{task.id}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={link(`/t/${assetId}/${task.id}`)} className="font-medium hover:underline">
            {rule?.title ?? task.rule_id}
          </Link>
          {assetName && <span className="text-sm text-ink-3">· {assetName}</span>}
          {simulated && <SimulatedBadge />}
        </div>
        <p className="mt-0.5 text-xs text-ink-2">
          reward <span className="num font-semibold text-ink">{task.reward_rights} right{task.reward_rights === 1 ? '' : 's'}</span>
          {toYocto(task.reward_cash) > 0n && <span className="num"> + {formatNear(task.reward_cash)} NEAR</span>}
          {task.claimer ? (
            <>
              {' '}· by <Account id={task.claimer} />
            </>
          ) : (
            ' · unclaimed'
          )}{' '}
          · {formatAgo(task.created_at, nowMs)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Pill tone={statusTone[task.status]}>{task.status}</Pill>
        <TxLink hash={txHash} />
      </div>
    </li>
  );
}
