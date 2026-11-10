import { deviceOf } from '../data/devices';
import type { ReactNode } from 'react';

/**
 * Always shown on simulated assets and anything they produce: a quiet outlined square and the word
 * SIMULATED. With `assetId` it also names the device kind from the bridge config.
 */
export function SimulatedBadge({ className = '', assetId }: { className?: string; assetId?: string }) {
  const d = assetId ? deviceOf(assetId) : null;
  const device = d?.kind === 'simulator' ? 'simulator' : d?.kind === 'emulated' ? 'emulated device' : null;
  const title = device === 'simulator'
    ? 'Simulated: telemetry comes from a simulator scenario. No physical machine.'
    : device === 'emulated device'
      ? `Simulated: the real ${d?.adapter} adapter talks to an emulated device. No physical machine.`
      : 'Simulated asset. No physical machine.';
  return (
    <span data-mark="sim" className={`inline-flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-sim ${className}`} title={title}>
      <span aria-hidden className="size-[9px] rounded-[2px] border-[1.5px] border-current" />
      <span className="text-[11px] font-semibold tracking-[0.08em]">SIMULATED</span>
      {device && <span>· {device}</span>}
    </span>
  );
}

export function NonTransferableBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium">
      <svg aria-hidden width="10" height="11" viewBox="0 0 10 11" fill="none">
        <rect x="1" y="4.5" width="8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
        <path d="M3 4.5V3a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      non-transferable
    </span>
  );
}

/** ok = blue (in service, done), due = orange (upkeep open or due), danger = red (refused, out), quiet = grey. */
export type Tone = 'ok' | 'due' | 'danger' | 'quiet';

const dot: Record<Tone, string> = {
  ok: 'bg-blue-500',
  due: 'bg-due-fill',
  danger: 'bg-danger',
  quiet: 'bg-slate-400',
};
const text: Record<Tone, string> = {
  ok: 'text-text-2',
  due: 'text-due',
  danger: 'text-danger',
  quiet: 'text-text-3',
};

/** A status mark: dot plus words, never colour alone. Cards and rows carry at most two marks. */
export function Mark({ tone = 'quiet', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span data-mark="status" className={`inline-flex items-center gap-1.5 text-sm whitespace-nowrap ${text[tone]}`}>
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${dot[tone]}`} />
      {children}
    </span>
  );
}

export function MockBanner() {
  return (
    <div role="note" className="sticky top-0 z-40 bg-inverse px-4 py-1.5 text-center text-xs font-medium tracking-[0.06em] text-inverse-text">
      MOCK DATA · not from testnet · for design only
    </div>
  );
}

export function keylessLabel(keyless: boolean | 'pending'): string {
  return keyless === true ? 'keyless' : keyless === 'pending' ? 'key deletion pending' : 'has keys';
}
