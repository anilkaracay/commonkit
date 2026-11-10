import type { DemoContext } from '../lib/context.js';
import type { DemoStep } from '../lib/runner.js';

export const step04: DemoStep = {
  n: 4,
  title: 'Can (no reservation) requests printer access via the bridge and is refused',
  core: true,
  simulated: true,
  negative: true,
  async run(ctx: DemoContext) {
    const { cast, rec } = ctx;
    const rid = ctx.need(2, 'reservation_id');
    const a = ctx.asset(cast.printer);
    const bridge = await ctx.bridge({ printer: cast.printer });
    const snap = async () => {
      const [l, mine, theirs] = await Promise.all([a.ledger(), a.byHolder(cast.can), a.reservation(rid)]);
      return { float_free: l.float_free, deposits_held: l.deposits_held, total_fees_in: (l as unknown as { total_fees_in: string }).total_fees_in, can_reservations: mine.length, ali_reservation: theirs?.status };
    };
    const before = await snap();
    const view = await a.canAccess(cast.can, rid);
    rec.eq('can_access(can, Ali’s reservation) on chain', { ok: view.ok, reason: view.reason }, { ok: false, reason: 'not_holder' });
    const res = await bridge.access(cast.printer, cast.can, rid);
    rec.eq('bridge answers 403 RESERVATION_NOT_ACCESSIBLE (no valid reservation)', { status: res.status, reason: res.body.reason }, { status: 403, reason: 'RESERVATION_NOT_ACCESSIBLE' });
    const dev = await bridge.device(cast.printer);
    rec.check('emulated printer did not start a job', dev?.print_state !== 'printing', dev);
    const after = await snap();
    rec.eq('no on-chain change (ledger, reservations)', after, before);
    rec.noTxReason = 'refused by the bridge before any transaction (read-only can_access)';
  },
};
