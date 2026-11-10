/**
 * Judge flow on NEAR testnet (DEMO_SCRIPT §2, TEST_PLAN §5). Testnet only.
 *
 *   pnpm demo:step <n>             run step n (skipped if it already passed; --force reruns it)
 *   pnpm demo:all                  steps 1–21 in order, stops at the first failure
 *   pnpm demo:step all --from <n>  resume demo:all from step n
 *   pnpm demo:step render          regenerate evidence/EVIDENCE.md from evidence/*.json
 *   pnpm demo:step list            list the steps (core ★, simulated, negative)
 *   pnpm demo:step housekeeping    mark ended, unused demo reservations as no-shows (deposit refunds)
 *
 * Each step prints one line, executes, waits for FINAL, asserts through views (or the expected
 * E_* code), and upserts its record into evidence/steps.json. Device steps run through the real
 * bridge against emulated devices or the simulator (SIMULATED, D-022).
 */
import './lib/rpc-throttle.mjs';
import { assertTestnet } from '../lib/config.js';
import { loadDeployments } from '../lib/deployments.js';
import { Chain } from '../lib/near.js';
import { buildCast } from './lib/cast.js';
import { DemoContext } from './lib/context.js';
import { writeEvidenceMd } from './lib/evidence-md.js';
import { housekeeping } from './lib/housekeeping.js';
import { readSteps, upsertStep } from './lib/record.js';
import { runStep, type RunnerDeps } from './lib/runner.js';
import { STEPS } from './steps/index.js';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? 'list';
  if (cmd === 'render') return writeEvidenceMd();
  if (cmd === 'list') {
    for (const s of STEPS)
      console.log(`${String(s.n).padStart(2)} ${s.core ? '★' : ' '} ${s.simulated ? 'SIM' : '   '} ${s.negative ? 'NEG' : '   '} ${s.title}`);
    return;
  }
  assertTestnet();
  const chain = new Chain();
  const dep = loadDeployments();
  const cast = buildCast(dep);
  if (cmd === 'housekeeping') return housekeeping(chain, cast);

  const deps: RunnerDeps = {
    readSteps: () => readSteps(),
    writeStep: (r) => void upsertStep(r),
    render: () => writeEvidenceMd(),
    makeCtx: (step, rec, steps) => new DemoContext(chain, dep, cast, rec, step.n, steps),
    print: (l) => console.log(l),
  };
  const force = process.argv.includes('--force');
  let todo = STEPS;
  if (cmd === 'all') todo = STEPS.filter((s) => s.n >= Number(flag('--from') ?? 1));
  else {
    const n = Number(cmd);
    const s = STEPS.find((x) => x.n === n);
    if (!s) throw new Error(`unknown step ${cmd} (have ${STEPS.map((x) => x.n).join(', ')})`);
    todo = [s];
  }
  for (const s of todo) {
    const outcome = await runStep(s, deps, { force });
    if (outcome === 'failed') {
      process.exitCode = 1;
      return;
    }
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
