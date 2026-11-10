/**
 * setup-testnet — create the COMMONKIT testnet topology (DAO_INTEGRATION, CONTRACT_SPEC §11, D-105).
 * Idempotent and resumable: reads deployments/testnet.json and the chain, skips what exists,
 * verifies state with views, and records every tx in evidence/setup.json.
 *
 *   pnpm setup:testnet --plan                 funding plan only (no tx)
 *   pnpm setup:testnet                        operators, community roots, councils, DAOs, commons
 *   pnpm setup:testnet --with-members         + demo cast accounts
 *   pnpm setup:testnet --with-assets          + asset accounts (deploy + init) and bridge/agent keys
 *   pnpm setup:testnet --all                  = --with-members --with-assets
 *   pnpm setup:testnet --finalize-keyless     delete full-access keys on commons/asset accounts marked
 *                                             keyless "pending" (after init + topology checks), then
 *                                             verify their key lists are empty
 *
 * Deployment file schema: see scripts/lib/deployments.ts. Contract accounts start as
 * `keyless: "pending"`; only --finalize-keyless turns them into `keyless: true`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nearToYocto, yoctoToNear } from '@commonkit/sdk';
import { PROFILES_DIR, ROOT_ACCOUNT, TGAS } from './lib/config.js';
import { abiMethods, loadWasm, type Wasm } from './lib/code.js';
import { Dao } from './lib/dao.js';
import { loadDeployments, updateDeployments, type AccountEntry } from './lib/deployments.js';
import { EvidenceLog } from './lib/evidence.js';
import {
  COUNCIL_PROPOSER,
  COUNCIL_VOTER,
  DAO_CREATE_DEPOSIT,
  RESERVE_MAX_USAGE_PCT,
  ASSET_STATE_HEADROOM_BYTES,
  assetAccountFunding,
  BYTE_COST,
  commonsAccountFunding,
  faucetDropsNeeded,
  formatPlan,
  fundingPlan,
  sumLines,
} from './lib/funding.js';
import { Chain } from './lib/near.js';
import {
  AGENT_METHODS,
  BRIDGE_METHODS,
  COMMUNITIES,
  MEMBERS,
  OPERATORS,
  ids,
  type AssetPlan,
  type CommunityPlan,
} from './lib/topology.js';

const argv = new Set(process.argv.slice(2));
const ALL = argv.has('--all');
const opts = {
  plan: argv.has('--plan'),
  members: ALL || argv.has('--with-members'),
  assets: ALL || argv.has('--with-assets'),
  finalize: argv.has('--finalize-keyless'),
  allowTightReserve: argv.has('--allow-tight-reserve'),
};

const PARENT_MARGIN = nearToYocto('0.2');
const TOP_UP_SLACK = nearToYocto('0.1');
const FC_KEY_ALLOWANCE = nearToYocto('1');
const NO_CODE = '11111111111111111111111111111111';

const chain = new Chain();
const log = new EvidenceLog('setup');

function profileOf(a: AssetPlan): {
  profile: Record<string, unknown> & { storage_reserve: string; group_id: string };
} {
  return JSON.parse(readFileSync(join(PROFILES_DIR, a.profileFile), 'utf8'));
}

function record(id: string, entry: Partial<AccountEntry>): void {
  updateDeployments({ accounts: { [id]: entry } });
}

/** Make sure `account` holds `need` + margin; community roots are topped up from the root. */
async function ensureBalance(account: string, need: bigint): Promise<void> {
  const have = await chain.balance(account);
  if (have >= need + PARENT_MARGIN) return;
  const short = need + PARENT_MARGIN - have;
  if (account === ROOT_ACCOUNT)
    throw new Error(
      `root ${ROOT_ACCOUNT} needs ${yoctoToNear(short, 2)} more NEAR — run scripts/fund-testnet.ts`,
    );
  await ensureBalance(ROOT_ACCOUNT, short);
  log.add(
    `top up ${account} with ${yoctoToNear(short, 2)} NEAR`,
    await chain.transfer(ROOT_ACCOUNT, account, short),
  );
}

