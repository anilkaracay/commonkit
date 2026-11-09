import { describe, expect, it } from 'vitest';
import { crossFieldErrors } from './validate-profiles.js';

const base = () => ({
  profile: {
    deposit: '10',
    deposit_trusted: '5',
    auto_reward_cash_cap: '100',
    council_threshold_cash: '50',
    protocol_fee_bps: 0,
    rules: [{ rule_id: 'a', reward_cash: '0' }] as {
      rule_id: string;
      kind?: string;
      reward_cash: string;
      reimbursable_max?: string;
    }[],
  },
  meta: { purchase_hints: [{ rule_id: 'a' }] },
});

describe('crossFieldErrors', () => {
  it('accepts a consistent profile', () => expect(crossFieldErrors(base())).toEqual([]));
  it('rejects deposit_trusted > deposit', () => {
    const p = base();
    p.profile.deposit_trusted = '11';
    expect(crossFieldErrors(p)).toContain('deposit_trusted > deposit');
  });
  it('rejects duplicate rule ids and cash above cap', () => {
    const p = base();
    p.profile.rules.push({ rule_id: 'a', reward_cash: '101' });
    expect(crossFieldErrors(p)).toEqual([
      'duplicate rule_id a',
      'rule a: reward_cash > auto_reward_cash_cap',
    ]);
  });
  it('rejects reimbursement on non-Restock/Repair rules', () => {
    const p = base();
    p.profile.rules = [{ rule_id: 'a', kind: 'Cleaning', reward_cash: '0', reimbursable_max: '1' }];
    expect(crossFieldErrors(p)).toEqual(['rule a: reimbursable_max only allowed for Restock/Repair']);
    p.profile.rules = [{ rule_id: 'a', kind: 'Restock', reward_cash: '0', reimbursable_max: '1' }];
    expect(crossFieldErrors(p)).toEqual([]);
  });
  it('rejects purchase hints for unknown rules', () => {
    const p = base();
    p.meta.purchase_hints = [{ rule_id: 'x' }];
    expect(crossFieldErrors(p)).toEqual(['purchase_hint references unknown rule x']);
  });
});
