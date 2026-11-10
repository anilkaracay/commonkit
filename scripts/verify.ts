/**
 * verify — read-only, keyless verification of the on-chain claims in deployments/testnet.json
 * (TEST_PLAN §6). Uses only public RPC views; never loads a key. Exit code 1 on any ❌.
 *
 *   tsx verify.ts [--allow-pending] [--offline]
 *     --allow-pending: accounts still marked keyless "pending" (before M1c sign-off) print ⏳ instead of ❌
 *     --offline: check 11 reads evidence/steps.json only ("evidence completeness (not on-chain)")
 *                instead of re-reading one transaction per judge step on chain
 */
import './demo/lib/rpc-throttle.mjs';
import { existsSync } from 'node:fs';
import { NearRpc, RpcError, yoctoToNear } from '@commonkit/sdk';
import { EVIDENCE_DIR, RPC_URLS, SPUTNIK_FACTORY, WASM_PATHS } from './lib/config.js';
import { runEvidenceChecks } from './demo/lib/verify-checks.js';
import { txStatusFn } from './demo/lib/tx-status.js';
import { codeHash } from './lib/code.js';
import { loadDeployments, type Deployments } from './lib/deployments.js';
import { RESERVE_MAX_USAGE_PCT } from './lib/funding.js';
import { AGENT_METHODS, BRIDGE_METHODS } from './lib/topology.js';
import { readFileSync } from 'node:fs';

export type Mark = '✅' | '❌' | '⏳' | 'ℹ️';
export interface CheckLine {
  check: number;
  mark: Mark;
  text: string;
}

const lines: CheckLine[] = [];
const out = (check: number, mark: Mark, text: string): void => {
  lines.push({ check, mark, text });
  console.log(`${mark} [${check}] ${text}`);
};

const rpcs = RPC_URLS.map((u) => new NearRpc(u));
async function rpc<T>(fn: (r: NearRpc) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const r of rpcs) {
    try {
      return await fn(r);
    } catch (e) {
      last = e;
      if (e instanceof RpcError && !/^RPC HTTP/.test(e.message)) throw e;
    }
  }
  throw last;
}
const view = <T>(id: string, m: string, a: object = {}) => rpc((r) => r.view<T>(id, m, a));

type FcPermission =
  | { FunctionCall: { receiver_id: string; method_names: string[]; allowance: string | null } }
  | 'FullAccess';

async function checkKeyless(dep: Deployments, allowPending: boolean): Promise<void> {
  for (const [id, a] of Object.entries(dep.accounts)) {
    if (a.role === 'asset' || a.role === 'commons' || a.role === 'dao') {
      if (a.keyless === false) out(1, '❌', `${id} (${a.role}) is not marked keyless`);
    }
    if (a.keyless === false) continue;
    const keys = (await rpc((r) => r.viewAccessKeyList(id))).keys;
    if (a.keyless === true)
      out(1, keys.length === 0 ? '✅' : '❌', `${id} access keys: ${keys.length}`);
    else
      out(
        1,
        allowPending ? '⏳' : '❌',
        `${id} keyless pending (keys: ${keys.length}; deleted only after the lead's keyless go)`,
      );
  }
}

/**
 * D-218: the same source built in Docker (`cargo near build reproducible-wasm`, image
 * sourcescan/cargo-near:0.22.0-rust-1.99.1@sha256:c9655eaf…) gives these hashes. They are
 * informational only: the deployed code is the host build recorded in deployments/testnet.json.
 */
const REPRODUCIBLE_BUILD: Record<'asset' | 'commons', { code_hash: string; sha256: string }> = {
  asset: {
    code_hash: '3FtaAtUnyxfeMByZpnQZkVFvZdBGFa4x66ddSei3Fy3s',
    sha256: '2187d155fd81d2044291e9e602167eff98ae9eb5492b5aa8ec05b1949f890536',
  },
  commons: {
    code_hash: '5ri99gzKfa3WFRJDFdRFiAQXRo1aqJCt8L7uZ8tKZ79w',
    sha256: '482ab99eb0fa9c751870ab650d38a563d0563f32cc0974419be560e3bf23ef9e',
  },
};