async function ensureSubAccount(
  parent: string,
  id: string,
  amount: bigint,
  meta: Omit<AccountEntry, 'created_tx'>,
): Promise<void> {
  if (await chain.accountExists(id)) {
    record(id, meta);
    const have = await chain.balance(id);
    // Spendable accounts are topped back up to their planned balance (fees, votes, demo deposits).
    if (meta.role !== 'community-root' && have + TOP_UP_SLACK < amount) {
      await ensureBalance(ROOT_ACCOUNT, amount - have);
      log.add(
        `top up ${id} to ${yoctoToNear(amount, 2)} NEAR`,
        await chain.transfer(ROOT_ACCOUNT, id, amount - have),
      );
    } else console.log(`= ${id} exists`);
    return;
  }
  await ensureBalance(parent, amount);
  const { tx } = await chain.createSubAccount(parent, id, amount);
  log.add(`create ${id} (${yoctoToNear(amount, 2)} NEAR)`, tx);
  record(id, { ...meta, created_tx: tx.hash, initial_balance: amount.toString() });
}

/** Deploy + init a contract account; skip if already initialised with the expected code. */
async function ensureContract(
  parent: string,
  id: string,
  wasm: Wasm,
  amount: bigint,
  init: { method: string; args: object },
  meta: Omit<AccountEntry, 'created_tx' | 'deploy_tx'>,
): Promise<void> {
  const prev = loadDeployments().accounts[id];
  const entry: Partial<AccountEntry> = {
    ...meta,
    keyless: prev?.keyless === true ? true : 'pending',
  };
  if (await chain.accountExists(id)) {
    const acct = await chain.viewAccount(id);
    if (acct.code_hash === NO_CODE && meta.role === 'asset')
      throw new Error(`${id} exists without code; chain-ops never signs as an asset account — investigate manually`);
    if (acct.code_hash === NO_CODE) {
      const tx = await chain.deployAndInit(id, wasm.bytes, { ...init, gas: 100n * TGAS });
      log.add(`deploy + init ${id}`, tx);
      entry.deploy_tx = tx.hash;
    } else if (acct.code_hash !== wasm.entry.code_hash) {
      console.warn(
        `! ${id} runs code ${acct.code_hash}, local build is ${wasm.entry.code_hash} (not redeployed)`,
      );
    } else console.log(`= ${id} deployed (${acct.code_hash})`);
    entry.code_hash = (await chain.viewAccount(id)).code_hash;
    record(id, entry);
    return;
  }
  await ensureBalance(parent, amount);
  const { tx } = await chain.createAndDeploy(parent, id, amount, wasm.bytes, {
    ...init,
    gas: 100n * TGAS,
  });
  log.add(`create + deploy + init ${id} (${yoctoToNear(amount, 2)} NEAR)`, tx);
  record(id, {
    ...entry,
    created_tx: tx.hash,
    deploy_tx: tx.hash,
    initial_balance: amount.toString(),
    code_hash: wasm.entry.code_hash,
  });
}

async function setupOperatorsAndMembers(): Promise<void> {
  for (const [role, o] of Object.entries(OPERATORS))
    await ensureSubAccount(ROOT_ACCOUNT, ids.operator(o.name), o.balance, {
      role: role as 'bridge' | 'agent' | 'supplier',
      kind: role === 'supplier' ? 'demo-bot' : 'team',
      keyless: false,
      label: o.label,
    });
  if (!opts.members) return;
  for (const m of MEMBERS)
    await ensureSubAccount(ROOT_ACCOUNT, ids.member(m.name), m.balance, {
      role: 'member',
      kind: m.kind,
      keyless: false,
      label: m.label,
    });
}

