import { deviceOf } from '../data/devices';
import type { ReactNode } from 'react';

/** Always shown on simulator assets and anything they produce. Never optional. */
export function SimulatedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-sim bg-sim-soft px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.08em] text-sim ${className}`}
      title="This asset is driven by the simulator adapter. No physical machine."
    >
      <svg aria-hidden width="10" height="10" viewBox="0 0 10 10">
        <path d="M1 9 9 1M1 5l4-4M5 9l4-4" stroke="currentColor" strokeWidth="1.3" />
      </svg>
      SIMULATED
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

/**
 * Device label from the bridge config (data/devices.ts): SIMULATOR for the scenario simulator,
 * EMULATED DEVICE for a real adapter against an emulated device. Nothing if the bridge does not run it.
 */
export function DeviceBadge({ assetId }: { assetId: string }) {
  const d = deviceOf(assetId);
  if (!d || d.kind === 'device') return null;
  const sim = d.kind === 'simulator';
  return (
    <span
      className="inline-flex items-center rounded-full border border-dashed border-sim px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-sim uppercase"
      title={sim ? 'Telemetry from a simulator scenario (bridge/config.emulated.yaml)' : `Real ${d.adapter} adapter talking to an emulated device (bridge/config.emulated.yaml)`}
    >
      {sim ? 'simulator' : 'emulated device'}
    </span>
  );
}

export function keylessLabel(keyless: boolean | 'pending'): string {
  return keyless === true ? 'keyless' : keyless === 'pending' ? 'key deletion pending' : 'has keys';
}
