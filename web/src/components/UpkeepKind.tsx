import type { UpkeepKind } from '../data/types';

/** One glyph per upkeep kind (D-017). 16px grid, currentColor. */
const glyph: Record<UpkeepKind, string> = {
  Maintenance: 'M10.5 2.5a3 3 0 0 0-3.9 3.9L2.5 10.5l1.9 1.9 4.1-4.1a3 3 0 0 0 3.9-3.9l-1.8 1.8-1.6-.3-.3-1.6z',
  Restock: 'M2.5 5.5 8 2.5l5.5 3v5L8 13.5l-5.5-3zM2.5 5.5 8 8.5l5.5-3M8 8.5v5',
  Cleaning: 'M8 2.5c2 3 3.5 4.6 3.5 6.5a3.5 3.5 0 0 1-7 0c0-1.9 1.5-3.5 3.5-6.5z',
  Inspection: 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM10.3 10.3l3.2 3.2M5 7l1.5 1.5L9 6',
  Repair: 'M3 13l5-5M9.5 2.5l4 4-2 2-4-4zM2.5 11.5l2 2',
  Rebalance: 'M8 2.5v11M3 5.5h10M3 5.5 1.5 9h3zM13 5.5 11.5 9h3zM5.5 13.5h5',
  Supervision: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
};

export const KIND_LABEL: Record<UpkeepKind, string> = {
  Maintenance: 'Maintenance',
  Restock: 'Restock',
  Cleaning: 'Cleaning',
  Inspection: 'Inspection',
  Repair: 'Repair',
  Rebalance: 'Rebalance',
  Supervision: 'Supervision',
};

export function KindIcon({ kind, size = 14 }: { kind: UpkeepKind; size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={glyph[kind]} />
    </svg>
  );
}

/** Icon + label shown on every task row. */
export function KindChip({ kind }: { kind: UpkeepKind }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-3">
      <KindIcon kind={kind} size={13} />
      {KIND_LABEL[kind]}
    </span>
  );
}
