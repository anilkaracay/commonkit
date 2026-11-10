import { reservation, reserveNow, waitForStart } from '../lib/actions.js';
import type { DemoContext } from '../lib/context.js';
import { waitFor } from '../lib/procs.js';
import type { DemoStep } from '../lib/runner.js';

export const step09: DemoStep = {
  n: 9,
  title: 'Ayşe reserves the printer with an earned right (no fee) and prints on the emulated printer',
  core: false,
  simulated: true,
  negative: false,
  async run(ctx: DemoContext) {
    const { cast, rec } = ctx;
    const commons = ctx.commons(cast.makerlab);
    const a = ctx.asset(cast.printer);
    let rid = ctx.own('reservation_id');
    let rightId = ctx.own('right_id');
    if (!rid) {
      const earned = ctx.need(8, 'right_ids').split(',');
      const cards = await commons.cards(cast.ayse);
      rightId = cards.find((c) => earned.includes(c.token_id) && c.kind.status?.state === 'Active')?.token_id;
      if (!rightId) throw new Error('no Active right from step 8');
      const b = await reserveNow(ctx, 'Ayşe reserves printer-01 with her right', cast.printer, cast.ayse, 1, rightId);
      rid = b.id;
      rec.out('reservation_id', rid);
      rec.out('right_id', rightId);
      const card = await commons.card(rightId);
      rec.eq('right Locked by printer-01 for this reservation', card?.kind.status, { state: 'Locked', asset: cast.printer, reservation_id: rid });
    }
    let r = await reservation(ctx, cast.printer, rid);
    rec.eq('no fee with a right; deposit still held', { fee: r.fee_paid, right: r.right_id }, { fee: '0', right: rightId });
    if (r.status === 'Confirmed') {
      await waitForStart(ctx, cast.printer, r);
      const bridge = await ctx.bridge({ printer: cast.printer });
      const res = await bridge.access(cast.printer, cast.ayse, rid);
      rec.eq('bridge grants access (200)', res.status, 200);
      const s = await bridge.waitSessionEnd(String(res.body.session_id), 6 * 60_000);
      if (s.start_tx) rec.externalTx('bridge mark_session_started', s.start_tx, cast.bridge);
      if (s.finish_tx) rec.externalTx('bridge mark_session_finished (emulated job done) → finalize_right', s.finish_tx, cast.bridge);
      r = await reservation(ctx, cast.printer, rid);
    }
    const consumed = await waitFor('right Consumed', async () => {
      const c = await commons.card(rightId!);
      return c?.kind.status?.state === 'Consumed' ? c : null;
    }, 90_000);
    rec.eq('right Locked → Consumed after the session', consumed.kind.status, { state: 'Consumed', asset: cast.printer, reservation_id: rid });
    if (r.status === 'Finished') await ctx.call('steward (Elif) confirms a clean return (deposit refund)', cast.makerlab.steward, cast.printer, 'confirm_return', { id: rid, result: 'Clean' });
    r = await reservation(ctx, cast.printer, rid);
    rec.eq('reservation Closed', r.status, 'Closed');
    rec.check('printer ledger invariant holds', (await a.ledger()).invariant_ok);
  },
};
