/**
 * File ONE real testnet proposal from a COMMONKIT Trezu template, compiled by Trezu's own engine:
 * fund_float 0.05 NEAR to washer-01 from the Dorm B DAO (dorm-b-ck.sputnikv2.testnet), passed by the
 * council through scripts/lib proposeAndPass. Idempotent: if evidence/trezu.json already records an
 * approved proposal, it only re-verifies it with views. Testnet only.
 *
 * Run: pnpm trezu:file   (fetches the pinned engine first; `-- --dry` prints the proposal only)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nearToYocto, yoctoToNear } from '@commonkit/sdk';
import { EVIDENCE_DIR, TGAS, explorerTx } from '../lib/config.js';
import { Dao, canonicalJson, encodeProposal, type ProposalKind } from '../lib/dao.js';
import { loadDeployments } from '../lib/deployments.js';
import { toRecord } from '../lib/evidence.js';
import { Chain } from '../lib/near.js';
import { ENGINE_LOCK, fillTemplate, loadEngine, loadTemplates } from './engine.js';

const TEMPLATE = 'commonkit-fund-float-washer-01';
const AMOUNT = nearToYocto('0.05');
const OUT = join(EVIDENCE_DIR, 'trezu.json');

const chain = new Chain();
const dep = loadDeployments();
const dormB = dep.communities['dorm-b']!;
const washer = dormB.assets.find((a) => a.startsWith('washer-01.'))!;
const dao = new Dao(chain, dormB.dao_id);

const floatFree = async (): Promise<bigint> =>
  BigInt((await chain.view<{ float_free: string }>(washer, 'get_ledger')).float_free);
const balance = async (id: string): Promise<bigint> =>
  BigInt((await chain.rpcs[0]!.viewAccount(id)).amount);

async function main(): Promise<void> {
  const engine = await loadEngine();
  const trezu = fillTemplate(engine, loadTemplates().get(TEMPLATE), {});
  const ours: ProposalKind = {
    FunctionCall: {
      receiver_id: washer,
      actions: [{ method_name: 'fund_float', args: {}, deposit: AMOUNT, gas: 60n * TGAS }],
    },
  };
  const oursKind = (encodeProposal(trezu.description, ours).proposal as { kind: unknown }).kind;
  if (canonicalJson(oursKind) !== canonicalJson(trezu.kind))
    throw new Error('Trezu engine output differs from scripts/lib encodeProposal; not filing');
  console.log(
    `Trezu engine @ ${ENGINE_LOCK.commit.slice(0, 7)}: ${TEMPLATE} -> ${canonicalJson(trezu.kind)}`,
  );
  console.log(`description: ${trezu.description}`);
  if (process.argv.includes('--dry')) return;

  const prior = existsSync(OUT)
    ? (JSON.parse(readFileSync(OUT, 'utf8')) as { proposal_id?: number })
    : null;
  let proposalId = prior?.proposal_id;
  let txs: ReturnType<typeof toRecord>[] = [];
  let spent: Record<string, string> | undefined;
  let floatDelta: bigint | undefined;

  if (proposalId === undefined) {
    // Never fund twice: refuse if an identical proposal was already approved without evidence.
    const last = await chain.view<number>(dao.id, 'get_last_proposal_id');
    const recent = await chain.view<{ id: number; description: string; status: string }[]>(
      dao.id,
      'get_proposals',
      { from_index: Math.max(0, last - 30), limit: 30 },
    );
    const done = recent.find(
      (p) => p.description === trezu.description && p.status !== 'InProgress',
    );
    if (done)
      throw new Error(`${dao.id}#${done.id} already ${done.status}; write evidence by hand`);

    const council = dormB.dao_council;
    const watch = [...council, dao.id];
    const before = Object.fromEntries(
      await Promise.all(watch.map(async (a) => [a, await balance(a)])),
    );
    const floatBefore = await floatFree();
    const r = await dao.proposeAndPass(trezu.description, ours, council);
    proposalId = r.proposalId;
    txs = r.txs.map((t) =>
      toRecord(
        t.receiver === dao.id && t.returnValue === r.proposalId
          ? 'add_proposal (bond 1 NEAR)'
          : 'act_proposal VoteApprove',
        t,
      ),
    );
    floatDelta = (await floatFree()) - floatBefore;
    spent = Object.fromEntries(
      await Promise.all(
        watch.map(async (a) => [a, yoctoToNear(before[a]! - (await balance(a)), 6)]),
      ),
    );
  }

  const p = await dao.getProposal(proposalId);
  const assertions = [
    {
      what: `proposal ${dao.id}#${proposalId} status Approved`,
      ok: p.status === 'Approved',
      detail: p.status,
    },
    {
      what: 'on-chain kind equals the Trezu engine output',
      ok: canonicalJson(p.kind) === canonicalJson(trezu.kind),
    },
    {
      what: 'on-chain description equals the Trezu engine output',
      ok: p.description === trezu.description,
    },
    {
      what: `description carries [trezu-tmpl:${TEMPLATE}]`,
      ok: p.description.includes(`[trezu-tmpl:${TEMPLATE}]`),
    },
    ...(floatDelta === undefined
      ? []
      : [
          {
            what: 'washer-01 float_free rose by 0.05 NEAR',
            ok: floatDelta === AMOUNT,
            detail: yoctoToNear(floatDelta, 6),
          },
        ]),
  ];
  for (const a of assertions)
    console.log(`${a.ok ? 'PASS' : 'FAIL'} ${a.what}${a.detail ? ` (${a.detail})` : ''}`);

  const record =
    prior?.proposal_id !== undefined
      ? { ...prior, reverified_at: new Date().toISOString(), reverify: assertions }
      : {
          what: `One real testnet proposal filed from the COMMONKIT Trezu template ${TEMPLATE}, compiled by Trezu's own engine, passed by the Dorm B council`,
          engine: {
            repo: ENGINE_LOCK.repo,
            commit: ENGINE_LOCK.commit,
            files: Object.keys(ENGINE_LOCK.files),
          },
          template: `integrations/trezu/templates/${TEMPLATE}.json`,
          dao: dao.id,
          proposal_id: proposalId,
          proposal: `${dao.id}#${proposalId}`,
          description: trezu.description,
          kind: trezu.kind,
          votes: p.votes,
          txs,
          tx_hashes: txs.map((t) => t.hash),
          explorer: txs.map((t) => explorerTx(t.hash)),
          near_spent: spent,
          assertions,
          at: new Date().toISOString(),
        };
  writeFileSync(OUT, `${JSON.stringify(record, null, 2)}\n`);
  if (assertions.some((a) => !a.ok)) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
