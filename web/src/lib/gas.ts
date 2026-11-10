/**
 * Attached gas per contract method, mirroring docs/CONTRACT_SPEC.md §8 ("Recommended attached
 * gas for callers"). Unused gas is refunded, so these are ceilings, not costs. The wallet uses
 * `gasFor` for every call; nothing else in the app picks a gas number.
 */
export const TGAS = 1_000_000_000_000n;

export const GAS = {
  reserve: 120n * TGAS,
  /** cancel_reservation / mark_no_show when the reservation locked a right (D-756: 60 Tgas ran out). */
  releasesRight: 150n * TGAS,
  /** cancel_reservation / mark_no_show without a right. */
  noRight: 60n * TGAS,
  standard60: 60n * TGAS,
  /** approve_task / council_approve_task / retry_reward: the contract enforces ≥ 125 Tgas. */
  reward: 125n * TGAS,
  dao50: 50n * TGAS,
  other: 30n * TGAS,
} as const;

const SIXTY = new Set([
  'confirm_return',
  'resolve_dispute',
  'claim_fee_refund',
  'retry_op',
  'fund_float',
  'sweep',
  'reject_task',
  'cancel_task',
  'escalate',
]);
const REWARD = new Set(['approve_task', 'council_approve_task', 'retry_reward']);
const DAO50 = new Set(['sync_escalation', 'refresh_dao_policy']);

export interface GasContext {
  /** The reservation being cancelled / marked no-show holds a right (`right_id` set). */
  usesRight?: boolean;
}

export function gasFor(method: string, ctx: GasContext = {}): bigint {
  if (method === 'reserve') return GAS.reserve;
  if (method === 'cancel_reservation' || method === 'mark_no_show') return ctx.usesRight ? GAS.releasesRight : GAS.noRight;
  if (SIXTY.has(method)) return GAS.standard60;
  if (REWARD.has(method)) return GAS.reward;
  if (DAO50.has(method)) return GAS.dao50;
  return GAS.other;
}
