/**
 * Step runner: skip a step that already passed (no double spend), otherwise run it with the
 * outputs of its earlier attempt, always write its record and regenerate EVIDENCE.md.
 */
import type { DemoContext } from './context.js';
import { StepRecorder, type DemoStepRecord } from './record.js';

export interface DemoStep {
  n: number;
  title: string;
  /** One of the five core steps the README shows (DEMO_SCRIPT §2, lead's list). */
  core: boolean;
  /** Involves an emulated device or the simulator (D-022); labelled everywhere. */
  simulated: boolean;
  /** Asserts refusals (E_* codes) rather than successes, fully or in part. */
  negative: boolean;
  run(ctx: DemoContext): Promise<void>;
}

export interface RunnerDeps {
  readSteps(): DemoStepRecord[];
  writeStep(r: DemoStepRecord): void;
  render(): void;
  makeCtx(step: DemoStep, rec: StepRecorder, steps: DemoStepRecord[]): DemoContext;
  print(line: string): void;
}

export type StepOutcome = 'skipped' | 'passed' | 'failed';

export async function runStep(step: DemoStep, deps: RunnerDeps, opts: { force?: boolean } = {}): Promise<StepOutcome> {
  const steps = deps.readSteps();
  const previous = steps.find((s) => s.step === step.n);
  if (previous?.status === 'passed' && !opts.force) {
    deps.print(`= step ${step.n} already passed at ${previous.timestamp} (${previous.txHashes.length} txs); skipped (--force reruns it)`);
    return 'skipped';
  }
  deps.print(`\n# step ${step.n}: ${step.title}${step.simulated ? ' [SIMULATED device]' : ''}`);
  const rec = new StepRecorder(
    { step: step.n, title: step.title, core: step.core, simulated: step.simulated, negative: step.negative },
    previous,
    deps.print,
  );
  const ctx = deps.makeCtx(step, rec, steps);
  let error: unknown;
  try {
    await step.run(ctx);
  } catch (e) {
    error = e;
    deps.print(`  ERROR ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await ctx.close().catch(() => undefined);
  }
  const record = rec.finish(error);
  deps.writeStep(record);
  deps.render();
  deps.print(`${record.status === 'passed' ? '✅' : '❌'} step ${step.n} ${record.status} (${record.txHashes.length} txs)`);
  return record.status;
}