async function checkCode(
  dep: Deployments,
  role: 'asset' | 'commons',
  check: number,
): Promise<void> {
  const ids = Object.entries(dep.accounts)
    .filter(([, a]) => a.role === role)
    .map(([id]) => id);
  if (ids.length === 0) return out(check, 'ℹ️', `no ${role} accounts deployed yet`);
  const hashes = new Map<string, string>();
  for (const id of ids) hashes.set(id, (await rpc((r) => r.viewAccount(id))).code_hash);
  const distinct = [...new Set(hashes.values())];
  out(
    check,
    distinct.length === 1 ? '✅' : '❌',
    `${ids.length} ${role} account(s) share code_hash ${distinct.join(' / ')}`,
  );
  const recorded = dep.code[role];
  if (recorded)
    out(
      check,
      distinct[0] === recorded.code_hash ? '✅' : '❌',
      `${role} code_hash matches deployments record (${recorded.build} build, sha256 ${recorded.sha256.slice(0, 16)}…)`,
    );
  const local = WASM_PATHS[role];
  if (existsSync(local)) {
    const h = codeHash(new Uint8Array(readFileSync(local)));
    out(
      check,
      'ℹ️',
      `local ${role} wasm code_hash ${h}${h === distinct[0] ? ' (matches)' : ' (differs: the deployed code is a host build with rustc 1.98.1 + cargo-near 0.23.0, D-218)'}`,
    );
  }
  const repro = REPRODUCIBLE_BUILD[role];
  out(
    check,
    'ℹ️',
    `${role} Docker reproducible build of the same source: code_hash ${repro.code_hash} (sha256 ${repro.sha256.slice(0, 16)}…) — not the deployed code (D-218)`,
  );
}

async function checkDaos(dep: Deployments): Promise<void> {
  const list = await view<string[]>(SPUTNIK_FACTORY, 'get_dao_list');
  const defaultHash = await view<string>(SPUTNIK_FACTORY, 'get_default_code_hash');
  for (const c of Object.values(dep.communities)) {
    out(
      4,
      list.includes(c.dao_id) ? '✅' : '❌',
      `${c.dao_id} is listed by ${SPUTNIK_FACTORY}.get_dao_list`,
    );
    const acct = await rpc((r) => r.viewAccount(c.dao_id));
    out(
      4,
      acct.code_hash === defaultHash ? '✅' : '❌',
      `${c.dao_id} runs the factory default code (${acct.code_hash})`,
    );
    const policy = await view<{ roles: { name: string; kind: { Group?: string[] } }[] }>(
      c.dao_id,
      'get_policy',
    );
    const council = policy.roles.find((r) => r.name === 'council')?.kind.Group ?? [];
    const same = [...council].sort().join() === [...c.dao_council].sort().join();
    out(4, same ? '✅' : '❌', `${c.dao_id} council = ${council.length} recorded accounts`);
  }
}

async function checkWiring(dep: Deployments): Promise<void> {
  for (const [slug, c] of Object.entries(dep.communities)) {
    const w = await view<{ dao_id: string }>(c.commons_id, 'get_wiring');
    out(5, w.dao_id === c.dao_id ? '✅' : '❌', `${c.commons_id} → dao ${w.dao_id}`);
    for (const assetId of c.assets) {
      const aw = await view<{
        dao_id: string;
        commons_id: string;
        bridge_id: string | null;
        agent_id: string | null;
      }>(assetId, 'get_wiring');
      const ok = aw.dao_id === c.dao_id && aw.commons_id === c.commons_id;
      out(5, ok ? '✅' : '❌', `${assetId} → dao ${aw.dao_id}, commons ${aw.commons_id}`);
      const reg = await view<{ group_id: string; active: boolean } | null>(
        c.commons_id,
        'get_asset',
        { asset_id: assetId },
      );
      const expectedGroup = dep.accounts[assetId]?.group_id;
      if (!reg) out(5, 'ℹ️', `${assetId} not registered in ${slug} commons yet`);
      else
        out(
          5,
          reg.active && reg.group_id === expectedGroup ? '✅' : '❌',
          `${assetId} registered in group ${reg.group_id} (active ${reg.active})`,
        );
      await checkOperatorKey(dep, aw.bridge_id, assetId, BRIDGE_METHODS, 'bridge');
      await checkOperatorKey(dep, aw.agent_id, assetId, AGENT_METHODS, 'agent');
    }
  }
}

