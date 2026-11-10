import { reserveAhead } from '../lib/actions.js';
import { eventOf, near, type DemoContext } from '../lib/context.js';
import type { DemoStep } from '../lib/runner.js';

export const step11: DemoStep = {
  n: 11,
  title: 'Zeynep reserves the laser without the laser_safety credential: rejected, refunded',
  core: false,
  simulated: false,
  negative: true,
  async run(ctx: DemoContext) {
    const { cast, rec } = ctx;
    const a = ctx.asset(cast.laser);
    let rid = ctx.own('reservation_id');
    if (!rid) {
      const has = await ctx.commons(cast.makerlab).hasCredential(cast.zeynep, 'laser_safety');
      rec.eq('precondition: Zeynep holds no laser_safety credential', has, false);
      const balBefore = await ctx.balance(cast.zeynep);
      const b = await reserveAhead(ctx, 'Zeynep reserves laser-01 (no credential)', cast.laser, cast.zeynep, 1, 1);
      rid = b.id;
      rec.out('reservation_id', rid);
      const rej = eventOf(b.tx, 'reservation_rejected');
      rec.eq('reservation_rejected reason = E_CREDENTIAL_MISSING (commons authorize_reservation)', rej?.reason, 'E_CREDENTIAL_MISSING');
      const refund = eventOf(b.tx, 'op_result', (d) => d.kind === 'Refund');
      rec.eq('Refund op Succeeded', refund?.status, 'Succeeded');
      rec.check('refund = everything attached except the measured storage of the rejected record (D-213 #1)', BigInt(String(rej?.refund ?? 0)) + BigInt(String(rej?.storage_retained ?? 0)) === b.fee + b.deposit, `refund ${near(String(rej?.refund))}, storage kept ${near(String(rej?.storage_retained))}`);
      const balAfter = await ctx.balance(cast.zeynep);
      rec.check('Zeynep is out of pocket only gas + storage (< 0.02 NEAR)', balBefore - balAfter < 20_000_000_000_000_000_000_000n, `${near(balBefore)} → ${near(balAfter)}`);
    }
    const r = await a.reservation(rid);
    rec.eq('reservation Rejected; its slot released', { status: r?.status, slot_owner: await a.slotOwner(BigInt(r?.start_slot ?? 0)) }, { status: 'Rejected', slot_owner: null });
    rec.note('The rejection is a business refusal returned by commons (no panic), so the reserve tx itself succeeds and refunds; the code is in the reservation_rejected event.');
  },
};
