import { TGAS } from '../../lib/config.js';
import { reserveAhead } from '../lib/actions.js';
import { eventOf, type DemoContext } from '../lib/context.js';
import type { DemoStep } from '../lib/runner.js';
import { train } from './step-12.js';

export const step14: DemoStep = {
  n: 14,
  title: 'Ayşe uses a printer-earned right on the laser (same group: OK) and on the dorm-b washer (other community: rejected)',
  core: false,
  simulated: false,
  negative: true,
  async run(ctx: DemoContext) {
    const { cast, rec, gov } = ctx;
    const c = cast.makerlab;
    const commons = ctx.commons(c);
    const elif = c.steward;

    // Precondition: the laser needs laser_safety; Ayşe is the trainer, so a second trainer trains her.
    if (!(await commons.hasCredential(cast.ayse, 'laser_safety'))) {
      const roles = await commons.roles(elif);
      if (!roles.includes('trainer')) {
        const active = (await ctx.chain.view<{ active: boolean }[]>(c.commons, 'get_assets', { from_index: 0, limit: 100 })).filter((x) => x.active).length;
        await gov.call(c, 'set_roles elif: steward, council, trainer (precondition for step 14: a second trainer)', c.commons, [
          { method_name: 'set_roles', args: { account: elif, roles: [...new Set([...roles, 'trainer'])] }, gas: BigInt(10 + 25 * active) * TGAS },
        ]);
      }
      await train(ctx, elif, cast.ayse, 'training_id');
    }
    rec.eq('precondition: Ayşe holds laser_safety (trained by Elif, approved by Mehmet)', await commons.hasCredential(cast.ayse, 'laser_safety'), true);

    const earned = ctx.need(8, 'right_ids').split(',');
    let rightId = ctx.own('right_id');
    if (!rightId) {
      const cards = await commons.cards(cast.ayse);
      rightId = cards.find((x) => earned.includes(x.token_id) && x.kind.status?.state === 'Active')?.token_id;
      if (!rightId) throw new Error('no Active printer-earned right left from step 8');
      rec.out('right_id', rightId);
    }

    // Same group (makerlab-fab): the laser accepts the printer-earned right.
    let laserRid = ctx.own('laser_reservation_id');
    if (!laserRid) {
      const b = await reserveAhead(ctx, 'Ayşe reserves laser-01 with her printer-earned right', cast.laser, cast.ayse, 1, 2, rightId);
      laserRid = b.id;
      rec.out('laser_reservation_id', laserRid);
      rec.eq('laser reservation Confirmed with fee 0', { status: (await ctx.asset(cast.laser).reservation(laserRid))?.status, fee: b.fee }, { status: 'Confirmed', fee: 0n });
      rec.eq('right Locked by laser-01 (same group makerlab-fab)', (await commons.card(rightId))?.kind.status, { state: 'Locked', asset: cast.laser, reservation_id: laserRid });
    }
    const lr = await ctx.asset(cast.laser).reservation(laserRid);
    if (lr?.status === 'Confirmed')
      await ctx.call('Ayşe cancels the laser booking ahead of time (full refund, right released)', cast.ayse, cast.laser, 'cancel_reservation', { id: laserRid });
    const after = await commons.card(rightId);
    rec.eq('after cancelling, the right is Active again (not consumed)', after?.kind.status?.state, 'Active');

    // Other community: the dorm-b commons does not know a makerlab card.
    const dormB = ctx.commons(cast.dormB);
    let washerRid = ctx.own('washer_reservation_id');
    if (!washerRid) {
      const known = await dormB.card(rightId);
      const expected = known ? 'E_UNAUTHORIZED' : 'E_RIGHT_NOT_ACTIVE';
      const b = await reserveAhead(ctx, 'Ayşe tries her makerlab right on washer-01 (dorm-b)', cast.washer, cast.ayse, 1, 2, rightId);
      washerRid = b.id;
      rec.out('washer_reservation_id', washerRid);
      const rej = eventOf(b.tx, 'reservation_rejected');
      rec.eq(`washer rejects the foreign right: reservation_rejected ${expected} (the card does not exist in dorm-b's commons)`, rej?.reason, expected);
      rec.eq('Refund op Succeeded', eventOf(b.tx, 'op_result', (d) => d.kind === 'Refund')?.status, 'Succeeded');
    }
    rec.eq('washer reservation Rejected', (await ctx.asset(cast.washer).reservation(washerRid))?.status, 'Rejected');
    rec.eq('the right itself is untouched by the foreign asset', (await commons.card(rightId))?.kind.status?.state, 'Active');
    rec.note('E_RIGHT_WRONG_GROUP needs a card of the same commons in another group; it is shown in step 19 (a dorm-b laundry right on the dorm-b fridge). Across communities the other commons has no such card (D-750).');
  },
};
