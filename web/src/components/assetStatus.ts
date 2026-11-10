import type { BoardSnapshot } from '../data/hooks';
import type { Tone } from './Badges';

export interface AssetStatus {
  label: string;
  tone: Tone;
}

/** Character status for the machine card, from chain data only. */
export function assetStatus(snap: Pick<BoardSnapshot, 'service' | 'reservations' | 'rules'>): AssetStatus {
  if (!snap.service.in_service) return { label: 'Out of service', tone: 'danger' };
  const inSession = snap.reservations.find((r) => r.status === 'InSession');
  const openTask = snap.rules.find((r) => r.open_task !== null);
  const dueNoTask = snap.rules.find((r) => r.due && r.open_task === null);
  if (dueNoTask) return { label: 'Upkeep due', tone: 'due' };
  if (openTask) return { label: `Task #${openTask.open_task} open`, tone: 'due' };
  if (inSession) return { label: 'In session', tone: 'ok' };
  return { label: 'In service', tone: 'ok' };
}
