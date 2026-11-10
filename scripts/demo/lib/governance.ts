/**
 * Governance for demo steps: every change goes through a Sputnik proposal voted by the council
 * (scripts/lib/dao proposeAndPass), and every proposal/vote tx lands in the step's evidence.
 * Before each proposal the step checks the target state with a view, so a rerun never re-proposes.
 */
import { nearToYocto, yoctoToNear } from '@commonkit/sdk';
import { Dao, type FnAction } from '../../lib/dao.js';
import type { Chain } from '../../lib/near.js';
import type { CommunityCast } from './cast.js';
import type { StepRecorder } from './record.js';

export const TREASURY_MARGIN = nearToYocto('0.2');

export interface Governance {
  /** One FunctionCall proposal on `receiver` (≥ 1 action, atomic), proposed and voted through. */
  call(c: CommunityCast, label: string, receiver: string, actions: FnAction[]): Promise<number>;
  /** Plain-transfer top-up of a DAO treasury from the root when `amount` would not be available. */
  ensureTreasury(c: CommunityCast, amount: bigint): Promise<void>;
  dao(c: CommunityCast): Dao;
}

export function governance(chain: Chain, root: string, rec: StepRecorder, step: number): Governance {
  const daos = new Map<string, Dao>();
  const dao = (c: CommunityCast): Dao => {
    let d = daos.get(c.dao);
    if (!d) daos.set(c.dao, (d = new Dao(chain, c.dao)));
    return d;
  };
  return {
    dao,
    async call(c, label, receiver, actions) {
      const r = await dao(c).proposeAndPass(
        `COMMONKIT demo step ${step} (${c.slug}): ${label}`,
        { FunctionCall: { receiver_id: receiver, actions } },
        c.council,
      );
      for (const tx of r.txs) rec.tx(`${c.dao}#${r.proposalId} ${label}`, tx);
      rec.out(`proposal:${label}`, `${c.dao}#${r.proposalId}`);
      return r.proposalId;
    },
    async ensureTreasury(c, amount) {
      const available = BigInt(await chain.view<string>(c.dao, 'get_available_amount'));
      if (available >= amount + TREASURY_MARGIN) return;
      const short = amount + TREASURY_MARGIN - available;
      rec.tx(
        `treasury top-up ${c.dao} +${yoctoToNear(short, 4)} NEAR from the team root (plain transfer, research C10)`,
        await chain.transfer(root, c.dao, short),
      );
    },
  };
}
