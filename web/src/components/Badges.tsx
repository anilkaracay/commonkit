import { deviceOf } from '../data/devices';
import type { ReactNode } from 'react';

/**
 * Always shown on simulated assets and anything they produce. With `assetId` it also names the
 * device kind from the bridge config, so one badge says everything: "SIMULATED · EMULATED DEVICE".
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
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-sim bg-sim-soft px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.08em] text-sim ${className}`}
      title={title}
    >
      <svg aria-hidden width="10" height="10" viewBox="0 0 10 10">
        <path d="M1 9 9 1M1 5l4-4M5 9l4-4" stroke="currentColor" strokeWidth="1.3" />
      </svg>
      SIMULATED
      {device && <span className="font-normal tracking-[0.04em] uppercase opacity-80">· {device}</span>}
    </span>
  );
}

export function NonTransferableBadge() {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase">
      <svg aria-hidden width="10" height="11" viewBox="0 0 10 11" fill="none">
        <rect x="1" y="4.5" width="8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
        <path d="M3 4.5V3a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      non-transferable
    </span>
  );
}

export type Tone = 'alive' | 'due' | 'danger' | 'liability' | 'sim' | 'muted';

const toneClass: Record<Tone, string> = {
  alive: 'bg-alive-soft text-alive',
  due: 'bg-due-soft text-due',
  danger: 'bg-danger-soft text-danger',
  liability: 'bg-liability-soft text-liability',
  sim: 'bg-sim-soft text-sim',
  muted: 'bg-surface-2 text-ink-2',
};

export function Pill({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${toneClass[tone]}`}>
      {children}
    </span>
  );
}

export function MockBanner() {
  return (
    <div
      role="note"
      className="sticky top-0 z-40 bg-due-fill px-4 py-1 text-center font-mono text-[11px] font-bold tracking-[0.12em] text-[#1d1b16]"
    >
      MOCK DATA · not from testnet · for design only
    </div>
  );
}

export function keylessLabel(keyless: boolean | 'pending'): string {
  return keyless === true ? 'keyless' : keyless === 'pending' ? 'key deletion pending' : 'has keys';
}
