import { reservation, reserveNow, waitForStart } from '../lib/actions.js';
import type { DemoContext } from '../lib/context.js';
import { waitFor } from '../lib/procs.js';
import type { DemoStep } from '../lib/runner.js';

export const step15: DemoStep = {
  n: 15,
  title: 'Dorm-b washer (simulation): reserve → bridge access → simulated cycle → telemetry; same asset code_hash',
  core: false,
  simulated: true,
  negative: false,
  async run(ctx: DemoContext) {
    const { cast, rec } = ctx;
    const w = cast.washer;
    const a = ctx.asset(w);
    const cyclesOf = async () => Number((await a.telemetry()).metrics.find(([m]) => m === 'cycles')?.[1] ?? 0);
    let rid = ctx.own('reservation_id');
    if (!rid) {
      rec.out('cycles_before', await cyclesOf());
      const b = await reserveNow(ctx, 'Ali reserves washer-01', w, cast.ali, 1);
      rid = b.id;
      rec.out('reservation_id', rid);
    }
    let r = await reservation(ctx, w, rid);
    if (r.status === 'Confirmed') {
      await waitForStart(ctx, w, r);
      const bridge = await ctx.bridge({ washer: w });
      const res = await bridge.access(w, cast.ali, rid);
      rec.eq('bridge grants access (200), simulator adapter', { status: res.status, simulated: res.body.simulated }, { status: 200, simulated: true });
      const s = await bridge.waitSessionEnd(String(res.body.session_id), 5 * 60_000);
      if (s.start_tx) rec.externalTx('bridge mark_session_started', s.start_tx, cast.bridge);
      if (s.finish_tx) rec.externalTx('bridge mark_session_finished with simulated cycle telemetry', s.finish_tx, cast.bridge);
      await waitFor('washer reservation Finished', async () => ((await reservation(ctx, w, rid!)).status === 'Finished' ? true : null), 60_000);
      r = await reservation(ctx, w, rid);
    }
    if (r.status === 'Finished')
      await ctx.call('dorm-b steward (Nil) confirms the return', cast.dormB.steward, w, 'confirm_return', { id: rid, result: 'Clean' });
    r = await reservation(ctx, w, rid);
    rec.eq('reservation Closed', r.status, 'Closed');
    const before = Number(ctx.own('cycles_before') ?? 0);
    const now = await cyclesOf();
    rec.check('cycles telemetry +1 on chain (simulated)', now >= before + 1, `${before} → ${now}`);
    const simulatedFlag = (await a.telemetry()).metrics.find(([m]) => m === 'simulated')?.[1];
    rec.eq('on-chain telemetry carries simulated = 1', simulatedFlag, 1);
    const hashes = await Promise.all([cast.printer, cast.laser, cast.washer, cast.fridge].map(async (id) => (await ctx.chain.viewAccount(id)).code_hash));
    rec.check('all four asset accounts run the same code_hash', new Set(hashes).size === 1 && hashes[0] === ctx.dep.code.asset?.code_hash, hashes[0]);
  },
};