/** The operator's keys for this asset must be function-call keys with exactly the spec's methods. */
async function checkOperatorKey(
  dep: Deployments,
  operator: string | null,
  assetId: string,
  methods: string[],
  what: string,
): Promise<void> {
  if (!operator) return out(5, 'ℹ️', `${assetId} has no ${what} set yet`);
  const keys = (await rpc((r) => r.viewAccessKeyList(operator))).keys as {
    public_key: string;
    access_key: { permission: FcPermission };
  }[];
  const forAsset = keys.filter(
    (k) =>
      k.access_key.permission !== 'FullAccess' &&
      k.access_key.permission.FunctionCall.receiver_id === assetId,
  );
  if (forAsset.length === 0)
    return out(5, '❌', `${operator} has no function-call key for ${assetId}`);
  for (const k of forAsset) {
    const p = (k.access_key.permission as Exclude<FcPermission, 'FullAccess'>).FunctionCall;
    const exact = [...p.method_names].sort().join() === [...methods].sort().join();
    out(
      5,
      exact ? '✅' : '❌',
      `${what} key ${k.public_key.slice(0, 16)}… → ${assetId}: ${p.method_names.join(', ')}`,
    );
  }
  void dep;
}

interface Ledger {
  invariant_ok: boolean;
  float_free: string;
  float_cap: string;
  storage_cost: string;
  storage_reserve: string;
  balance: string;
}

async function checkLedgers(dep: Deployments): Promise<void> {
  const assets = Object.entries(dep.accounts)
    .filter(([, a]) => a.role === 'asset')
    .map(([id]) => id);
  for (const id of assets) {
    const l = await view<Ledger>(id, 'get_ledger');
    out(
      5,
      l.invariant_ok ? '✅' : '❌',
      `${id} ledger invariant_ok (balance ${yoctoToNear(l.balance)} NEAR)`,
    );
    const floatOk = BigInt(l.float_free) <= BigInt(l.float_cap);
    out(
      5,
      floatOk ? '✅' : '❌',
      `${id} float ${yoctoToNear(l.float_free)} ≤ cap ${yoctoToNear(l.float_cap)} NEAR`,
    );
    const pct = (BigInt(l.storage_cost) * 100n) / BigInt(l.storage_reserve);
    out(
      5,
      pct < RESERVE_MAX_USAGE_PCT ? '✅' : '❌',
      `${id} storage ${yoctoToNear(l.storage_cost, 2)} NEAR = ${pct}% of reserve (must be < ${RESERVE_MAX_USAGE_PCT}%)`,
    );
  }
}

async function main(): Promise<void> {
  const allowPending = process.argv.includes('--allow-pending');
  const dep = loadDeployments();
  console.log(
    `COMMONKIT verify (read-only, testnet) — ${Object.keys(dep.accounts).length} accounts, ${Object.keys(dep.communities).length} communities\n`,
  );
  await checkKeyless(dep, allowPending);
  await checkCode(dep, 'asset', 2);
  await checkCode(dep, 'commons', 3);
  await checkDaos(dep);
  await checkWiring(dep);
  await checkLedgers(dep);
  // TEST_PLAN §6 checks 6–11: sweeps, rights ↔ tasks, escalations, reimbursement caps, service log, evidence steps.
  // --offline: check 11 reads evidence only ("evidence completeness (not on-chain)").
  const offline = process.argv.includes('--offline');
  for (const l of await runEvidenceChecks(view, dep, EVIDENCE_DIR, 21, offline ? undefined : txStatusFn()))
    out(l.check, l.info ? 'ℹ️' : l.ok ? '✅' : '❌', l.text);
  const failed = lines.filter((l) => l.mark === '❌').length;
  console.log(
    `\n${failed === 0 ? '✅ all checks passed' : `❌ ${failed} check(s) failed`} (${lines.length} lines)`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error('❌ verify could not run:', e instanceof Error ? e.message : e);
  process.exit(1);
});
