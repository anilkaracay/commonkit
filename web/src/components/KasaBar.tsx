import type { LedgerView } from '../data/types';
import { displayRatio, formatNear, toYocto } from '../lib/near';

/**
 * The asset's cash box ("kasa"). Top: operating float against its cap (anything above the cap
 * is swept to the DAO). Bottom, separate: deposits, which are a liability to members and never
 * revenue. Widths are display ratios; every printed amount is exact bigint formatting.
 */
export function KasaBar({ ledger, floatCap, compact = false }: { ledger: LedgerView; floatCap: string; compact?: boolean }) {
  const float = toYocto(ledger.float_free);
  const reserved = toYocto(ledger.rewards_reserved);
  const pending = toYocto(ledger.pending_out);
  const cap = toYocto(floatCap);
  const deposits = toYocto(ledger.deposits_held);
  // One scale for both bars so deposits and float compare honestly.
  const scale = [cap + cap / 4n, float + reserved + pending, deposits].reduce((a, b) => (a > b ? a : b));
  const w = (v: bigint) => `${displayRatio(v, scale) * 100}%`;
  const capPct = displayRatio(cap, scale) * 100;
  const atCap = float >= cap;

  return (
    <div className="space-y-3" aria-label="Asset cash box">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">Float</span>
          <span className="num text-sm">
            <span className="key-num font-semibold" style={{ ['--key-base' as string]: compact ? '0.95rem' : '1.25rem' }}>
              {formatNear(float)}
            </span>
            <span className="text-ink-3"> / {formatNear(cap)} NEAR cap</span>
          </span>
        </div>
        <div className="relative mt-1.5 h-4 overflow-hidden rounded-md bg-surface-2">
          <div className="hatch-over absolute inset-y-0 right-0" style={{ left: `${capPct}%` }} title="above cap: swept to DAO" />
          <div className="absolute inset-y-0 left-0 bg-alive" style={{ width: w(float) }} title="free float" />
          {reserved > 0n && <div className="absolute inset-y-0 bg-due-fill" style={{ left: w(float), width: w(reserved) }} title="reserved for task rewards" />}
          {pending > 0n && (
            <div className="absolute inset-y-0 border border-dashed border-ink-3" style={{ left: w(float + reserved), width: w(pending) }} title="in flight" />
          )}
          <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `calc(${capPct}% - 1px)` }} aria-hidden />
        </div>
        {!compact && (
          <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-[11px] text-ink-3">
            <span>
              {reserved > 0n ? `${formatNear(reserved)} reserved for rewards · ` : ''}
              {pending > 0n ? `${formatNear(pending)} in flight · ` : ''}
              {atCap ? 'at cap: new fees go to the DAO' : `${formatNear(cap - float)} until cap`}
            </span>
            <span>beyond cap → DAO treasury</span>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-liability">Deposits held</span>
          <span className="num text-sm text-liability">{formatNear(deposits)} NEAR</span>
        </div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-md bg-surface-2">
          <div className="hatch-liability h-full rounded-md" style={{ width: deposits === 0n ? '0%' : `max(6px, ${w(deposits)})` }} />
        </div>
        {!compact && <p className="mt-1 text-[11px] text-ink-3">Members' money, owed back. Never used for fees, rewards, sweeps or bonds.</p>}
      </div>

      {!compact && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-2 text-xs sm:grid-cols-4">
          {(
            [
              ['Fees in', ledger.total_fees_in],
              ['Swept to DAO', ledger.total_swept],
              ['Refunded', ledger.total_refunded],
              ['Bonds paid', ledger.total_bonds_paid],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 sm:block">
              <dt className="text-ink-3">{k}</dt>
              <dd className="num">{formatNear(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
