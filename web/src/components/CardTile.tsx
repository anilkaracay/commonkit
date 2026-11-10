import type { Card } from '../data/types';
import { rightStatusLabel, shortAccount } from '../lib/enums';
import { formatDateTime } from '../lib/time';
import { NonTransferableBadge, SimulatedBadge } from './Badges';

/**
 * A usage-right or credential card drawn like the NEP-171 token it is: inline SVG face,
 * non-transferable mark, status stamp. Consumed rights stay visible: earned history is kept.
 */
export function CardTile({ card, simulated = false, communityName }: { card: Card; simulated?: boolean; communityName?: string }) {
  const isRight = card.kind.type === 'UsageRight';
  const right = card.kind.type === 'UsageRight' ? card.kind : null;
  const cred = card.kind.type === 'Credential' ? card.kind : null;
  const status = card.expired ? 'Expired' : right ? rightStatusLabel(right.status) : cred?.suspended ? 'Suspended' : 'Valid';
  const faded = status === 'Consumed' || status === 'Suspended' || status === 'Expired';
  // The card face is always dark (like a printed token), so its colours are fixed, not themed.
  const accent = isRight ? (simulated ? '#86bde6' : '#7cc79f') : '#f2846c';

  let source = '';
  if (right) {
    const s = right.source;
    source = s.type === 'Maintenance' ? `earned · task #${s.task_id} on ${shortAccount(s.asset)}` : `earned · training #${s.training_id}`;
  } else if (cred) {
    source = `issued · training #${cred.issued_by_training}`;
  }
  let statusDetail = '';
  if (right && right.status.state !== 'Active') {
    const st = right.status;
    statusDetail = `${st.state === 'Locked' ? 'locked for' : 'used on'} reservation #${st.reservation_id} · ${shortAccount(st.asset)}`;
  }

  return (
    <figure className={`m-0 w-full max-w-[22rem] ${faded ? 'opacity-70' : ''}`} aria-label={`${isRight ? 'Usage right' : 'Credential'} ${card.token_id}, ${status}`}>
      <div className="relative overflow-hidden rounded-[14px] shadow-tag" style={{ background: '#1d1b16', color: '#f3efe6' }}>
        <svg aria-hidden viewBox="0 0 320 190" className="block w-full" preserveAspectRatio="none">
          <defs>
            <pattern id={`p-${card.token_id}`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="12" stroke={accent} strokeOpacity="0.25" strokeWidth="2" />
            </pattern>
          </defs>
          <rect width="320" height="190" fill={`url(#p-${card.token_id})`} />
          <rect x="0" y="0" width="8" height="190" fill={accent} />
          <circle cx="280" cy="40" r="56" fill="none" stroke={accent} strokeOpacity="0.5" strokeWidth="10" />
          <circle cx="280" cy="40" r="22" fill={accent} fillOpacity="0.35" />
        </svg>
        <div className="absolute inset-0 flex flex-col justify-between p-4 pl-6">
          <div>
            <p className="font-mono text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: accent }}>
              {isRight ? 'Usage right' : 'Credential'}
            </p>
            <p className="font-display text-xl leading-tight font-bold">{right ? right.group_id : cred?.kind}</p>
            {communityName && <p className="text-xs opacity-75">{communityName}</p>}
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="num text-[11px] opacity-80">{card.token_id}{right ? ` · ${right.max_slots} slot${right.max_slots === 1 ? '' : 's'}` : ''}</p>
              <NonTransferableBadge />
            </div>
            <span
              className="shrink-0 rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase"
              style={{ borderColor: accent, color: accent, transform: status === 'Consumed' ? 'rotate(-6deg)' : undefined }}
            >
              {status}
            </span>
          </div>
        </div>
      </div>
      <figcaption className="mt-1.5 space-y-0.5 px-1 text-[11px] text-ink-2">
        <span className="flex flex-wrap items-center gap-2">
          {source}
          {simulated && <SimulatedBadge />}
        </span>
        {statusDetail && <span className="block">{statusDetail}</span>}
        {card.expires_at && <span className="block text-ink-3">valid until {formatDateTime(card.expires_at)}</span>}
      </figcaption>
    </figure>
  );
}
