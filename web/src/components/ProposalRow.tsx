import type { Proposal } from '../data/offchain';
import { formatNear } from '../lib/near';
import { formatAgo } from '../lib/time';
import { variantOf } from '../lib/enums';
import { Pill, type Tone } from './Badges';
import { Account, TxLink } from './TxLink';
import { useDataSource } from '../data/source';

const tone: Record<string, Tone> = { Approved: 'alive', InProgress: 'due', Rejected: 'danger', Failed: 'danger', Expired: 'muted', Removed: 'muted', Moved: 'muted' };

export function ProposalRow({ proposal: p, daoId, assetIds, nowMs }: { proposal: Proposal; daoId: string; assetIds: string[]; nowMs: number }) {
  const ds = useDataSource();
  const kind = variantOf(p.kind as Record<string, unknown>);
  const byMachine = assetIds.includes(p.proposer);
  const transfer = 'Transfer' in p.kind ? (p.kind as { Transfer: { amount: string; receiver_id: string } }).Transfer : null;
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="num mt-0.5 w-8 shrink-0 text-xs text-ink-3">#{p.id}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm break-words">{p.description}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
          <span>{kind}</span>
          {transfer && (
            <span className="num text-ink-2">
              {formatNear(transfer.amount)} NEAR → <Account id={transfer.receiver_id} />
            </span>
          )}
          <span>
            by <Account id={p.proposer} />
          </span>
          {byMachine && <Pill tone="muted">opened by the machine</Pill>}
          <span>· {formatAgo(p.submission_time, nowMs)}</span>
          <span className="sr-only">in {daoId}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Pill tone={tone[p.status] ?? 'muted'}>{p.status}</Pill>
        <TxLink hash={ds.rowTx(`proposal-${daoId}-${p.id}`)} />
      </div>
    </li>
  );
}
