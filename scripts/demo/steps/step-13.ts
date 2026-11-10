import { reservation, reserveNow, waitForStart } from '../lib/actions.js';
import { type DemoContext } from '../lib/context.js';
import { sleep, waitFor } from '../lib/procs.js';
import type { DemoStep } from '../lib/runner.js';

export const step13: DemoStep = {
  n: 13,
  title: 'Zeynep (now credentialed) reserves the laser; the bridge switches the emulated Shelly on, then off',
  core: false,
  simulated: true,
  negative: false,
  async run(ctx: DemoContext) {
    const { cast, rec } = ctx;
    const laser = cast.laser;
    let rid = ctx.own('reservation_id');
    if (!rid) {
      const b = await reserveNow(ctx, 'Zeynep reserves laser-01', laser, cast.zeynep, 1);
      rid = b.id;
      rec.out('reservation_id', rid);
    }
    let r = await reservation(ctx, laser, rid);
    rec.check('reservation authorized with the credential (Confirmed or later)', ['Confirmed', 'InSession', 'Finished', 'Closed'].includes(r.status), r.status);
    if (r.status === 'Confirmed') {
      await waitForStart(ctx, laser, r);
      const bridge = await ctx.bridge({ laser });
      const res = await bridge.access(laser, cast.zeynep, rid);
      rec.eq('bridge grants access (200)', res.status, 200);
      const sid = String(res.body.session_id);
      const on = await bridge.device(laser);
      rec.check('smart_plug adapter switched the emulated Shelly ON (lamp-class stand-in, SIMULATED)', on?.relay_on === true, on);
      await sleep(8000);
      const fin = await bridge.finish(sid, laser, cast.zeynep, rid);
      rec.eq('Zeynep ends the session (signed finish)', fin.status, 200);
      const s = (await bridge.session(sid)).body;
      if (s.start_tx) rec.externalTx('bridge mark_session_started', s.start_tx, cast.bridge);
      const finishTx = String(fin.body.finish_tx ?? s.finish_tx);
      rec.externalTx('bridge mark_session_finished (energy/run time telemetry)', finishTx, cast.bridge);
      const off = await bridge.device(laser);
      rec.check('emulated Shelly switched OFF at the end', off?.relay_on === false, off);
      await waitFor('laser reservation Finished', async () => ((await reservation(ctx, laser, rid!)).status === 'Finished' ? true : null), 60_000);
      r = await reservation(ctx, laser, rid);
    }
    if (r.status === 'Finished')
      await ctx.call('steward (Elif) confirms a clean return (deposit refund)', cast.makerlab.steward, laser, 'confirm_return', { id: rid, result: 'Clean' });
    r = await reservation(ctx, laser, rid);
    rec.eq('reservation Closed', r.status, 'Closed');
  },
};
