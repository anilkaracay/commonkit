import { describe, expect, it } from 'vitest';
import { near, triggerText, int, shortAccount, relTime } from './format';

describe('format', () => {
  it('formats yoctoNEAR with bigint math', () => {
    expect(near('3000000000000000000000000')).toBe('3');
    expect(near('250000000000000000000000')).toBe('0.25');
    expect(near('1050000000000000000000000')).toBe('1.05');
    expect(near(0n)).toBe('0');
  });
  it('describes triggers in plain words', () => {
    expect(triggerText({ Metric: { metric: 'nozzle_seconds', threshold: 720000 } })).toBe('every 200 h of printing');
    expect(triggerText({ Schedule: { every_hours: 168 } })).toBe('every week');
    expect(triggerText({ Schedule: { every_hours: 720 } })).toBe('every 30 days');
    expect(triggerText({ Report: { min_reports: 2 } })).toBe('after 2 fault reports');
  });
  it('formats ints, accounts and relative time', () => {
    expect(int(468037)).toBe('468,037');
    expect(shortAccount('printer-01.makerlab.commonkit-sxflo.testnet')).toBe('printer-01.makerlab…');
    expect(relTime('2026-11-10T00:00:00Z', Date.parse('2026-11-10T03:00:00Z'))).toBe('3 h ago');
  });
});
