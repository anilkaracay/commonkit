// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { RuleStatus } from '../data/types';
import { describeTrigger, formatMetric, mostDueRule, ruleProgress } from '../lib/metrics';

const base = { due: false, next_due_estimate: null, open_task: null } as const;
const rw = { reward_rights: 1, reward_cash: '0', reimbursable_max: '0' };

describe('upkeep rule progress per trigger', () => {
  it('Metric: delta since baseline against threshold', () => {
    const r: RuleStatus = { ...base, rule_id: 'nozzle', kind: 'Maintenance', trigger: { Metric: { metric: 'nozzle_seconds', threshold: 1800 } }, current: '2950', baseline: '1830', due_value: '1120', ...rw };
    const p = ruleProgress(r);
    expect(p.used).toBe(1120n);
    expect(p.remaining).toBe(680n);
    expect(p.format(p.remaining)).toBe('11 min');
    expect(p.fraction).toBeCloseTo(0.6222, 3);
  });

  it('Schedule: hours since last against the interval', () => {
    const r: RuleStatus = { ...base, rule_id: 'check', kind: 'Inspection', trigger: { Schedule: { every_hours: 168 } }, current: '47', baseline: '0', due_value: '47', ...rw };
    const p = ruleProgress(r);
    expect(p.format(p.remaining)).toBe('5 d 1 h');
    expect(describeTrigger(r.trigger)).toBe('every 7 d');
  });

  it('Report: active reports against min_reports', () => {
    const r: RuleStatus = { ...base, rule_id: 'fault', kind: 'Repair', trigger: { Report: { min_reports: 2 } }, current: '2', baseline: '0', due_value: '2', ...rw };
    expect(ruleProgress(r).fraction).toBe(1);
    expect(describeTrigger(r.trigger)).toBe('2 fault reports');
  });

  it('picks the most due rule and formats counters', () => {
    const a: RuleStatus = { ...base, rule_id: 'a', kind: 'Cleaning', trigger: { Metric: { metric: 'cycles', threshold: 30 } }, current: '41', baseline: '31', due_value: '10', ...rw };
    const b: RuleStatus = { ...base, rule_id: 'b', kind: 'Maintenance', trigger: { Metric: { metric: 'cycles', threshold: 120 } }, current: '41', baseline: '0', due_value: '41', ...rw };
    expect(mostDueRule([a, b])?.rule.rule_id).toBe('b');
    expect(formatMetric('filament_mm', '341500')).toBe('341,500');
    expect(formatMetric('run_seconds', 7380)).toBe('2 h');
  });
});
