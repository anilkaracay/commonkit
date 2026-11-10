import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UpkeepGauge } from '../components/UpkeepGauge';
import type { RuleStatus, UpkeepRule } from '../data/types';

const trigger = { Metric: { metric: 'nozzle_seconds', threshold: 1800 } } as const;
const def: UpkeepRule = { rule_id: 'nozzle_clean', kind: 'Maintenance', trigger, title: 'Nozzle cleaning', reward_rights: 2, reward_cash: '0', reimbursable_max: '0', requires_verification_test: true, claim_timeout_hours: 72 };
const status = (due_value: string): RuleStatus => ({
  rule_id: 'nozzle_clean', kind: 'Maintenance', trigger, current: due_value, baseline: '0', due_value, due: Number(due_value) >= 1800,
  next_due_estimate: null, open_task: null, reward_rights: 2, reward_cash: '0', reimbursable_max: '0',
});

describe('upkeep gauge', () => {
  it('says "Due now" with the real figure in words instead of a percentage over 100', () => {
    render(<UpkeepGauge rules={[status('14400')]} ruleDefs={[def]} />);
    expect(screen.getByText('Due now')).toBeInTheDocument();
    expect(screen.getByText('4 h nozzle time · rule every 30 min')).toBeInTheDocument();
    expect(screen.queryByText(/\d{3,}%/)).toBeNull();
  });

  it('shows at most 99 % while not due', () => {
    render(<UpkeepGauge rules={[status('1799')]} ruleDefs={[def]} />);
    expect(screen.getByText('99%')).toBeInTheDocument();
  });
});
