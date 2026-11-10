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
        await gov.call(cast.dormB, `DEMO OVERRIDE washer-01: period_reward_quota ${WASHER_QUOTA_OVERRIDE}, filter_clean threshold 1 (quota demo; restored below)`, cast.washer, op({
          ...withRule(washerFile, 'filter_clean', { trigger: { Metric: { metric: 'cycles', threshold: 1 } } }),
          period_reward_quota: WASHER_QUOTA_OVERRIDE,
        }));
      const bed = await printer.rule('bed_level');
      if (bed.open_task === null && metricThreshold(await printer.profile(), 'bed_level') !== BED_LEVEL_OVERRIDE)
        await gov.call(cast.makerlab, `DEMO OVERRIDE printer-01: bed_level threshold ${BED_LEVEL_OVERRIDE} job so one rule is due for the duplicate-task attempt (restored below)`, cast.printer, op(
          withRule(printerDemoProfile(), 'bed_level', { trigger: { Metric: { metric: 'jobs_total', threshold: BED_LEVEL_OVERRIDE } } }),
        ));
      if ((await laser.wiring()).agent_id !== null)
        await gov.call(cast.makerlab, 'set_operators laser-01: agent revoked (agent_id = null); restored below', cast.laser, ops(cast.bridge, null));

      // 2. The agent's own limits script with its function-call keys (writes evidence/agent-limits.json).
      console.log('  running agent/src/limits-demo.ts --chain near --send-testnet-transactions');
      const r = await runLimitsDemo(cast.laser, cast.washer);
      console.log(r.out.trim().split('\n').map((l) => `    ${l}`).join('\n'));
      rec.out('limits_done', '1');
      rec.out('limits_exit', String(r.code));
    }

    // 3. Restore everything the overrides changed (each through the DAO again).
    if ((await laser.wiring()).agent_id !== cast.agent)
      await gov.call(cast.makerlab, 'set_operators laser-01: restore bridge + agent after the revocation demo', cast.laser, ops(cast.bridge, cast.agent));
    if ((await washer.profile()).period_reward_quota !== washerFile.period_reward_quota)
      await gov.call(cast.dormB, 'restore washer-01 profile after the quota demo', cast.washer, op(washerFile));
    if (metricThreshold(await printer.profile(), 'bed_level') !== metricThreshold(printerDemoProfile(), 'bed_level'))
      await gov.call(cast.makerlab, 'restore printer-01 profile (bed_level threshold) after the duplicate-task demo', cast.printer, op(printerDemoProfile()));

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
