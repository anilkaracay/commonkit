import { reserveNow } from '../lib/actions.js';
import { eventOf, near, type DemoContext } from '../lib/context.js';
import type { DemoStep } from '../lib/runner.js';

const LIVE = ['Confirmed', 'InSession', 'Finished', 'Closed'];

export const step02: DemoStep = {
  n: 2,
  title: 'Ali reserves 2 printer slots and pays fee + refundable deposit',
  core: true,
  simulated: false,
  negative: false,
  async run(ctx: DemoContext) {
    const { cast } = ctx;
    const a = ctx.asset(cast.printer);
    const resumed = ctx.own('reservation_id');
    if (resumed) {
      const r = await a.reservation(resumed);
      ctx.rec.note(`reservation ${resumed} was made by an earlier attempt; not reserved again`);
      ctx.rec.check('reservation exists and is live', !!r && LIVE.includes(r.status), r?.status);
      return;
    }
    const before = await a.ledger();
    const b = await reserveNow(ctx, 'Ali reserves printer-01', cast.printer, cast.ali, 2);
    const after = await a.ledger();
    const r = await a.reservation(b.id);
    ctx.rec.out('reservation_id', b.id);
    ctx.rec.out('start_slot', b.startSlot);
    ctx.rec.eq('reservation Confirmed (commons authorized it in the callback)', r?.status, 'Confirmed');
    ctx.rec.check('reservation_confirmed event', eventOf(b.tx, 'reservation_confirmed') !== null);
    ctx.rec.eq('fee paid = 2 × 0.25 NEAR', near(r?.fee_paid ?? '0'), near(b.fee));
    ctx.rec.eq('deposit paid (untrusted member) = 2 NEAR', near(r?.deposit_paid ?? '0'), near(b.deposit));
    const swept = eventOf(b.tx, 'swept');
    const dFloat = BigInt(after.float_free) - BigInt(before.float_free) + (swept ? BigInt(String(swept.amount)) : 0n);
    ctx.rec.check('float_free +fee (fee is revenue)', dFloat >= b.fee && dFloat - b.fee < 10n ** 22n, `${near(before.float_free)} → ${near(after.float_free)}${swept ? ` (+ swept ${near(String(swept.amount))})` : ''}`);
    ctx.rec.eq('deposits_held +deposit (deposit is a liability, not revenue)', near(BigInt(after.deposits_held) - BigInt(before.deposits_held)), near(b.deposit));
    ctx.rec.check('ledger invariant holds', after.invariant_ok);
  },
};
