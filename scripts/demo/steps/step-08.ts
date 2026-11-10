import { claimAndSubmit } from '../lib/actions.js';
import { countEvents, type DemoContext } from '../lib/context.js';
import type { DemoStep } from '../lib/runner.js';
import { rightsOf, tag } from '../lib/views.js';

export const step08: DemoStep = {
  n: 8,
  title: 'Ayşe claims and submits; the bridge runs a calibration print; Mehmet approves; 2 rights minted',
  core: true,
  simulated: true,
  negative: false,
  async run(ctx: DemoContext) {
    const { cast, rec } = ctx;
    const taskId = ctx.need(7, 'task_id');
    const a = ctx.asset(cast.printer);
    await claimAndSubmit(ctx, cast.printer, taskId, cast.ayse, `COMMONKIT demo: printer-01 nozzle cleaned (task #${taskId}); photo hash only`);
    let t = await a.task(taskId);
    if (t?.status === 'Submitted' && !t.verification?.passed) {
      const bridge = await ctx.bridge({ printer: cast.printer });
      const start = await bridge.verify(cast.printer, taskId, cast.ayse);
      rec.eq('bridge accepts the claimer’s signed verification request', start.status, 202);
      const run = await bridge.waitRun(String(start.body.run_id), 6 * 60_000);
      rec.externalTx('bridge submit_verification_result (calibration print on the emulated Moonraker)', String(run.tx), cast.bridge);
      rec.check('calibration print passed (SIMULATED, emulated device)', run.passed === true && run.simulated, run.test);
      t = await a.task(taskId);
    }
    if (t?.status === 'Submitted') {
      rec.check('verification result on chain', t.verification?.passed === true);
      const tx = await ctx.call('Mehmet (verifier, independent) approves', cast.mehmet, cast.printer, 'approve_task', { task_id: taskId });
      rec.eq('2 nft_mint events (NEP-171)', countEvents(tx, 'nft_mint'), 2);
      t = await a.task(taskId);
    } else rec.note(`task already ${t?.status} (earlier attempt)`);
    rec.eq('task Rewarded, reward Done', { status: t?.status, reward: tag(t?.reward_state ?? '') }, { status: 'Rewarded', reward: 'Done' });
    const minted = t?.minted_right_ids ?? [];
    rec.eq('2 rights minted', minted.length, 2);
    rec.out('right_ids', minted.join(','));
    const cards = rightsOf(await ctx.commons(cast.makerlab).cards(cast.ayse));
    const ours = cards.filter((c) => minted.includes(c.token_id));
    rec.check(
      'Ayşe owns them; source = this maintenance task; group makerlab-fab',
      ours.length === 2 && ours.every((c) => c.kind.source?.type === 'Maintenance' && c.kind.source.task_id === taskId && c.kind.group_id === 'makerlab-fab'),
      ours.map((c) => ({ id: c.token_id, source: c.kind.source, group: c.kind.group_id })),
    );
    const log = await a.reputationLog();
    rec.check('reputation record "upkeep" linked to the task', log.some((r) => r.kind === 'upkeep' && r.ref_id === taskId && r.account === cast.ayse));
  },
};
