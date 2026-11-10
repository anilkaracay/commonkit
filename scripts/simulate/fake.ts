/**
 * `--fake` mode (D-420): runs bridge/scripts/simulate-fake.ts (bridge + agent in-process on their
 * in-memory fake chains) as a child process and reads its result. No contract code runs.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runProc } from '../demo/lib/procs.js';
import type { LoopResult } from './loop.js';
import type { Plan } from './plan.js';

export async function runFakeLoop(repoRoot: string, plan: Plan, runDir: string, log: (m: string) => void): Promise<LoopResult> {
  const dir = join(runDir, plan.assetType);
  mkdirSync(dir, { recursive: true });
  const input = join(dir, 'fake-input.json');
  const out = join(dir, 'fake-result.json');
  writeFileSync(
    input,
    JSON.stringify({
      assetType: plan.assetType,
      scenarioFile: plan.scenarioFile,
      demoProfile: plan.demoProfile,
      rule: { rule_id: plan.rule.rule_id, kind: plan.rule.kind, requires_verification_test: plan.rule.requires_verification_test, reward_rights: plan.rule.reward_rights },
      expense: plan.expense.toString(),
      telemetryIntervalSec: plan.sim.telemetry_interval_sec,
      ...(plan.sim.gauges ? { gauges: plan.sim.gauges } : {}),
    }),
  );
  for (const o of plan.overrides) log(`     DEMO OVERRIDE ${o.field}: ${o.from} → ${o.to}  [${o.why}]`);
  const bridgeDir = join(repoRoot, 'bridge');
  const t0 = Date.now();
  const r = await runProc(join(bridgeDir, 'node_modules', '.bin', 'tsx'), ['scripts/simulate-fake.ts', '--input', input, '--out', out], { cwd: bridgeDir });
  for (const line of r.out.split('\n').filter((l) => l.startsWith('[SIMULATED]'))) console.log(line);
  try {
    return { ...(JSON.parse(readFileSync(out, 'utf8')) as LoopResult), rule: `${plan.rule.rule_id} (${plan.rule.kind})` };
  } catch {
    const tail = r.out.trim().split('\n').slice(-5).join(' | ');
    return { assetType: plan.assetType, assetId: '', mode: 'fake', ok: false, ms: Date.now() - t0, steps: [], codeHash: null, invariantOk: null, error: `fake loop exited ${r.code}: ${tail}` };
  }
}
