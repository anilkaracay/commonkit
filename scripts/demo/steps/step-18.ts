import { nearToYocto } from '@commonkit/sdk';
import { TGAS } from '../../lib/config.js';
import { claimAndSubmit, metricThreshold, withRule } from '../lib/actions.js';
import { runAgentUntil } from '../lib/agent.js';
import { eventOf, mintedTokenIds, near, type DemoContext } from '../lib/context.js';
import { sha256Hex } from '../lib/hash.js';
import type { DemoStep } from '../lib/runner.js';
import { tag } from '../lib/views.js';
import { printerDemoProfile } from './step-01.js';

/** profiles/printer_3d.json meta.pilot_overrides.filament_spool (demo-lowered; real 330 000 mm). */
const FILAMENT_DEMO_THRESHOLD = 5000;
const TOO_MUCH = nearToYocto('0.6');
const EXPENSE = nearToYocto('0.4');

export const step18: DemoStep = {
  n: 18,
  title: 'Printer Restock: agent opens the filament task; capped reimbursement (0.6 refused, 0.4 paid after verifier + council)',
  core: false,
  simulated: true,
  negative: true,
  async run(ctx: DemoContext) {
    const { cast, rec, gov } = ctx;
    const a = ctx.asset(cast.printer);
    if (metricThreshold(await a.profile(), 'filament_spool') !== FILAMENT_DEMO_THRESHOLD)
      await gov.override(cast.makerlab, cast.printer, [
        { method_name: 'set_profile', args: { profile: withRule(printerDemoProfile(), 'filament_spool', { trigger: { Metric: { metric: 'filament_used_mm', threshold: FILAMENT_DEMO_THRESHOLD } } }) }, gas: 30n * TGAS },
      ], [{ kind: 'override', rule_id: 'filament_spool', value: FILAMENT_DEMO_THRESHOLD, production: metricThreshold(printerDemoProfile(), 'filament_spool')! }], 'demo-lowered (profile pilot_overrides), emulated Moonraker telemetry');
    if (!ctx.own('deposits_before')) rec.out('deposits_before', (await a.ledger()).deposits_held);

    let taskId = ctx.own('task_id') ?? (await a.rule('filament_spool')).open_task;
    if (!taskId) {
      const st = await a.rule('filament_spool');
      rec.check('filament_used_mm (emulated Moonraker) crossed the demo-lowered threshold', st.due, st);
      const { result } = await runAgentUntil(cast.printer, cast.agent, 'step18', async (ev) => ev.find((e) => e.type === 'task_opened' && e.data.rule_id === 'filament_spool') ?? null);
      rec.externalTx('agent open_upkeep_task("filament_spool")', String(result.data.tx_hash), cast.agent);
      taskId = String(result.data.task_id);
    }
    rec.out('task_id', taskId);
    let t = await a.task(taskId);
    rec.eq('task kind Restock, trigger Metric, opened by the agent', { kind: t?.kind, trigger: Object.keys(t?.trigger ?? {})[0], by: t?.opened_by }, { kind: 'Restock', trigger: 'Metric', by: cast.agent });

    if (t?.status === 'Open') await ctx.call(`Ayşe claims task #${taskId}`, cast.ayse, cast.printer, 'claim_task', { task_id: taskId });
    t = await a.task(taskId);
    if (t?.status === 'Claimed' && !ctx.own('cap_refused')) {
      await ctx.refused('Ayşe submits with expense 0.6 NEAR (> reimbursable_max 0.5)', 'E_EXPENSE_CAP', cast.ayse, cast.printer, 'submit_task', {
        task_id: taskId,
        evidence_hash: sha256Hex(`COMMONKIT demo: new filament spool loaded (task #${taskId})`),
        evidence_uri: null,
        expense: TOO_MUCH.toString(),
        receipt_hash: sha256Hex('COMMONKIT demo receipt: filament spool 0.6'),
      });
      rec.out('cap_refused', '1');
    }
    await claimAndSubmit(ctx, cast.printer, taskId, cast.ayse, `COMMONKIT demo: new filament spool loaded (task #${taskId})`, { amount: EXPENSE, receipt: 'COMMONKIT demo receipt: filament spool 0.4' });
    t = await a.task(taskId);
    rec.check('task_submitted with expense 0.4 NEAR and a receipt hash', t?.expense === EXPENSE.toString() && !!t?.receipt_hash, { expense: t?.expense, receipt_hash: t?.receipt_hash });

    if (t?.status === 'Submitted' && !t.verifier) {
      const tx = await ctx.call('Mehmet (verifier) approves', cast.mehmet, cast.printer, 'approve_task', { task_id: taskId });
      rec.check('verifier approval waits for the council (0.4 > council_threshold_cash 0.25)', eventOf(tx, 'task_approved')?.awaiting_council === true);
      t = await a.task(taskId);
    }
    // After the verifier, a task that needs the council stays Submitted with `verifier` set.
    if (t?.status === 'Submitted' && t.verifier && !t.council_approver) {
      const tx = await ctx.call('council member Elif (≠ Mehmet) gives council approval', cast.makerlab.councilMember, cast.printer, 'council_approve_task', { task_id: taskId });
      rec.check('task_council_approved event', eventOf(tx, 'task_council_approved') !== null);
      rec.eq('nft_mint lists 1 token id', mintedTokenIds(tx).length, 1);
      const op = eventOf(tx, 'op_result', (d) => d.kind === 'Reimbursement');
      rec.eq('Reimbursement op Succeeded for 0.4 NEAR, ref_id = task', { status: op?.status, amount: op ? near(String(op.amount)) : null, ref: op?.ref_id }, { status: 'Succeeded', amount: near(EXPENSE), ref: taskId });
      t = await a.task(taskId);
    }
    rec.eq('task Rewarded, expense_state Paid', { status: t?.status, expense: tag(t?.expense_state ?? '') }, { status: 'Rewarded', expense: 'Paid' });
    const opId = t?.reimbursement_op_id;
    const op = opId ? await a.op(opId) : null;
    rec.eq('Reimbursement op paid Ayşe from the float', { kind: op?.kind, to: op?.to, amount: op?.amount, status: op?.status }, { kind: 'Reimbursement', to: cast.ayse, amount: EXPENSE.toString(), status: 'Succeeded' });
    rec.eq('deposits_held unchanged (deposits are never used for reimbursements)', (await a.ledger()).deposits_held, ctx.own('deposits_before'));
  },
};
