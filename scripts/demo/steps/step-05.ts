import { reservation } from '../lib/actions.js';
import { eventOf, near, type DemoContext } from '../lib/context.js';
import type { DemoStep } from '../lib/runner.js';

export const step05: DemoStep = {
  n: 5,
  title: 'Session finishes; the steward confirms a clean return and the deposit is refunded',
  core: false,
  simulated: true,
  negative: false,
  async run(ctx: DemoContext) {
    const { cast, rec } = ctx;
    const rid = ctx.need(2, 'reservation_id');
    const a = ctx.asset(cast.printer);
    const finishTx = ctx.prior(3)?.outputs.finish_tx;
    if (finishTx) rec.externalTx('bridge mark_session_finished with telemetry (emulated Moonraker job done)', finishTx, cast.bridge);
    let r = await reservation(ctx, cast.printer, rid);
    if (r.status === 'Finished') {
      const repBefore = await a.reputation(cast.ali);
      rec.out('clean_returns_before', repBefore.clean_returns);
      const tx = await ctx.call('steward (Elif) confirms a clean return', cast.makerlab.steward, cast.printer, 'confirm_return', { id: rid, result: 'Clean' });
      const op = eventOf(tx, 'op_result', (d) => d.kind === 'Refund');
      rec.eq('deposit Refund op Succeeded', { status: op?.status, amount: op ? near(String(op.amount)) : null }, { status: 'Succeeded', amount: near(r.deposit_paid) });
    } else rec.note(`reservation already ${r.status} (earlier attempt)`);
    r = await reservation(ctx, cast.printer, rid);
    rec.eq('reservation Closed', r.status, 'Closed');
    const rep = await a.reputation(cast.ali);
    const expected = Number(ctx.own('clean_returns_before') ?? rep.clean_returns - 1) + 1;
    rec.eq('Ali clean_returns', rep.clean_returns, expected);
    rec.check('Ali has a session on record', rep.sessions >= 1, rep);
  },
};
