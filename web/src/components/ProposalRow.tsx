import type { Proposal } from '../data/offchain';
import { formatNear } from '../lib/near';
import { formatAgo } from '../lib/time';
import { variantOf } from '../lib/enums';
import { Mark, type Tone } from './Badges';
import { Account, TxLink } from './TxLink';
import { useDataSource } from '../data/source';

const tone: Record<string, Tone> = { Approved: 'ok', InProgress: 'quiet', Rejected: 'danger', Failed: 'danger', Expired: 'quiet', Removed: 'quiet', Moved: 'quiet' };

export function ProposalRow({ proposal: p, daoId, assetIds, nowMs }: { proposal: Proposal; daoId: string; assetIds: string[]; nowMs: number }) {
  const ds = useDataSource();
  const kind = variantOf(p.kind as Record<string, unknown>);
  const byMachine = assetIds.includes(p.proposer);
  const transfer = 'Transfer' in p.kind ? (p.kind as { Transfer: { amount: string; receiver_id: string } }).Transfer : null;
  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <span className="num w-7 shrink-0 pt-px text-sm text-text-3">#{p.id}</span>
      <div className="min-w-0 flex-1">
        <p className="break-words">{p.description}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-text-3">
          <span>{kind}</span>
          {transfer && (
            <span className="num text-text-2">
              {formatNear(transfer.amount)} NEAR → <Account id={transfer.receiver_id} />
            </span>
          )}
          <span>
            by <Account id={p.proposer} />
            {byMachine && <span className="text-text-2"> (opened by the machine)</span>}
          </span>
          <span>· {formatAgo(p.submission_time, nowMs)}</span>
          <span className="sr-only">in {daoId}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Mark tone={tone[p.status] ?? 'quiet'}>{p.status}</Mark>
        <TxLink hash={ds.rowTx(`proposal-${daoId}-${p.id}`)} />
      </div>
    </li>
  );
}
