/**
 * Governance for demo steps: every change goes through a Sputnik proposal voted by the council
 * (scripts/lib/dao proposeAndPass), and every proposal/vote tx lands in the step's evidence.
 * Before each proposal the step checks the target state with a view, so a rerun never re-proposes.
 */
import { nearToYocto, yoctoToNear } from '@commonkit/sdk';
import { Dao, type FnAction } from '../../lib/dao.js';
import type { Chain } from '../../lib/near.js';
import type { CommunityCast } from './cast.js';
import { overrideLabel, recordOverride, restoreLabel } from './overrides.js';
import type { StepRecorder } from './record.js';

export const TREASURY_MARGIN = nearToYocto('0.5');

export interface Governance {
  /** One FunctionCall proposal on `receiver` (≥ 1 action, atomic), proposed and voted through. */
  call(c: CommunityCast, label: string, receiver: string, actions: FnAction[]): Promise<Passed>;
  /**
   * A demo override (or its restore) of live values: proposal labelled
   * "demo override <rule_id> <value> (production <value>)" per item, each item written to
   * evidence/demo-overrides.json with the proposal id and tx hashes.
   */
  override(c: CommunityCast, receiver: string, actions: FnAction[], items: OverrideItem[], why: string): Promise<Passed>;
  /** Plain-transfer top-up of a DAO treasury from the root when `amount` would not be available. */
  ensureTreasury(c: CommunityCast, amount: bigint): Promise<void>;
  dao(c: CommunityCast): Dao;
}

export interface Passed {
  id: number;
  proposal: string;
  hashes: string[];
}

export interface OverrideItem {
  kind: 'override' | 'restore';
  rule_id: string;
  value: string | number;
  production: string | number;
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
      return { id: r.proposalId, proposal: `${c.dao}#${r.proposalId}`, hashes: r.txs.map((t) => t.hash) };
    },
    async override(c, receiver, actions, items, why) {
      const label = `${items.map((i) => (i.kind === 'override' ? overrideLabel(i.rule_id, i.value, i.production) : restoreLabel(i.rule_id, i.production))).join('; ')} on ${receiver.split('.')[0]} — ${why}`;
      const passed = await this.call(c, label, receiver, actions);
      for (const i of items)
        recordOverride({ kind: i.kind, step, asset: receiver, rule_id: i.rule_id, value: String(i.value), production: String(i.production), proposal: passed.proposal, tx_hashes: passed.hashes });
      return passed;
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
