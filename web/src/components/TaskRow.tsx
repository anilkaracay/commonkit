import { Link } from 'react-router';
import type { Task, UpkeepRule } from '../data/types';
import { KindChip } from './UpkeepKind';
import { toYocto } from '../lib/near';
import { formatAgo } from '../lib/time';
import { Mark, SimulatedBadge, type Tone } from './Badges';
import { Account, TxLink } from './TxLink';
import { useDemoLink } from '../demo/demo';
import { Near } from './Near';

export const taskTone: Record<Task['status'], Tone> = {
  Open: 'due',
  Claimed: 'due',
  Submitted: 'ok',
  Approved: 'ok',
  Rewarded: 'ok',
  Rejected: 'danger',
  Expired: 'quiet',
  Cancelled: 'quiet',
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
  rule?: UpkeepRule;
  simulated: boolean;
  nowMs: number;
  txHash?: string | null;
}) {
  const link = useDemoLink();
  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <Link to={link(`/t/${assetId}/${task.id}`)} className="font-medium no-underline hover:text-accent">
            {rule?.title ?? task.rule_id}
          </Link>
          <span className="num text-sm text-text-3">#{task.id}</span>
          {assetName && <span className="text-sm text-text-3">· {assetName}</span>}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-3">
          <KindChip kind={task.kind} />
          <span>
            <span className="num font-medium text-text-2">
              {task.reward_rights} right{task.reward_rights === 1 ? '' : 's'}
            </span>
            {toYocto(task.reward_cash) > 0n && (
              <>
                {' '}
                + <Near value={task.reward_cash} />
              </>
            )}
          </span>
          {(task.kind === 'Restock' || task.kind === 'Repair') && toYocto(task.expense) > 0n && (
            <span className="num" title={task.receipt_hash ? `receipt sha256 ${task.receipt_hash}` : undefined}>
              expense <Near value={task.expense} />
              {task.receipt_hash ? ` · receipt ${task.receipt_hash.slice(0, 8)}…` : ''}
            </span>
          )}
          <span>{task.claimer ? <>by <Account id={task.claimer} /></> : 'unclaimed'}</span>
          <span>{formatAgo(task.created_at, nowMs)}</span>
          {simulated && <SimulatedBadge />}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Mark tone={taskTone[task.status]}>{task.status}</Mark>
        <TxLink hash={txHash} />
      </div>
    </li>
  );
}
