import type { DemoContext } from '../lib/context.js';
import type { DemoStep } from '../lib/runner.js';
import { rightsOf } from '../lib/views.js';

export const step17: DemoStep = {
  n: 17,
  title: 'Second reward for the same task, claimer self-approval, council revoking a right: all refused',
  core: false,
  simulated: false,
  negative: true,
  async run(ctx: DemoContext) {
    const { cast, rec } = ctx;
    const taskId = ctx.need(7, 'task_id');
    const commons = ctx.commons(cast.makerlab);
    const t = await ctx.asset(cast.printer).task(taskId);
    rec.eq(`precondition: task #${taskId} is Rewarded and claimed by Ayşe`, { status: t?.status, claimer: t?.claimer }, { status: 'Rewarded', claimer: cast.ayse });
    const rights = rightsOf(await commons.cards(cast.ayse));
    const right = rights[0];
    if (!right) throw new Error('Ayşe has no usage right to protect');
    const before = await commons.card(right.token_id);

    await ctx.refused('Ayşe asks for the reward of task #' + taskId + ' again (retry_reward)', 'E_ALREADY_REWARDED', cast.ayse, cast.printer, 'retry_reward', { task_id: taskId });
    await ctx.refused('Ayşe, the claimer, tries to approve her own task', 'E_SELF_VERIFY', cast.ayse, cast.printer, 'approve_task', { task_id: taskId });
    await ctx.refused(`council member Elif tries nft_transfer of Ayşe's ${right.token_id} to herself`, 'E_NON_TRANSFERABLE', cast.makerlab.steward, cast.makerlab.commons, 'nft_transfer', {
      receiver_id: cast.makerlab.steward,
      token_id: right.token_id,
    });
    await ctx.refused(`council member Elif looks for a revoke method (revoke_right): none exists`, 'PROTOCOL:MethodNotFound', cast.makerlab.steward, cast.makerlab.commons, 'revoke_right', { token_id: right.token_id });
    await ctx.refused(`council member Elif looks for a burn method (nft_burn): none exists`, 'PROTOCOL:MethodNotFound', cast.makerlab.steward, cast.makerlab.commons, 'nft_burn', { token_id: right.token_id });

    const after = await commons.card(right.token_id);
    rec.eq('the right is unchanged: same owner, same state', { owner: after?.owner_id, status: after?.kind.status }, { owner: before?.owner_id, status: before?.kind.status });
    rec.note('The DAO has no path either: commons exposes no revoke/burn/transfer method (CONTRACT_SPEC §5.1, invariant 2); suspend_credential on a usage right fails with E_NO_REVOCATION (sandbox test).');
  },
};
