/**
 * seed-testnet — governance seeding, every change through a Sputnik proposal voted by the council
 * (DAO_INTEGRATION §3). Idempotent: each item is checked with a view first and skipped if done.
 * Every tx (proposal + votes) is appended to evidence/seed.json.
 *
 *   pnpm seed:testnet            roles, credential kinds, commons storage, and — for deployed
 *                                assets — register (except printer-01: judge step 1), operators,
 *                                DAO policy cache, initial float
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nearToYocto, yoctoToNear } from '@commonkit/sdk';
import { PROFILES_DIR, ROOT_ACCOUNT, TGAS } from './lib/config.js';
import { Dao, type FnAction } from './lib/dao.js';
import { loadDeployments } from './lib/deployments.js';
import { EvidenceLog } from './lib/evidence.js';
import { Chain } from './lib/near.js';
import {
  COMMUNITIES,
  OPERATORS,
  ids,
  roleAccount,
  type AssetPlan,
  type CommunityPlan,
} from './lib/topology.js';

const chain = new Chain();
const log = new EvidenceLog('seed');
const TREASURY_MARGIN = nearToYocto('0.2');

interface Ctx {
  c: CommunityPlan;
  dao: Dao;
  council: string[];
  commons: string;
}

async function pass(ctx: Ctx, label: string, receiver: string, actions: FnAction[]): Promise<void> {
  const r = await ctx.dao.proposeAndPass(
    `COMMONKIT seed (${ctx.c.slug}): ${label}`,
    { FunctionCall: { receiver_id: receiver, actions } },
    ctx.council,
  );
  log.add(`${ctx.dao.id}#${r.proposalId} ${label}`, ...r.txs);
}

/** The DAO pays attached deposits from its treasury; top it up from the root when short. */
async function ensureTreasury(ctx: Ctx, amount: bigint): Promise<void> {
  const available = BigInt(await chain.view<string>(ctx.dao.id, 'get_available_amount'));
  if (available >= amount + TREASURY_MARGIN) return;
  const short = amount + TREASURY_MARGIN - available;
  log.add(
    `treasury top-up ${ctx.dao.id} +${yoctoToNear(short, 2)} NEAR (plain transfer, research C10)`,
    await chain.transfer(ROOT_ACCOUNT, ctx.dao.id, short),
  );
}

const sameSet = (a: string[], b: string[]): boolean =>
  [...a].sort().join() === [...b].sort().join();

/** Contract engineer: set_roles needs 10 Tgas + 25 Tgas per active asset it pushes to. */
async function setRolesGas(ctx: Ctx): Promise<bigint> {
  const assets = await chain.view<{ active: boolean }[]>(ctx.commons, 'get_assets', { from_index: 0, limit: 100 });
  const active = BigInt(assets.filter((a) => a.active).length);
  return (10n + 25n * active) * TGAS;
}

async function seedRoles(ctx: Ctx): Promise<void> {
  const actions: FnAction[] = [];
  const gas = await setRolesGas(ctx);
  for (const [name, roles] of Object.entries(ctx.c.roles)) {
    const account = roleAccount(ctx.c, name);
    const current = await chain.view<string[]>(ctx.commons, 'get_roles', { account });
    if (sameSet(current, roles)) console.log(`= ${account} roles ${roles.join(',')}`);
    else actions.push({ method_name: 'set_roles', args: { account, roles }, gas });
  }
  // Σ action gas ≤ 250 Tgas per proposal (research C11); actions run atomically (C9).
  const per = Math.max(1, Number(250n * TGAS / gas));
  for (let i = 0; i < actions.length; i += per) {
    const chunk = actions.slice(i, i + per);
    const who = chunk.map((a) => (a.args as { account: string }).account.split('.')[0]).join(', ');
    await pass(ctx, `set roles for ${who}`, ctx.commons, chunk);
  }
}

async function seedCredentialKinds(ctx: Ctx): Promise<void> {
  const existing = await chain.view<{ kind: string }[]>(ctx.commons, 'get_credential_kinds');
  for (const config of ctx.c.credentialKinds) {
    const prev = existing.find((k) => k.kind === config.kind);
    if (prev && JSON.stringify(prev) === JSON.stringify({ ...prev, ...config })) {
      console.log(`= credential kind ${config.kind}`);
      continue;
    }
    await pass(ctx, `credential kind ${config.kind}`, ctx.commons, [
      { method_name: 'set_credential_kind', args: { config }, gas: 30n * TGAS },
    ]);
  }
}

