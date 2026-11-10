import type { LedgerView } from '../data/types';
import { displayRatio, formatNear, toYocto } from '../lib/near';

/** Float against its cap as one 4 px meter. Used on the board card. */
export function FloatMeter({ ledger, floatCap }: { ledger: LedgerView; floatCap: string }) {
  const float = toYocto(ledger.float_free);
  const cap = toYocto(floatCap);
  const v = Math.min(1, displayRatio(float, cap)) * 100;
  return (
    <div aria-label="Float against its cap">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-text-2">Float</span>
        <span className="num text-text-3">
          <span className="font-semibold text-text">{formatNear(float)}</span> / {formatNear(cap)} NEAR
        </span>
      </div>
      <div className="ck-gauge mt-2" style={{ ['--v' as string]: `${v}%` }}>
        <span />
      </div>
    </div>
  );
}

/**
 * The two numbers that say what a machine holds: its operating float against the cap (above the cap
 * goes to the DAO), and members' deposits, which are owed back and never revenue.
 */
export function MoneyFigures({ ledger, floatCap }: { ledger: LedgerView; floatCap: string }) {
  const float = toYocto(ledger.float_free);
  const cap = toYocto(floatCap);
  const deposits = toYocto(ledger.deposits_held);
  const v = Math.min(1, displayRatio(float, cap)) * 100;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
      <div className="min-w-0">
        <dt className="text-sm text-text-3">Float</dt>
        <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          <span className="key-num display leading-none" style={{ ['--key-base' as string]: '2.125rem' }}>
            {formatNear(float)}
          </span>
          <span className="num text-sm text-text-3">/ {formatNear(cap)} NEAR</span>
        </dd>
        <dd className="ck-gauge mt-3" style={{ ['--v' as string]: `${v}%` }}>
          <span />
        </dd>
        <dd className="mt-2 text-xs text-text-3">Above the cap goes to the DAO</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-sm text-text-3">Deposits held</dt>
        <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          <span className="key-num display leading-none text-liability" style={{ ['--key-base' as string]: '2.125rem' }}>
            {formatNear(deposits)}
          </span>
          <span className="text-sm text-text-3">NEAR</span>
        </dd>
        <dd className="mt-3 h-1" aria-hidden />
        <dd className="mt-2 text-xs text-text-3">Members' money, owed back</dd>
      </div>
    </dl>
  );
}

/**
 * The full cash box for the asset page. Top: float, rewards reserved and in-flight payouts on one
 * scale with the cap marked. Bottom, separate: deposits (a liability, never revenue). Widths are
 * display ratios; every printed amount is exact bigint formatting.
 */
export function KasaBar({ ledger, floatCap }: { ledger: LedgerView; floatCap: string }) {
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
    <div className="space-y-6" aria-label="Asset cash box">
      <div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium">Operating float</span>
          <span className="num text-text-3">
            <span className="font-semibold text-text">{formatNear(float)}</span> / {formatNear(cap)} NEAR cap
          </span>
        </div>
        <div className="relative mt-3 h-2 rounded-full bg-track">
          <div className="absolute inset-y-0 left-0 flex overflow-hidden rounded-full" style={{ width: w(float + reserved + pending) }}>
            <span className="h-full bg-accent" style={{ width: `${displayRatio(float, float + reserved + pending || 1n) * 100}%` }} title="free float" />
            {reserved > 0n && <span className="h-full bg-sky-300" style={{ width: `${displayRatio(reserved, float + reserved + pending) * 100}%` }} title="reserved for task rewards" />}
            {pending > 0n && <span className="h-full bg-ice-200" style={{ width: `${displayRatio(pending, float + reserved + pending) * 100}%` }} title="in flight" />}
          </div>
          <span aria-hidden className="absolute -top-1 -bottom-1 w-px bg-text" style={{ left: `${capPct}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-text-3">
          <span className="flex flex-wrap gap-x-3">
            {reserved > 0n && (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full bg-sky-300" />
                <span className="num">{formatNear(reserved)}</span> reserved for rewards
              </span>
            )}
            {pending > 0n && (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full bg-ice-200" />
                <span className="num">{formatNear(pending)}</span> in flight
              </span>
            )}
            <span>{atCap ? 'At cap: new fees go to the DAO' : <><span className="num">{formatNear(cap - float)}</span> until cap</>}</span>
          </span>
          <span>Beyond the cap → DAO treasury</span>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium text-liability">Deposits held</span>
          <span className="num font-semibold text-liability">{formatNear(deposits)} NEAR</span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-track">
          <div className="h-full rounded-full bg-liability" style={{ width: deposits === 0n ? '0%' : `max(6px, ${w(deposits)})` }} />
        </div>
        <p className="mt-2 text-xs text-text-3">Members' money, owed back. Never used for fees, rewards, sweeps or bonds.</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-4">
        {(
          [
            ['Fees in', ledger.total_fees_in],
            ['Swept to DAO', ledger.total_swept],
            ['Refunded', ledger.total_refunded],
            ['Bonds paid', ledger.total_bonds_paid],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-text-3">{k}</dt>
            <dd className="num mt-0.5 text-lg font-medium">{formatNear(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
