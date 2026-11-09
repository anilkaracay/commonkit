import type { AssetSnapshot } from '../data/hooks';
import type { Tone } from './Badges';

export interface AssetStatus {
  label: string;
  tone: Tone;
}

/** Character status for the nameplate, from chain data only. */
export function assetStatus(snap: AssetSnapshot): AssetStatus {
  if (!snap.service.in_service) return { label: 'out of service', tone: 'danger' };
  const inSession = snap.reservations.find((r) => r.status === 'InSession');
  const openTask = snap.rules.find((r) => r.open_task !== null);
  const dueNoTask = snap.rules.find((r) => r.due && r.open_task === null);
  if (dueNoTask) return { label: 'maintenance due', tone: 'due' };
  if (openTask) return { label: `needs care · task #${openTask.open_task}`, tone: 'due' };
  if (inSession) return { label: 'in session', tone: 'alive' };
  return { label: 'ready', tone: 'alive' };
}