async function setupCommunity(c: CommunityPlan, commonsWasm: Wasm): Promise<void> {
  const root = ids.communityRoot(c);
  console.log(`\n# ${c.name} (${root})`);
  await ensureSubAccount(ROOT_ACCOUNT, root, nearToYocto('0.5'), {
    role: 'community-root',
    kind: 'team',
    keyless: false,
    community: c.slug,
    label: `${c.name} community root: creates commons/asset/council sub-accounts, holds no community money (D-105)`,
  });
  const council = c.council.map((m) => ids.council(c, m.name));
  // One top-up for everything this community root is about to create (fewer txs than per child).
  let pending = 0n;
  for (const [i, id] of council.entries())
    if (!(await chain.accountExists(id))) pending += i === 0 ? COUNCIL_PROPOSER : COUNCIL_VOTER;
  if (!(await chain.accountExists(ids.commons(c))))
    pending += commonsAccountFunding(commonsWasm.entry.bytes);
  if (pending > 0n) await ensureBalance(root, pending);
  for (const [i, m] of c.council.entries())
    await ensureSubAccount(root, council[i]!, i === 0 ? COUNCIL_PROPOSER : COUNCIL_VOTER, {
      role: 'council',
      kind: m.kind,
      keyless: false,
      community: c.slug,
      label: m.label,
    });

  // DAO via the public factory (research C2): default policy, council 2-of-3 (D-103).
  const daoId = ids.dao(c);
  let daoTx: string | undefined;
  if (!(await chain.accountExists(daoId))) {
    await ensureBalance(ROOT_ACCOUNT, DAO_CREATE_DEPOSIT);
    const { tx } = await Dao.create(
      chain,
      ROOT_ACCOUNT,
      c.daoName,
      c.purpose,
      council,
      DAO_CREATE_DEPOSIT,
    );
    log.add(`create DAO ${daoId}`, tx);
    daoTx = tx.hash;
  } else console.log(`= ${daoId} exists`);
  const dao = new Dao(chain, daoId);
  const onChainCouncil = await dao.council();
  if ([...onChainCouncil].sort().join() !== [...council].sort().join())
    throw new Error(`${daoId} council ${onChainCouncil.join()} != planned ${council.join()}`);
  const daoKeys = await chain.accessKeys(daoId);
  record(daoId, {
    role: 'dao',
    kind: 'contract',
    keyless: daoKeys.length === 0,
    community: c.slug,
    label: `${c.name} Sputnik DAO v2 (factory ${'sputnikv2.testnet'})`,
    code_hash: (await chain.viewAccount(daoId)).code_hash,
    ...(daoTx ? { created_tx: daoTx } : {}),
  });

  // Commons contract (CONTRACT_SPEC §5 `new(dao_id, name, metadata)`).
  const commonsId = ids.commons(c);
  await ensureContract(
    root,
    commonsId,
    commonsWasm,
    commonsAccountFunding(commonsWasm.entry.bytes),
    {
      method: 'new',
      args: {
        dao_id: daoId,
        name: c.name,
        metadata: {
          spec: 'nft-1.0.0',
          name: `COMMONKIT ${c.name} cards`,
          symbol: `CK-${c.slug.toUpperCase()}`,
          icon: null,
          base_uri: null,
          reference: null,
          reference_hash: null,
        },
      },
    },
    {
      role: 'commons',
      kind: 'contract',
      keyless: 'pending',
      community: c.slug,
      label: `${c.name} commons (roles, credentials, NEP-171 cards)`,
    },
  );
  const wiring = await chain.view<{ dao_id: string; name: string }>(commonsId, 'get_wiring');
  if (wiring.dao_id !== daoId || wiring.name !== c.name)
    throw new Error(`${commonsId} wiring ${JSON.stringify(wiring)} unexpected`);
  console.log(`✓ ${commonsId} wired to ${daoId}`);

  const commonsTx = loadDeployments().accounts[commonsId]?.created_tx;
  updateDeployments({
    communities: {
      [c.slug]: {
        name: c.name,
        root_account: root,
        dao_id: daoId,
        dao_council: council,
        commons_id: commonsId,
        assets: [],
        ...(daoTx ? { dao_tx: daoTx } : {}),
        ...(commonsTx ? { commons_tx: commonsTx } : {}),
      },
    },
  });
}

function checkAssetWasm(): void {
  const methods = abiMethods('asset');
  const missing = [...BRIDGE_METHODS, ...AGENT_METHODS, 'new', 'get_wiring', 'get_ledger'].filter(
    (m) => !methods.includes(m),
  );
  if (methods.length === 0 || missing.length)
    throw new Error(`asset wasm/ABI is stale or incomplete; missing: ${missing.join(', ')}`);
}

