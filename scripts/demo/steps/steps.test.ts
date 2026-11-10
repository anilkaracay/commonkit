import { describe, expect, it } from 'vitest';
import { runStep, type DemoStep, type RunnerDeps } from '../lib/runner.js';
import type { DemoContext } from '../lib/context.js';
import type { DemoStepRecord } from '../lib/record.js';
import { STEPS } from './index.js';

describe('judge-flow registry (DEMO_SCRIPT §2, D-801)', () => {
  it('has steps 1–21 in order', () => {
    expect(STEPS.map((s) => s.n)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
  });
  it('marks the five README core steps (2/3, 4, 7/8, 6, 21)', () => {
    expect(STEPS.filter((s) => s.core).map((s) => s.n)).toEqual([2, 3, 4, 6, 7, 8, 21]);
  });
  it('marks the negative steps of DEMO_SCRIPT §2', () => {
    expect(STEPS.filter((s) => s.negative).map((s) => s.n)).toEqual([4, 11, 14, 16, 17, 18, 19, 20]);
  });
  it('labels every device step as simulated', () => {
    for (const n of [3, 4, 5, 7, 8, 9, 13, 15, 18, 19, 20]) expect(STEPS.find((s) => s.n === n)!.simulated).toBe(true);
    for (const n of [1, 2, 6, 10, 11, 12, 14, 16, 17, 21]) expect(STEPS.find((s) => s.n === n)!.simulated).toBe(false);
  });
});

describe('runner', () => {
  function harness(initial: DemoStepRecord[] = []) {
    let steps = [...initial];
    const lines: string[] = [];
    const deps: RunnerDeps = {
      readSteps: () => steps,
      writeStep: (r) => (steps = [...steps.filter((s) => s.step !== r.step), r]),
      render: () => undefined,
      makeCtx: (_s, rec) => ({ rec, own: (k: string) => rec.outputs[k], close: async () => undefined }) as unknown as DemoContext,
      print: (l) => lines.push(l),
    };
    return { deps, lines, get: () => steps };
  }
  const step = (run: DemoStep['run']): DemoStep => ({ n: 2, title: 't', core: true, simulated: false, negative: false, run });

  it('never reruns a passed step unless forced (no double spend)', async () => {
    let runs = 0;
    const s = step(async (ctx) => {
      runs++;
      ctx.rec.check('x', true);
    });
    const h = harness();
    expect(await runStep(s, h.deps)).toBe('passed');
    expect(await runStep(s, h.deps)).toBe('skipped');
    expect(runs).toBe(1);
    expect(await runStep(s, h.deps, { force: true })).toBe('passed');
    expect(runs).toBe(2);
  });
  it('records a failure with its outputs so the rerun resumes', async () => {
    const h = harness();
    const failing = step(async (ctx) => {
      ctx.rec.out('reservation_id', '5');
      throw new Error('rpc down');
    });
    expect(await runStep(failing, h.deps)).toBe('failed');
    expect(h.get()[0]).toMatchObject({ status: 'failed', error: 'rpc down', outputs: { reservation_id: '5' } });
    let seen: string | undefined;
    const resumed = step(async (ctx) => {
      seen = ctx.own('reservation_id');
      ctx.rec.check('ok', true);
    });
    expect(await runStep(resumed, h.deps)).toBe('passed');
    expect(seen).toBe('5');
  });
});
