import { reservation, waitForStart } from '../lib/actions.js';
import type { DemoContext } from '../lib/context.js';
import { waitFor } from '../lib/procs.js';
import type { DemoStep } from '../lib/runner.js';

export const step03: DemoStep = {
  n: 3,
  title: 'Ali requests access via the bridge (NEP-413 signed); the emulated printer starts the job',
  core: true,
  simulated: true,
  negative: false,
  async run(ctx: DemoContext) {
    const { cast, rec } = ctx;
    const rid = ctx.need(2, 'reservation_id');
    const a = ctx.asset(cast.printer);
    let r = await reservation(ctx, cast.printer, rid);
    const bridge = await ctx.bridge({ printer: cast.printer });
    let sessionId = ctx.own('session_id');
    if (r.status === 'Confirmed') {
      await waitForStart(ctx, cast.printer, r);
      const res = await bridge.access(cast.printer, cast.ali, rid);
      rec.eq('bridge answers 200 ok for the reservation holder', { status: res.status, ok: res.body.ok }, { status: 200, ok: true });
      rec.check('bridge labels the asset SIMULATED (emulated Moonraker)', res.body.simulated === true);
      sessionId = String(res.body.session_id);
      rec.out('session_id', sessionId);
      const dev = await bridge.device(cast.printer);
      rec.check('moonraker adapter started the job on the emulated Moonraker (print_state printing)', dev?.print_state === 'printing', dev);
    } else if (!sessionId) throw new Error(`reservation ${rid} is ${r.status} and no session id was recorded`);
    else rec.note(`session ${sessionId} was started by an earlier attempt`);

    const s = (await bridge.session(sessionId)).body;
    if (s.start_tx) rec.externalTx('bridge mark_session_started (session_started event)', s.start_tx, cast.bridge);
    r = await reservation(ctx, cast.printer, rid);
    rec.check('reservation InSession on chain (chain records the start before the device unlocks, D-404)', ['InSession', 'Finished', 'Closed'].includes(r.status), r.status);
    // The emulated job is 20 min at 60× speed: wait for the bridge to report the end (used by step 5).
    const end = await bridge.waitSessionEnd(sessionId, 6 * 60_000);
    if (end.finish_tx) rec.out('finish_tx', end.finish_tx);
    rec.out('finish_reason', end.finish_reason ?? '');
    await waitFor('reservation Finished', async () => ((await a.reservation(rid))?.status === 'Finished' ? true : null), 60_000);
    rec.check('emulated job finished and the bridge closed the session on chain', true, `finish ${end.finish_reason}, tx ${end.finish_tx}`);
  },
};