async function setupAssets(c: CommunityPlan, assetWasm: Wasm): Promise<void> {
  const root = ids.communityRoot(c);
  for (const a of c.assets) {
    const id = ids.asset(c, a);
    const { profile } = profileOf(a);
    const reserve = BigInt(profile.storage_reserve);
    const need = (BigInt(assetWasm.entry.bytes) + ASSET_STATE_HEADROOM_BYTES) * BYTE_COST * 100n;
    if (need > reserve * RESERVE_MAX_USAGE_PCT && !opts.allowTightReserve)
      throw new Error(
        `${a.profileFile} storage_reserve ${yoctoToNear(reserve)} NEAR is too small for a ${assetWasm.entry.bytes}-byte wasm ` +
          `(+${ASSET_STATE_HEADROOM_BYTES} B state must stay ≤ ${RESERVE_MAX_USAGE_PCT}%); raise it or pass --allow-tight-reserve`,
      );
    await ensureContract(
      root,
      id,
      assetWasm,
      assetAccountFunding(reserve, assetWasm.entry.bytes),
      { method: 'new', args: { dao_id: ids.dao(c), commons_id: ids.commons(c), profile } },
      {
        role: 'asset',
        kind: 'contract',
        keyless: 'pending',
        community: c.slug,
        profile: `profiles/${a.profileFile}`,
        group_id: profile.group_id,
        label: `${a.slug} (${String(profile.asset_type)}, simulation, D-022)`,
      },
    );
    const w = await chain.view<{ dao_id: string; commons_id: string }>(id, 'get_wiring');
    if (w.dao_id !== ids.dao(c) || w.commons_id !== ids.commons(c))
      throw new Error(`${id} wiring ${JSON.stringify(w)} unexpected`);
    const ledger = await chain.view<{ invariant_ok: boolean; storage_reserve: string }>(
      id,
      'get_ledger',
    );
    if (!ledger.invariant_ok) throw new Error(`${id} ledger invariant false right after init`);
    console.log(`✓ ${id} wired (dao, commons), invariant_ok`);
    updateDeployments({ communities: { [c.slug]: { assets: [id] } } });
    await ensureOperatorKey('bridge', id, BRIDGE_METHODS);
    await ensureOperatorKey('agent', id, AGENT_METHODS);
  }
}

/** One function-call key per (operator, asset): receiver = asset, exact method list (CONTRACT_SPEC). */
async function ensureOperatorKey(
  op: 'bridge' | 'agent',
  assetId: string,
  methods: string[],
): Promise<void> {
  const account = ids.operator(OPERATORS[op].name);
  const onChain = await chain.accessKeys(account);
  const known = loadDeployments().function_call_keys.find(
    (k) =>
      k.account === account &&
      k.receiver_id === assetId &&
      onChain.some((x) => x.public_key === k.public_key),
  );
  if (known && known.method_names.join() === methods.join()) {
    console.log(`= ${op} key for ${assetId}`);
    return;
  }
  const { tx, publicKey } = await chain.addFunctionCallKey(
    account,
    assetId,
    methods,
    FC_KEY_ALLOWANCE,
  );
  log.add(`${op} function-call key → ${assetId}`, tx);
  updateDeployments({
    function_call_keys: [
      { account, public_key: publicKey, receiver_id: assetId, method_names: methods, tx: tx.hash },
    ],
  });
}