async function seedCommonsStorage(ctx: Ctx): Promise<void> {
  const done = log.records().some((r) => r.ok && r.label.includes(`fund_storage ${ctx.commons}`));
  if (done) return console.log(`= ${ctx.commons} storage funded`);
  await ensureTreasury(ctx, ctx.c.commonsStorageFund);
  await pass(
    ctx,
    `fund_storage ${ctx.commons} ${yoctoToNear(ctx.c.commonsStorageFund)} NEAR`,
    ctx.commons,
    [{ method_name: 'fund_storage', args: {}, deposit: ctx.c.commonsStorageFund, gas: 20n * TGAS }],
  );
}

async function seedAsset(ctx: Ctx, a: AssetPlan): Promise<void> {
  const id = ids.asset(ctx.c, a);
  if (!(await chain.accountExists(id)) || !loadDeployments().accounts[id]?.code_hash) {
    console.log(`- ${id} not deployed yet (setup --with-assets); skipped`);
    return;
  }
  const { profile } = JSON.parse(readFileSync(join(PROFILES_DIR, a.profileFile), 'utf8')) as {
    profile: { group_id: string };
  };
  const bridge = ids.operator(OPERATORS.bridge.name);
  const agent = ids.operator(OPERATORS.agent.name);

  const w = await chain.view<{
    bridge_id: string | null;
    agent_id: string | null;
    dao_proposal_bond: string | null;
  }>(id, 'get_wiring');
  if (w.bridge_id === bridge && w.agent_id === agent) console.log(`= ${id} operators`);
  else
    await pass(ctx, `set_operators on ${a.slug}`, id, [
      {
        method_name: 'set_operators',
        args: { bridge_id: bridge, agent_id: agent },
        gas: 30n * TGAS,
      },
    ]);

  // ANY method (CONTRACT_SPEC §3.5): caches the DAO bond/period the asset needs to escalate.
  if (!w.dao_proposal_bond)
    log.add(
      `refresh_dao_policy ${a.slug}`,
      await chain.call(ROOT_ACCOUNT, id, 'refresh_dao_policy', {}, { gas: 60n * TGAS }),
    );

  if (a.registeredBy !== 'seed') {
    console.log(`- ${a.slug}: registration + float are judge step 1 (pnpm demo:step 1)`);
    return;
  }
  const registered = await chain
    .view<{ active: boolean } | null>(ctx.commons, 'get_asset', { asset_id: id })
    .catch(() => null);
  if (registered?.active) console.log(`= ${id} registered`);
  else
    await pass(ctx, `register_asset ${a.slug} in ${profile.group_id}`, ctx.commons, [
      {
        method_name: 'register_asset',
        args: { asset_id: id, group_id: profile.group_id },
        gas: 100n * TGAS,
      },
    ]);

  const ledger = await chain.view<{ float_free: string; total_swept: string }>(id, 'get_ledger');
  const funded = log.records().some((r) => r.ok && r.label.includes(`fund_float ${a.slug}`));
  if (funded || BigInt(ledger.float_free) > 0n)
    console.log(`= ${id} float ${yoctoToNear(ledger.float_free)} NEAR`);
  else {
    await ensureTreasury(ctx, a.initialFloat);
    await pass(ctx, `fund_float ${a.slug} ${yoctoToNear(a.initialFloat)} NEAR`, id, [
      { method_name: 'fund_float', args: {}, deposit: a.initialFloat, gas: 60n * TGAS },
    ]);
  }
}

async function main(): Promise<void> {
  const dep = loadDeployments();
  for (const c of COMMUNITIES) {
    const entry = dep.communities[c.slug];
    if (!entry)
      throw new Error(
        `${c.slug} missing in deployments/testnet.json — run pnpm setup:testnet first`,
      );
    const dao = new Dao(chain, entry.dao_id);
    const council = c.council.map((m) => ids.council(c, m.name));
    const onChain = await dao.council();
    if (!sameSet(onChain, council)) throw new Error(`${dao.id} council differs from plan`);
    const ctx: Ctx = { c, dao, council, commons: entry.commons_id };
    console.log(`\n# ${c.name}: ${dao.id}`);
    await seedRoles(ctx);
    await seedCredentialKinds(ctx);
    await seedCommonsStorage(ctx);
    for (const a of c.assets) await seedAsset(ctx, a);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
