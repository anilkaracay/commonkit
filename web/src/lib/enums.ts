/** Helpers for serde-shaped enums (`"Unit"` or `{ Variant: {...} }`). */
import type { Card, RewardState, RightStatus } from '../data/types';

export function variantOf(v: string | Record<string, unknown>): string {
  return typeof v === 'string' ? v : (Object.keys(v)[0] ?? 'Unknown');
}

export function rightStatusLabel(s: RightStatus): 'Active' | 'Locked' | 'Consumed' {
  return s.state;
}

export function rewardStateLabel(s: RewardState): string {
  return typeof s === 'string' ? s : `Failed: ${s.Failed.reason}`;
}

export function isUsageRight(card: Card): card is Card & { kind: Extract<Card['kind'], { type: 'UsageRight' }> } {
  return card.kind.type === 'UsageRight';
}

export function isCredential(card: Card): card is Card & { kind: Extract<Card['kind'], { type: 'Credential' }> } {
  return card.kind.type === 'Credential';
}

export function shortAccount(id: string): string {
  const first = id.split('.')[0] ?? id;
  return first.length > 22 ? `${first.slice(0, 10)}…${first.slice(-6)}` : first;
}
