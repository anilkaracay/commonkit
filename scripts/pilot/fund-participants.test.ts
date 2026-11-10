import { describe, expect, it } from 'vitest';
import { fundingPlan } from './fund-participants.js';

const p = (account_id: string, consent = 'video') => ({ account_id, consent, consented_at: '2026-11-12T10:00:00Z' });

describe('pilot funding plan', () => {
  it('funds each consenting testnet account once', () => {
    const plan = fundingPlan([p('a.testnet'), p('b.testnet', 'no-video'), p('a.testnet')], []);
    expect(plan.fund).toEqual(['a.testnet', 'b.testnet']);
    expect(plan.skipped).toEqual([{ account_id: 'a.testnet', why: 'listed twice' }]);
  });
  it('skips accounts already funded and non-testnet accounts', () => {
    const plan = fundingPlan([p('a.testnet'), p('x.near')], [{ account_id: 'a.testnet', amount_near: '2', tx: 'H', ok: true, at: 't' }]);
    expect(plan.fund).toEqual([]);
    expect(plan.skipped.map((s) => s.why)).toEqual(['already funded', 'not a testnet account']);
  });
  it('rejects personal data or missing consent', () => {
    expect(() => fundingPlan([{ ...p('a.testnet'), name: 'Ayşe' }], [])).toThrow();
    expect(() => fundingPlan([{ account_id: 'a.testnet' }], [])).toThrow();
    expect(() => fundingPlan([p('a.testnet', 'maybe')], [])).toThrow();
  });
});
