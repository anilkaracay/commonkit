import { reserveAhead } from '../lib/actions.js';
import { eventOf, near, type DemoContext } from '../lib/context.js';
import type { DemoStep } from '../lib/runner.js';
import { slotsToExceedCap } from '../lib/slots.js';

export const step06: DemoStep = {
  n: 6,
  title: 'More fees push the printer float over its cap; the excess is swept to the DAO treasury',
  core: true,
  simulated: false,
  negative: false,
  async run(ctx: DemoContext) {
    const { cast, rec } = ctx;
    const a = ctx.asset(cast.printer);
    const dao = cast.makerlab.dao;
    if (ctx.own('sweep_op_id')) {
      const op = await a.op(ctx.own('sweep_op_id')!);
      rec.note('sweep happened in an earlier attempt; not reserved again');
      rec.eq('Sweep op Succeeded to the DAO', { kind: op?.kind, to: op?.to, status: op?.status }, { kind: 'Sweep', to: dao, status: 'Succeeded' });
      return;
    }
    const [p, l] = await Promise.all([a.profile(), a.ledger()]);
    const n = slotsToExceedCap(BigInt(l.float_free), BigInt(l.float_cap), BigInt(p.price_per_slot), p.max_slots_per_reservation);
    if (n === null) throw new Error('no booking size pushes the float over the cap');
    const daoBefore = await ctx.balance(dao);
    // Booked 3 h ahead so it never collides with the next printer sessions (step 9).
    const b = await reserveAhead(ctx, 'Ali books more printer time ahead', cast.printer, cast.ali, n, 6);
    rec.out('reservation_id', b.id);
    const swept = eventOf(b.tx, 'swept');
    rec.check('`swept` event in the reservation callback', swept !== null, swept);
    if (!swept) return;
    const amount = BigInt(String(swept.amount));
    rec.out('sweep_op_id', String(swept.op_id));
    rec.out('swept', amount);
    const opRes = eventOf(b.tx, 'op_result', (d) => d.kind === 'Sweep');
    rec.eq('Sweep op Succeeded', opRes?.status, 'Succeeded');
    const [after, daoAfter] = await Promise.all([a.ledger(), ctx.balance(dao)]);
    rec.check('excess above the cap was swept', amount > 0n, `float ${near(l.float_free)} + fee ${near(b.fee)} → swept ${near(amount)}, float now ${near(after.float_free)}`);
    rec.eq('float_free = cap after the sweep', after.float_free, after.float_cap);
    rec.check('DAO treasury +excess', daoAfter - daoBefore >= amount, `${near(daoBefore)} → ${near(daoAfter)} (+${near(daoAfter - daoBefore)})`);
    rec.eq('total_swept grew by the excess', BigInt(after.total_swept) - BigInt(l.total_swept), amount);
    rec.note(`reservation ${b.id} stays booked ahead; if unused it becomes a no-show (fee kept, deposit refunded) via \`pnpm demo:step housekeeping\``);
  },
};
