/**
 * Testnet DataSource: every number comes from NEAR RPC views (via @commonkit/sdk NearRpc) or
 * from files bundled at build time (deployments/testnet.json, evidence/, profiles/).
 * Argument types follow each contract: asset views page with U64 strings, commons views with
 * u64 numbers, NEP-171 `nft_tokens` with a U128 string, Sputnik with numbers.
 */
import { NearRpc } from '@commonkit/sdk';
import { throttledFetch } from './throttle';
import type { AssetViews, CommonsViews, DaoViews, DataSource } from '../source';
import type { AccessKeyInfo, AccountState, Policy, Proposal } from '../offchain';
import type { AccountId } from '../types';
import { loadCatalog } from '../catalog';
import { bundledAgentLimits, bundledDeployment, bundledSteps, bundledTxLog } from '../bundled';

const MAX_PAGE = 100;
/**
 * FastNEAR's public testnet RPC answers browsers with CORS headers (D-106: FastNEAR primary);
 * rpc.testnet.near.org rate-limits bursts with 429s that carry no CORS header (seen 2026-11-10).
 * Override with VITE_NEAR_RPC (e.g. a keyed endpoint for the hosted demo).
 */
export const DEFAULT_TESTNET_RPC = 'https://test.rpc.fastnear.com';
// rpc.testnet.near.org is left out: its 429s carry no CORS header, so browsers cannot even retry cleanly.
const FALLBACK_TESTNET_RPC = ['https://rpc.testnet.fastnear.com'];
const lim = (n: number) => Math.min(n, MAX_PAGE);

export interface RpcSourceOptions {
  rpcUrl?: string;
  rpc?: NearRpc;
}

export function createRpcSource(opts: RpcSourceOptions = {}): DataSource {
  const url = opts.rpcUrl ?? DEFAULT_TESTNET_RPC;
  const rpc = opts.rpc ?? new NearRpc(url, throttledFetch(3, 6, 8, undefined, FALLBACK_TESTNET_RPC));
  const v = <T,>(account: string, method: string, args: object = {}) => rpc.view<T>(account, method, args);
  const txLog = bundledTxLog();
  const profileFiles = new Map(bundledDeployment.assets.map((a) => [a.asset_id, a.profile_file]));

  const asset = (id: AccountId): AssetViews => ({
    get_profile: () => v(id, 'get_profile'),
    get_wiring: () => v(id, 'get_wiring'),
    get_ledger: () => v(id, 'get_ledger'),
    get_reservation: (rid) => v(id, 'get_reservation', { id: rid }),
    get_reservations: (from, limit) => v(id, 'get_reservations', { from_index: String(from), limit: lim(limit) }),
    get_reservations_by_holder: (account, from, limit) =>
      v(id, 'get_reservations_by_holder', { account, from_index: String(from), limit: lim(limit) }),
    get_availability: (from_slot, count) => v(id, 'get_availability', { from_slot, count }),
    can_access: (account, reservation_id) => v(id, 'can_access', { account, reservation_id }),
    get_telemetry: () => v(id, 'get_telemetry'),
    get_rule_status: () => v(id, 'get_rule_status'),
    get_faults: (rule_id) => v(id, 'get_faults', rule_id ? { rule_id } : {}),
    get_service_status: () => v(id, 'get_service_status'),
    get_service_log: (from, limit) => v(id, 'get_service_log', { from_index: String(from), limit: lim(limit) }),
    get_task: (tid) => v(id, 'get_task', { id: tid }),
    get_tasks: (from, limit, status) =>
      v(id, 'get_tasks', { from_index: String(from), limit: lim(limit), ...(status ? { status } : {}) }),
    get_escalations: (from, limit) => v(id, 'get_escalations', { from_index: String(from), limit: lim(limit) }),
    get_ops: (from, limit, status) =>
      v(id, 'get_ops', { from_index: String(from), limit: lim(limit), ...(status ? { status } : {}) }),
    get_reputation: (account) => v(id, 'get_reputation', { account }),
    get_reputation_log: (from, limit) => v(id, 'get_reputation_log', { from_index: String(from), limit: lim(limit) }),
    get_period: () => v(id, 'get_period'),
    get_last_session_at: (account) => v(id, 'get_last_session_at', { account }),
    get_roles: (account) => v(id, 'get_roles', { account }),
    version: () => v(id, 'version'),
  });

  const commons = (id: AccountId): CommonsViews => ({
    get_wiring: () => v(id, 'get_wiring'),
    get_assets: () => v(id, 'get_assets', { from_index: 0, limit: MAX_PAGE }),
    get_group: (group_id) => v(id, 'get_group', { group_id }),
    get_roles: (account) => v(id, 'get_roles', { account }),
    get_all_roles: (from, limit) => v(id, 'get_all_roles', { from_index: from, limit: lim(limit) }),
    get_credential_kinds: () => v(id, 'get_credential_kinds'),
    get_trainings: (from, limit) => v(id, 'get_trainings', { from_index: from, limit: lim(limit) }),
    has_credential: (account, kind) => v(id, 'has_credential', { account, kind }),
    get_cards_for_owner: (account) => v(id, 'get_cards_for_owner', { account }),
    nft_tokens: (from, limit) => v(id, 'nft_tokens', { from_index: String(from), limit: lim(limit) }),
    version: () => v(id, 'version'),
  });

  const dao = (id: AccountId): DaoViews => ({
    get_policy: () => v<Policy>(id, 'get_policy'),
    get_last_proposal_id: () => v<number>(id, 'get_last_proposal_id'),
    get_proposals: (from, limit) => v<Proposal[]>(id, 'get_proposals', { from_index: from, limit }),
    get_proposal: (pid) => v<Proposal>(id, 'get_proposal', { id: pid }).catch(() => null),
  });

  return {
    kind: 'rpc',
    now: () => Date.now(),
    asset,
    commons,
    dao,
    getDaoList: (factory) => v<AccountId[]>(factory, 'get_dao_list'),
    viewAccount: async (id): Promise<AccountState> => {
      const a = await rpc.viewAccount(id);
      return { amount: a.amount, locked: (a as { locked?: string }).locked ?? '0', code_hash: a.code_hash, storage_usage: a.storage_usage };
    },
    viewAccessKeyList: async (id) => (await rpc.viewAccessKeyList(id)).keys as AccessKeyInfo[],
    getDeployment: async () => bundledDeployment,
    getProfileCatalog: async () => loadCatalog(),
    getProfileMeta: async (id) => {
      const file = profileFiles.get(id);
      const entry = loadCatalog().find((c) => c.file === file);
      if (!entry) throw new Error(`no profile file for ${id}`);
      return entry.meta;
    },
    getEvidenceSteps: async () => bundledSteps(),
    getAgentLimits: async () => bundledAgentLimits(),
    getTxLog: async () => txLog,
    rowTx: (key) => {
      // "proposal-<dao>-<id>" → the seed transaction that acted on that proposal (latest).
      const m = /^proposal-(.+)-(\d+)$/.exec(key);
      if (m) {
        const hits = txLog.filter((t) => t.label.startsWith(`${m[1]}#${m[2]} `));
        return hits.at(-1)?.hash ?? null;
      }
      const d = /^deploy-(.+)$/.exec(key);
      if (d) return bundledDeployment.assets.find((a) => a.asset_id === d[1])?.deploy_tx ?? null;
      return null;
    },
  };
}
