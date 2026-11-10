import { claimAndSubmit, reserveAhead } from '../lib/actions.js';
import { runAgentUntil } from '../lib/agent.js';
import { eventOf, near, type DemoContext } from '../lib/context.js';
import { sha256Hex } from '../lib/hash.js';
import type { DemoStep } from '../lib/runner.js';
import { reservationCost, pickFutureSlot } from '../lib/slots.js';
import { rightsOf } from '../lib/views.js';

export const step19: DemoStep = {
  n: 19,
  title: 'Washer fault (simulation): report → out of service → refunds → agent Repair task → verified repair → back in service',
  core: false,
  simulated: true,
  negative: true,
  async run(ctx: DemoContext) {
    const { cast, rec } = ctx;
    const w = cast.washer;
    const a = ctx.asset(w);
    const c = cast.dormB;
    const done = (k: string) => ctx.own(k) !== undefined;

    // 1. A recent washer user reports the fault; an account without a session cannot.
    if (!done('fault_reported')) {
      const tx = await ctx.call('Ali (washed in step 15) reports a fault', cast.ali, w, 'report_fault', { rule_id: null, note_hash: sha256Hex('COMMONKIT demo: washer drum does not spin (simulation)') });
      rec.eq('fault_reported {active_reports: 1}', eventOf(tx, 'fault_reported')?.active_reports, 1);
      rec.out('fault_reported', '1');
    }
    if (!done('no_session_refused')) {
      await ctx.refused('Can (no washer session) tries to report a fault', 'E_NO_RECENT_SESSION', cast.can, w, 'report_fault', { rule_id: null, note_hash: sha256Hex('COMMONKIT demo: second report') });
      rec.out('no_session_refused', '1');
    }

    // 2. Can holds a future booking; the steward takes the washer out of service.
    if (!done('can_reservation')) {
      const b = await reserveAhead(ctx, 'Can books the washer ahead', w, cast.can, 1, 2);
      rec.out('can_reservation', b.id);
      rec.out('can_fee', b.fee);
    }
    const canRid = ctx.own('can_reservation')!;
    if ((await a.serviceStatus()).in_service && !done('oos_set')) {
      const tx = await ctx.call('steward Nil sets out_of_service(true)', c.steward, w, 'set_out_of_service', { out: true, reason_hash: sha256Hex('COMMONKIT demo: fault reported, washer locked (simulation)') });
      rec.check('out_of_service event', eventOf(tx, 'out_of_service') !== null);
      rec.out('oos_set', '1');
    }

    // 3. While out of service: no new reservation, no access, full-refund cancellation.
    if (!done('reserve_refused')) {
      const p = await a.profile();
      const cost = reservationCost(p, 0, 1, false);
      const slot = pickFutureSlot(await ctx.chainNow(), p, 1, 3, () => true);
      await ctx.refused('Zeynep tries to reserve the washer', 'E_OUT_OF_SERVICE', cast.zeynep, w, 'reserve', { start_slot: slot.toString(), slots: 1, right_id: null }, { deposit: cost.total });
      const view = await a.canAccess(cast.can, canRid);
      rec.eq('can_access returns out_of_service', { ok: view.ok, reason: view.reason }, { ok: false, reason: 'out_of_service' });
      const bridge = await ctx.bridge({ washer: w });
      const res = await bridge.access(w, cast.can, canRid);
      rec.eq('bridge /access answers 403 OUT_OF_SERVICE (device stays locked)', { status: res.status, reason: res.body.reason }, { status: 403, reason: 'OUT_OF_SERVICE' });
      rec.out('reserve_refused', '1');
    }
    if ((await a.reservation(canRid))?.status === 'Confirmed') {
      const tx = await ctx.call('Can cancels his future booking', cast.can, w, 'cancel_reservation', { id: canRid });
      const ev = eventOf(tx, 'reservation_cancelled');
      rec.eq('reservation_cancelled reason out_of_service, full fee refunded', { reason: ev?.reason, fee: ev?.fee_refunded }, { reason: 'out_of_service', fee: ctx.own('can_fee') });
      rec.eq('Refund op Succeeded', eventOf(tx, 'op_result', (d) => d.kind === 'Refund')?.status, 'Succeeded');
    }

    // 4. The agent opens the Repair task (trigger Report).
    let taskId = ctx.own('task_id') ?? (await a.rule('fault_repair')).open_task;
    if (!taskId) {
      const { result } = await runAgentUntil(w, cast.agent, 'step19', async (ev) => ev.find((e) => e.type === 'task_opened' && e.data.rule_id === 'fault_repair') ?? null);
      rec.externalTx('agent open_upkeep_task("fault_repair")', String(result.data.tx_hash), cast.agent);
      taskId = String(result.data.task_id);
    }
    rec.out('task_id', taskId);
    let t = await a.task(taskId);
    rec.eq('task kind Repair, trigger Report, opened by the agent', { kind: t?.kind, trigger: Object.keys(t?.trigger ?? {})[0], by: t?.opened_by }, { kind: 'Repair', trigger: 'Report', by: cast.agent });

    // 5. Can repairs it; the bridge runs the simulated check; Ozan approves.
    await claimAndSubmit(ctx, w, taskId, cast.can, `COMMONKIT demo: washer belt replaced (task #${taskId}, simulation)`);
    t = await a.task(taskId);
    if (t?.status === 'Submitted' && !t.verification?.passed) {
      const bridge = await ctx.bridge({ washer: w });
      const start = await bridge.verify(w, taskId, cast.can);
      rec.eq('bridge starts the simulated verification (202)', start.status, 202);
      const run = await bridge.waitRun(String(start.body.run_id), 5 * 60_000);
      rec.externalTx('bridge submit_verification_result (simulated check)', String(run.tx), cast.bridge);
      rec.check('simulated verification passed', run.passed === true && run.simulated);
      t = await a.task(taskId);
    }
    if (t?.status === 'Submitted') {
      const tx = await ctx.call('Ozan (dorm-b verifier) approves', c.verifier, w, 'approve_task', { task_id: taskId });
      rec.check('service_restored event in the reward', eventOf(tx, 'service_restored') !== null);
      t = await a.task(taskId);
    }
    rec.eq('Repair task Rewarded', t?.status, 'Rewarded');
    rec.eq('washer back in service', (await a.serviceStatus()).in_service, true);
    const last = (await a.serviceLog()).at(-1);
    rec.eq('service log: the out-of-service period is closed by RepairRewarded{task_id}', last?.ended_by, { RepairRewarded: { task_id: taskId } });

    // 6. Same commons, other group: a laundry right on the dorm-b fridge → E_RIGHT_WRONG_GROUP.
    if (!done('wrong_group_reservation')) {
      const minted = t?.minted_right_ids ?? [];
      const right = rightsOf(await ctx.commons(c).cards(cast.can), 'Active').find((x) => minted.includes(x.token_id));
      if (!right) throw new Error('Can has no Active laundry right from the repair');
      const b = await reserveAhead(ctx, `Can tries his dorm-b-laundry right ${right.token_id} on fridge-01 (group street-fridge)`, cast.fridge, cast.can, 1, 2, right.token_id);
      rec.out('wrong_group_reservation', b.id);
      rec.eq('reservation_rejected reason E_RIGHT_WRONG_GROUP', eventOf(b.tx, 'reservation_rejected')?.reason, 'E_RIGHT_WRONG_GROUP');
      rec.note(`fridge deposit ${near(b.deposit)} refunded minus the rejected record's storage (D-213 #1)`);
    }
  },
};
