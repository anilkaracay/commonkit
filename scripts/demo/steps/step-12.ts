import { countEvents, type DemoContext } from '../lib/context.js';
import { sha256Hex } from '../lib/hash.js';
import type { DemoStep } from '../lib/runner.js';
import { rightsOf } from '../lib/views.js';

/** Trainer proposes, an independent verifier approves (commons credentials, invariant 3). */
export async function train(ctx: DemoContext, trainer: string, trainee: string, outKey: string): Promise<string> {
  const { cast, rec } = ctx;
  const c = cast.makerlab;
  const commons = ctx.commons(c);
  let tid = ctx.own(outKey);
  if (!tid) {
    const tx = await ctx.call(`${trainer.split('.')[0]} proposes laser_safety training for ${trainee.split('.')[0]}`, trainer, c.commons, 'propose_credential', {
      trainee,
      kind: 'laser_safety',
      notes_hash: sha256Hex(`COMMONKIT demo laser safety training ${trainee}`),
    });
    tid = String(tx.returnValue);
    rec.out(outKey, tid);
  }
  const t = await commons.training(tid);
  if (t?.status === 'Proposed') {
    const tx = await ctx.call(`Mehmet (verifier ≠ trainer ≠ trainee) approves training #${tid}`, cast.mehmet, c.commons, 'approve_credential', { training_id: tid });
    rec.eq('credential card + trainer right minted (2 nft_mint events)', countEvents(tx, 'nft_mint'), 2);
  }
  return tid;
}

export const step12: DemoStep = {
  n: 12,
  title: 'Ayşe proposes Zeynep’s laser training; Mehmet approves; Zeynep gets laser_safety, Ayşe a laser-group right',
  core: false,
  simulated: false,
  negative: false,
  async run(ctx: DemoContext) {
    const { cast, rec } = ctx;
    const commons = ctx.commons(cast.makerlab);
    const tid = await train(ctx, cast.ayse, cast.zeynep, 'training_id');
    const t = await commons.training(tid);
    rec.eq('training Approved', t?.status, 'Approved');
    rec.eq('Zeynep has laser_safety', await commons.hasCredential(cast.zeynep, 'laser_safety'), true);
    const trainerRights = rightsOf(await commons.cards(cast.ayse), undefined, 'Training').filter((c) => c.kind.source?.training_id === tid);
    rec.check('Ayşe received 1 usage right in makerlab-fab for training', trainerRights.length === 1 && trainerRights[0]!.kind.group_id === 'makerlab-fab', trainerRights.map((c) => c.token_id));
  },
};
