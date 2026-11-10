import type { Card } from '../data/types';
import { rightStatusLabel, shortAccount } from '../lib/enums';
import { formatDateTime } from '../lib/time';
import { NonTransferableBadge, SimulatedBadge } from './Badges';

/**
 * A usage-right or credential card drawn like the NEP-171 token it is. Usage rights are navy passes,
 * credentials are white with a cobalt edge. Consumed rights stay visible: earned history is kept.
 */
export function CardTile({ card, simulated = false, communityName }: { card: Card; simulated?: boolean; communityName?: string }) {
  const isRight = card.kind.type === 'UsageRight';
  const right = card.kind.type === 'UsageRight' ? card.kind : null;
  const cred = card.kind.type === 'Credential' ? card.kind : null;
  const status = card.expired ? 'Expired' : right ? rightStatusLabel(right.status) : cred?.suspended ? 'Suspended' : 'Valid';
  const faded = status === 'Consumed' || status === 'Suspended' || status === 'Expired';

  let source = '';
  if (right) {
    const s = right.source;
    source = s.type === 'Maintenance' ? `Earned · task #${s.task_id} on ${shortAccount(s.asset)}` : `Earned · training #${s.training_id}`;
  } else if (cred) {
    source = `Issued · training #${cred.issued_by_training}`;
  }
  let statusDetail = '';
  if (right && right.status.state !== 'Active') {
    const st = right.status;
    statusDetail = `${st.state === 'Locked' ? 'Locked for' : 'Used on'} reservation #${st.reservation_id} · ${shortAccount(st.asset)}`;
  }

  return (
    <figure className="m-0 w-full max-w-[24rem]" aria-label={`${isRight ? 'Usage right' : 'Credential'} ${card.token_id}, ${status}`}>
      <div
        className={`relative flex aspect-[16/10] flex-col justify-between overflow-hidden rounded-lg p-5 ${
          isRight ? 'bg-inverse text-inverse-text shadow-md' : 'border border-line bg-surface text-text shadow-sm'
        } ${faded ? 'opacity-60 saturate-50' : ''}`}
      >
        <svg aria-hidden viewBox="0 0 200 200" className="pointer-events-none absolute -top-16 -right-16 size-56">
          <circle cx="100" cy="100" r="64" fill="none" stroke={isRight ? 'var(--ck-navy-700)' : 'var(--ck-ice-200)'} strokeWidth="1" />
          <circle cx="100" cy="100" r="88" fill="none" stroke={isRight ? 'var(--ck-navy-800)' : 'var(--ck-ice-100)'} strokeWidth="1" />
          <circle cx="100" cy="100" r="40" fill={isRight ? 'var(--ck-navy-800)' : 'var(--ck-ice-50)'} />
        </svg>
        <div className="relative">
          <p className={`text-xs font-medium ${isRight ? 'text-sky-300' : 'text-accent'}`}>{isRight ? 'Usage right' : 'Credential'}</p>
          <p className="display mt-1.5 text-[26px] break-words">{right ? right.group_id : cred?.kind}</p>
          {communityName && <p className={`mt-1 text-sm ${isRight ? 'text-inverse-text-2' : 'text-text-3'}`}>{communityName}</p>}
        </div>
        <div className={`relative flex items-end justify-between gap-3 ${isRight ? 'text-inverse-text-2' : 'text-text-3'}`}>
          <div className="min-w-0">
            <p className="num font-mono text-xs">
              {card.token_id}
              {right ? ` · ${right.max_slots} slot${right.max_slots === 1 ? '' : 's'}` : ''}
            </p>
            <NonTransferableBadge />
          </div>
          <span className={`shrink-0 text-sm font-semibold ${isRight ? 'text-inverse-text' : 'text-text'}`}>{status}</span>
        </div>
      </div>
      <figcaption className="mt-2.5 space-y-1 px-1 text-sm text-text-3">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {source}
          {simulated && <SimulatedBadge />}
        </span>
        {statusDetail && <span className="block">{statusDetail}</span>}
        {card.expires_at && <span className="block">Valid until {formatDateTime(card.expires_at)}</span>}
      </figcaption>
    </figure>
  );
}
