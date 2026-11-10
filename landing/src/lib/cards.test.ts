import { describe, expect, it } from 'vitest';
import { demoLabel, machineCard, taskCard, type CardCtx } from './cards.ts';
import type { AssetSnap } from './chain.ts';

const ctx: CardCtx = {
  titles: { nozzle_clean: 'Clean the nozzle' },
  fileTriggers: { nozzle_clean: { Metric: { metric: 'nozzle_seconds', threshold: 720000 } } },
  overrides: { nozzle_clean: { dao: 'makerlab-ck.sputnikv2.testnet', proposal: '9', tx: 'At6Sw' } },
  rightValidityDays: 60,
  icon: '',
  live: false,
  at: '2026-11-10T05:00:00Z',
};
const asset = (due: boolean, tasks: AssetSnap['tasks'] = []): AssetSnap => ({
  account: 'printer-01.makerlab.commonkit-sxflo.testnet',
  community: 'makerlab',
  dao: 'makerlab-ck.sputnikv2.testnet',
  asset_type: 'printer_3d',
  display_name: 'Makerlab 3D printer',
  in_service: true,
  ledger: { float_free: '0', float_cap: '3000000000000000000000000', deposits_held: '0', rewards_reserved: '0', total_fees_in: '0', total_swept: '0', total_rewards_paid: '0', invariant_ok: true },
  rules: [
    { rule_id: 'nozzle_clean', kind: 'Maintenance', trigger: { Metric: { metric: 'nozzle_seconds', threshold: 1800 } }, current: due ? '14400' : '600', baseline: '0', due_value: '0', due, next_due_estimate: null, open_task: null, reward_rights: 2, reward_cash: '0', reimbursable_max: '0' },
  ],
  tasks,
  code_hash: 'x',
  full_access_keys: 0,
});

describe('hero cards', () => {
  it('reads the gauge as "printed since the last clean" plus the rule', () => {
    const html = machineCard(asset(true), ctx);
    expect(html).toContain('240</b> <span class="muted">min of printing since the last nozzle_clean');
    expect(html).toContain('rule: every 30 min of printing');
    expect(html).toContain('due-chip');
  });
  it('labels a lowered threshold with its DAO proposal and the production value', () => {
    const l = demoLabel('nozzle_clean', { Metric: { metric: 'nozzle_seconds', threshold: 1800 } }, ctx);
    expect(l).toContain('Demo threshold');
    expect(l).toContain('#9');
    expect(l).toContain('every 200 h of printing');
    expect(demoLabel('nozzle_clean', ctx.fileTriggers.nozzle_clean!, ctx)).toBe('');
  });
  it('says "waiting for the agent" when due and no task is open, and shows the task once open', () => {
    expect(taskCard(asset(true), ctx)).toContain('Due — waiting for the agent to open the task.');
    const open = taskCard(asset(true, [{ id: '0', rule_id: 'nozzle_clean', kind: 'Maintenance', status: 'Open', rationale: 'crossed', opened_by: 'agent.commonkit-sxflo.testnet', claimer: null, verifier: null, reward_rights: 2 }]), ctx);
    expect(open).toContain('UPKEEP TASK #0');
    expect(open).not.toContain('waiting for the agent');
  });
});
