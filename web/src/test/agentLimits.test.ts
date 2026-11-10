import { describe, expect, it } from 'vitest';
import { bundledAgentLimits, normalizeAgentLimits } from '../data/bundled';

describe('agent limits evidence', () => {
  it('reads the { attempts } file the limits demo writes', () => {
    const rows = normalizeAgentLimits({
      attempts: [{ spec: 'Open a task for a rule that is not due', expected: ['E_RULE_NOT_DUE'], code: 'E_RULE_NOT_DUE', pass: true, tx_hash: 'abc' }],
    });
    expect(rows).toEqual([{ attempt: 'Open a task for a rule that is not due', expected: 'E_RULE_NOT_DUE', observed: 'E_RULE_NOT_DUE', ok: true, tx_hash: 'abc' }]);
  });

  it('keeps a flat list as it is and never throws on junk', () => {
    const flat = [{ attempt: 'a', expected: 'E_X', observed: 'E_X', ok: true, tx_hash: null }];
    expect(normalizeAgentLimits(flat)).toBe(flat);
    expect(normalizeAgentLimits(null)).toEqual([]);
    expect(normalizeAgentLimits({ kind: 'x' })).toEqual([]);
  });

  it('the bundled evidence file yields an array', () => {
    expect(Array.isArray(bundledAgentLimits())).toBe(true);
  });
});
