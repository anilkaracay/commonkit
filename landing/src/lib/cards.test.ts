import { describe, expect, it } from 'vitest';
import { demoLabel, machineCard, taskCard, taskOverrideLabel, type CardCtx } from './cards.ts';
import type { AssetSnap } from './chain.ts';

const ctx: CardCtx = {
  titles: { nozzle_clean: 'Clean the nozzle' },
  fileTriggers: { nozzle_clean: { Metric: { metric: 'nozzle_seconds', threshold: 720000 } } },
  overrides: [
    { kind: 'override', rule_id: 'nozzle_clean', value: '1800', proposal: 'makerlab-ck.sputnikv2.testnet#9', tx: 'At6Sw', at: '2026-11-10T05:13:46Z' },
    { kind: 'override', rule_id: 'bed_level', value: '1', proposal: 'makerlab-ck.sputnikv2.testnet#12', tx: 'G8Vb', at: '2026-11-10T05:35:24Z' },
    { kind: 'restore', rule_id: 'bed_level', value: '50', proposal: 'makerlab-ck.sputnikv2.testnet#15', tx: 'R15', at: '2026-11-10T05:36:47Z' },
  ],
  featuredTask: null,
  rightValidityDays: 60,
  icon: '',
  live: false,
  at: '2026-11-10T05:00:00Z',
};
const ns = (iso: string) => (BigInt(Date.parse(iso)) * 1_000_000n).toString();
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
    expect(l).toContain('makerlab-ck#9');
    expect(l).toContain('every 200 h of printing');
    expect(demoLabel('nozzle_clean', ctx.fileTriggers.nozzle_clean!, ctx)).toBe('');
  });
  it('says "waiting for the agent" when due and no task is open, and shows the task once open', () => {
    expect(taskCard(asset(true), ctx)).toContain('Due — waiting for the agent to open the task.');
    const open = taskCard(asset(true, [{ id: '0', rule_id: 'nozzle_clean', kind: 'Maintenance', status: 'Open', rationale: 'crossed', opened_by: 'agent.commonkit-sxflo.testnet', claimer: null, verifier: null, reward_rights: 2, created_at: ns('2026-11-10T05:20:00Z') }]), ctx);
    expect(open).toContain('UPKEEP TASK #0');
    expect(open).not.toContain('waiting for the agent');
  });
  it('labels tasks opened under a demo override, and its restore', () => {
    const t = (rule: string, at: string) => ({ id: '1', rule_id: rule, kind: 'Maintenance', status: 'Open', rationale: '', opened_by: 'agent', claimer: null, verifier: null, reward_rights: 1, created_at: ns(at) });
    const bed = taskOverrideLabel(t('bed_level', '2026-11-10T05:35:40Z'), ctx);
    expect(bed).toContain('Opened under demo override');
    expect(bed).toContain('bed_level 1');
    expect(bed).toContain('makerlab-ck#12');
    expect(bed).toContain('restored to 50');
    expect(bed).toContain('makerlab-ck#15');
    expect(taskOverrideLabel(t('bed_level', '2026-11-10T06:00:00Z'), ctx)).toBe('');
    expect(taskOverrideLabel(t('nozzle_clean', '2026-11-10T05:20:00Z'), ctx)).toContain('nozzle_clean 30 min of printing');
  });
});
