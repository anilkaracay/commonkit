import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVIDENCE_DIR, TGAS } from '../../lib/config.js';
import { fileProfile, metricThreshold, withRule } from '../lib/actions.js';
import { runLimitsDemo } from '../lib/agent.js';
import type { DemoContext } from '../lib/context.js';
import type { DemoStep } from '../lib/runner.js';
import { printerDemoProfile } from './step-01.js';

/** Demo overrides for the limits run (each a labelled DAO proposal, restored afterwards). */
export const WASHER_QUOTA_OVERRIDE = 2; // < filter_clean's 3-right reward
const BED_LEVEL_OVERRIDE = 1; // jobs since baseline ≥ 1 → due, so the agent can open it once

interface Attempt {
  id: string;
  spec: string;
  expected: string[];
  status: string;
  code: string | null;
  tx_hash: string | null;
  pass: boolean;
}

export const step16: DemoStep = {
  n: 16,
  title: 'Agent limits: not due, duplicate task, over quota, after revocation — each refused on chain',
  core: false,
  simulated: false,
  negative: true,
  async run(ctx: DemoContext) {
    const { cast, rec, gov } = ctx;
    const printer = ctx.asset(cast.printer);
    const washer = ctx.asset(cast.washer);
    const laser = ctx.asset(cast.laser);
    const washerFile = fileProfile('washer-01');
    const op = (p: object) => [{ method_name: 'set_profile', args: { profile: p }, gas: 30n * TGAS }];
    const ops = (bridge: string, agent: string | null) => [{ method_name: 'set_operators', args: { bridge_id: bridge, agent_id: agent }, gas: 30n * TGAS }];

    if (!ctx.own('limits_done')) {
      // 1. Preconditions through the DAOs (labelled demo overrides).
      if ((await washer.profile()).period_reward_quota !== WASHER_QUOTA_OVERRIDE)
        await gov.override(cast.dormB, cast.washer, op({
          ...withRule(washerFile, 'filter_clean', { trigger: { Metric: { metric: 'cycles', threshold: 1 } } }),
          period_reward_quota: WASHER_QUOTA_OVERRIDE,
        }), [
          { kind: 'override', rule_id: 'filter_clean', value: 1, production: metricThreshold(washerFile, 'filter_clean')! },
          { kind: 'override', rule_id: 'period_reward_quota', value: WASHER_QUOTA_OVERRIDE, production: washerFile.period_reward_quota },
        ], 'quota demo (restored after the limits run)');
      const bed = await printer.rule('bed_level');
      if (bed.open_task === null && metricThreshold(await printer.profile(), 'bed_level') !== BED_LEVEL_OVERRIDE)
        await gov.override(cast.makerlab, cast.printer, op(
          withRule(printerDemoProfile(), 'bed_level', { trigger: { Metric: { metric: 'jobs_total', threshold: BED_LEVEL_OVERRIDE } } }),
        ), [{ kind: 'override', rule_id: 'bed_level', value: BED_LEVEL_OVERRIDE, production: metricThreshold(printerDemoProfile(), 'bed_level')! }], 'one rule due for the duplicate-task attempt (restored after the limits run)');
      if ((await laser.wiring()).agent_id !== null)
        await gov.override(cast.makerlab, cast.laser, ops(cast.bridge, null), [{ kind: 'override', rule_id: 'agent_id', value: 'null', production: cast.agent }], 'agent revoked for the E_NOT_AGENT attempt (restored after the limits run)');

      // 2. The agent's own limits script with its function-call keys (writes evidence/agent-limits.json).
      console.log('  running agent/src/limits-demo.ts --chain near --send-testnet-transactions');
      const r = await runLimitsDemo(cast.laser, cast.washer);
      console.log(r.out.trim().split('\n').map((l) => `    ${l}`).join('\n'));
      rec.out('limits_done', '1');
      rec.out('limits_exit', String(r.code));
    }

    // 3. Restore everything the overrides changed (each through the DAO again).
    if ((await laser.wiring()).agent_id !== cast.agent)
      await gov.override(cast.makerlab, cast.laser, ops(cast.bridge, cast.agent), [{ kind: 'restore', rule_id: 'agent_id', value: cast.agent, production: cast.agent }], 'after the revocation demo');
    if ((await washer.profile()).period_reward_quota !== washerFile.period_reward_quota)
      await gov.override(cast.dormB, cast.washer, op(washerFile), [
        { kind: 'restore', rule_id: 'filter_clean', value: metricThreshold(washerFile, 'filter_clean')!, production: metricThreshold(washerFile, 'filter_clean')! },
        { kind: 'restore', rule_id: 'period_reward_quota', value: washerFile.period_reward_quota, production: washerFile.period_reward_quota },
      ], 'after the quota demo');
    if (metricThreshold(await printer.profile(), 'bed_level') !== metricThreshold(printerDemoProfile(), 'bed_level'))
      await gov.override(cast.makerlab, cast.printer, op(printerDemoProfile()), [{ kind: 'restore', rule_id: 'bed_level', value: metricThreshold(printerDemoProfile(), 'bed_level')!, production: metricThreshold(printerDemoProfile(), 'bed_level')! }], 'after the duplicate-task demo');

    // 4. Assertions from the agent's report.
    const path = join(EVIDENCE_DIR, 'agent-limits.json');
    if (!existsSync(path)) throw new Error('evidence/agent-limits.json missing');
    const report = JSON.parse(readFileSync(path, 'utf8')) as { chain: string; attempts: Attempt[]; all_passed: boolean };
    rec.eq('limits report is a testnet run', report.chain, 'near');
    for (const a of report.attempts) {
      rec.check(`${a.spec} → ${a.expected.join(' | ')}`, a.pass, `${a.status} ${a.code ?? ''}${a.tx_hash ? ` tx ${a.tx_hash}` : ' (refused before execution, no tx)'}`);
      if (a.tx_hash) rec.externalTx(`agent key: ${a.id} (${a.code ?? a.status})`, a.tx_hash, cast.agent, a.status !== 'rejected');
    }
    const codes = report.attempts.map((a) => a.code);
    for (const code of ['E_RULE_NOT_DUE', 'E_TASK_ALREADY_OPEN', 'E_QUOTA_EXCEEDED', 'E_NOT_AGENT'])
      rec.check(`exact code ${code} shown`, codes.includes(code));
    rec.eq('laser-01 agent restored', (await laser.wiring()).agent_id, cast.agent);
    rec.eq('washer-01 quota restored', (await washer.profile()).period_reward_quota, washerFile.period_reward_quota);
    rec.eq('printer-01 bed_level threshold restored', metricThreshold(await printer.profile(), 'bed_level'), metricThreshold(printerDemoProfile(), 'bed_level'));
  },
};
