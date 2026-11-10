import { nearToYocto } from '@commonkit/sdk';
import { runAgentUntil } from '../lib/agent.js';
import { near, type DemoContext } from '../lib/context.js';
import type { DemoStep } from '../lib/runner.js';

const KIT = nearToYocto('4');

export const step10: DemoStep = {
  n: 10,
  title: 'Agent escalates a nozzle kit purchase; the printer contract opens a Sputnik Transfer proposal; the council approves; the DAO pays the supplier',
  core: false,
  simulated: false,
  negative: false,
  async run(ctx: DemoContext) {
    const { cast, rec, gov } = ctx;
    const c = cast.makerlab;
    const a = ctx.asset(cast.printer);
    const find = async () => (await a.escalations()).find((e) => e.kind === 'purchase' && e.receiver === cast.supplier && e.status !== 'Failed');
    let esc = await find();
    if (!esc) {
      rec.note('Demo override (agent config, off chain): the nozzle-kit purchase hint uses after_n = 1 instead of the profile’s 2, so one rewarded nozzle task is enough for the demo.');
      const { result } = await runAgentUntil(cast.printer, cast.agent, 'step10', async (events) => events.find((e) => e.type === 'escalation_requested') ?? null, {
        purchaseHints: [{ rule_id: 'nozzle_clean', after_n: 1, item: 'Nozzle kit', amount: KIT.toString(), receiver: cast.supplier }],
      });
      rec.externalTx('agent escalate(kind="purchase") → printer-01 calls dao.add_proposal with its bond', String(result.data.tx_hash), cast.agent);
      esc = await find();
    }
    if (!esc?.proposal_id) throw new Error(`escalation not submitted: ${JSON.stringify(esc)}`);
    rec.out('escalation_id', esc.id);
    rec.out('proposal_id', esc.proposal_id);
    const dao = gov.dao(c);
    let p = await dao.getProposal(Number(esc.proposal_id));
    const kind = (p.kind as { Transfer?: { receiver_id: string; amount: string } }).Transfer;
    rec.eq('Sputnik Transfer proposal created by the asset contract itself', { proposer: p.proposer, receiver: kind?.receiver_id, amount: kind?.amount }, { proposer: cast.printer, receiver: cast.supplier, amount: KIT.toString() });
    rec.check('description names the asset escalation', p.description.startsWith('COMMONKIT escalation'), p.description);
    const supplierBefore = await ctx.balance(cast.supplier);
    if (p.status === 'InProgress') {
      await gov.ensureTreasury(c, KIT);
      for (const voter of c.council) {
        if (p.status !== 'InProgress') break;
        if (p.votes[voter]) continue;
        rec.tx(`${c.dao}#${esc.proposal_id} council vote (${voter.split('.')[0]})`, await dao.voteApprove(Number(esc.proposal_id), voter));
        p = await dao.getProposal(Number(esc.proposal_id));
      }
      const supplierAfter = await ctx.balance(cast.supplier);
      rec.eq('supplier paid 4 NEAR by the DAO', near(supplierAfter - supplierBefore), near(KIT));
    } else rec.note(`proposal already ${p.status} (earlier attempt)`);
    rec.eq('proposal Approved', p.status, 'Approved');
    let e = (await a.escalations()).find((x) => x.id === esc!.id)!;
    if (e.status !== 'Approved')
      await ctx.call('sync_escalation (ANY) maps the DAO status back to the asset', cast.root, cast.printer, 'sync_escalation', { escalation_id: esc.id });
    e = (await a.escalations()).find((x) => x.id === esc!.id)!;
    rec.eq('escalation Approved on the asset (bond settled back to the float)', e.status, 'Approved');
    rec.check('ledger invariant holds', (await a.ledger()).invariant_ok);
  },
};