/** CONTRACT_SPEC §11 step 3, D-105: only after every planned account exists and init is verified. */
async function finalizeKeyless(): Promise<void> {
  const dep = loadDeployments();
  const planned = [
    ...Object.values(OPERATORS).map((o) => ids.operator(o.name)),
    ...MEMBERS.map((m) => ids.member(m.name)),
    ...COMMUNITIES.flatMap((c) => [
      ids.communityRoot(c),
      ids.commons(c),
      ...c.council.map((m) => ids.council(c, m.name)),
      ...c.assets.map((a) => ids.asset(c, a)),
    ]),
  ];
  for (const id of planned)
    if (!(await chain.accountExists(id)))
      throw new Error(`refusing to delete keys: ${id} does not exist yet (D-105)`);
  for (const [id, a] of Object.entries(dep.accounts)) {
    if (a.keyless !== 'pending' || (a.role !== 'asset' && a.role !== 'commons')) continue;
    const c = COMMUNITIES.find((x) => x.slug === a.community);
    if (!c) throw new Error(`${id}: unknown community ${a.community}`);
    const w = await chain.view<{ dao_id: string; commons_id?: string }>(id, 'get_wiring');
    if (w.dao_id !== ids.dao(c) || (a.role === 'asset' && w.commons_id !== ids.commons(c)))
      throw new Error(`${id}: wiring not as planned, keys kept`);
    const expected = a.role === 'asset' ? dep.code.asset?.code_hash : dep.code.commons?.code_hash;
    const actual = (await chain.viewAccount(id)).code_hash;
    if (!expected || actual !== expected)
      throw new Error(`${id}: code_hash ${actual} != recorded ${expected}, keys kept`);
    const hashes: string[] = [];
    for (const k of await chain.accessKeys(id)) {
      if (!chain.keystore.has(id, k.public_key))
        throw new Error(`${id}: key ${k.public_key} not in keychain; cannot delete`);
      const tx = await chain.deleteKey(id, k.public_key);
      log.add(`delete key ${k.public_key} on ${id}`, tx);
      hashes.push(tx.hash);
    }
    const left = await chain.accessKeys(id);
    if (left.length !== 0) throw new Error(`${id}: ${left.length} keys left after deletion`);
    record(id, { keyless: true, keys_deleted_tx: hashes });
    console.log(`✓ ${id} keyless (view_access_key_list empty)`);
  }
}

async function printPlan(assetWasm: Wasm | null, commonsWasm: Wasm): Promise<void> {
  const reserves: Record<string, bigint> = {};
  for (const c of COMMUNITIES)
    for (const a of c.assets)
      reserves[a.profileFile] = BigInt(profileOf(a).profile.storage_reserve);
  const lines = fundingPlan({
    assetWasmBytes: assetWasm?.entry.bytes ?? 460_000,
    commonsWasmBytes: commonsWasm.entry.bytes,
    profileReserves: reserves,
  });
  const total = sumLines(lines);
  const dry = sumLines(lines, true);
  const have = await chain.balance(ROOT_ACCOUNT);
  console.log(formatPlan(lines));
  console.log(
    `\n(* = dry run) dry run ${yoctoToNear(dry, 2)} NEAR · full ${yoctoToNear(total, 2)} NEAR · root has ${yoctoToNear(have, 2)} NEAR`,
  );
  console.log(
    `faucet drops: dry run ${faucetDropsNeeded(dry, have)}, full ${faucetDropsNeeded(total, have)} (minus what is already spent on existing accounts)`,
  );
}

async function main(): Promise<void> {
  const commonsWasm = loadWasm('commons');
  const assetWasm = opts.assets || opts.plan ? loadWasm('asset') : null;
  if (opts.plan) return printPlan(assetWasm, commonsWasm);

  // A code entry is written once per code_hash, so `git_commit` = HEAD when that build was first recorded.
  const known = loadDeployments().code;
  const fresh = (w: Wasm | null, prev?: { code_hash: string }) =>
    w && prev?.code_hash !== w.entry.code_hash ? w.entry : undefined;
  const commonsEntry = fresh(commonsWasm, known.commons);
  const assetEntry = fresh(assetWasm, known.asset);
  updateDeployments({
    code: {
      ...(commonsEntry ? { commons: commonsEntry } : {}),
      ...(assetEntry ? { asset: assetEntry } : {}),
    },
    accounts: {
      [ROOT_ACCOUNT]: {
        role: 'root',
        kind: 'team',
        keyless: false,
        label: 'Team root (D-012), keeps its key',
      },
    },
  });
  if (opts.finalize) return finalizeKeyless();

  await setupOperatorsAndMembers();
  for (const c of COMMUNITIES) await setupCommunity(c, commonsWasm);
  if (assetWasm) {
    checkAssetWasm();
    for (const c of COMMUNITIES) await setupAssets(c, assetWasm);
  }
  console.log(
    `\nroot balance ${yoctoToNear(await chain.balance(ROOT_ACCOUNT), 2)} NEAR · deployments/testnet.json updated`,
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
