/** In-memory DataSource over fixtures.ts. Paging/filter semantics mirror the contract views. */
import type { AssetViews, CommonsViews, DaoViews, DataSource } from '../source';
import type { AccessKeyInfo, AccountState, Deployment } from '../offchain';
import type { AccountId } from '../types';
import { loadCatalog } from '../catalog';
import {
  MOCK_NOW_MS,
  agentLimits,
  mockTxFor,
  assets,
  commons,
  daos,
  deployment,
  evidenceSteps,
  profileMeta,
  type MockAsset,
} from './fixtures';

const page = <T,>(items: T[], from: number, limit: number): T[] => items.slice(from, from + limit);
const clone = <T,>(v: T): T => structuredClone(v);

function need<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`mock: unknown ${what}`);
  return v;
}

function assetViews(a: MockAsset, nowMs: number): AssetViews {
  return {
    get_profile: async () => clone(a.profile),
    get_wiring: async () => clone(a.wiring),
    get_ledger: async () => clone(a.ledger),
    get_reservation: async (id) => clone(a.reservations.find((r) => r.id === id) ?? null),
    get_reservations: async (from, limit) => clone(page(a.reservations, from, limit)),
    get_reservations_by_holder: async (account, from, limit) =>
      clone(page(a.reservations.filter((r) => r.holder === account), from, limit)),
    get_availability: async (fromSlot, count) => {
      const start = BigInt(fromSlot);
      return Array.from({ length: count }, (_, i) => {
        const s = start + BigInt(i);
        const r = a.reservations.find(
          (x) =>
            !['Rejected', 'Cancelled', 'NoShow'].includes(x.status) &&
            s >= BigInt(x.start_slot) &&
            s < BigInt(x.start_slot) + BigInt(x.slots),
        );
        return { slot: s.toString(), reservation_id: r ? r.id : null };
      });
    },
    can_access: async (account, reservationId) => {
      const r = a.reservations.find((x) => x.id === reservationId);
      const slotNs = BigInt(a.profile.slot_minutes) * 60_000_000_000n;
      const windowStart = r ? BigInt(r.start_slot) * slotNs : 0n;
      const windowEnd = windowStart + BigInt(a.profile.start_window_minutes) * 60_000_000_000n;
      const base = { window_start: windowStart.toString(), window_end: windowEnd.toString() };
      if (!r) return { ok: false, reason: 'no valid reservation', ...base };
      if (r.holder !== account) return { ok: false, reason: 'no valid reservation', ...base };
      if (!a.service.in_service) return { ok: false, reason: 'out_of_service', ...base };
      if (r.status === 'InSession') return { ok: true, reason: 'session active', ...base };
      if (r.status !== 'Confirmed') return { ok: false, reason: `reservation is ${r.status}`, ...base };
      const now = BigInt(nowMs) * 1_000_000n;
      if (now < windowStart || now > windowEnd) return { ok: false, reason: 'outside start window', ...base };
      return { ok: true, reason: 'ok', ...base };
    },
    get_telemetry: async () => clone(a.telemetry),
    get_rule_status: async () => clone(a.rules),
    get_faults: async (ruleId) => clone(ruleId ? a.faults.filter((f) => f.rule_id === ruleId) : a.faults),
    get_service_status: async () => clone(a.service),
    get_service_log: async (from, limit) => clone(page(a.serviceLog, from, limit)),
    get_task: async (id) => clone(a.tasks.find((t) => t.id === id) ?? null),
    get_tasks: async (from, limit, status) =>
      clone(page(status ? a.tasks.filter((t) => t.status === status) : a.tasks, from, limit)),
    get_escalations: async (from, limit) => clone(page(a.escalations, from, limit)),
    get_ops: async (from, limit, status) =>
      clone(page(status ? a.ops.filter((o) => o.status === status) : a.ops, from, limit)),
    get_reputation: async (account) =>
      clone(a.reputation[account] ?? { sessions: 0, clean_returns: 0, damages: 0, upkeeps: 0, fault_reports: 0 }),
    get_reputation_log: async (from, limit) => clone(page(a.reputationLog, from, limit)),
    get_period: async () => clone(a.period),
    get_last_session_at: async (account) => {
      const mine = a.reservations.filter((r) => r.holder === account && r.session_started_at);
      return mine.at(-1)?.session_finished_at ?? mine.at(-1)?.session_started_at ?? null;
    },
    get_roles: async (account) => clone(a.roles[account] ?? []),
    version: async () => '0.1.0-mock',
  };
}

function commonsViews(id: AccountId): CommonsViews {
  const c = need(commons[id], `commons ${id}`);
  return {
    get_wiring: async () => ({
      dao_id: id.replace(/^commons\./, ''),
      name: id,
      roles_version: c.roles_version,
      next_training_id: String(c.trainings.length + 1),
      next_token_seq: String(c.cards.length + 1),
      total_supply: String(c.cards.length),
      version: 'mock',
    }),
    get_assets: async () =>
      Object.entries(c.groups).flatMap(([group_id, ids]) =>
        ids.map((asset_id) => ({ asset_id, group_id, active: true, registered_at: '1762689600000000000' })),
      ),
    get_group: async (groupId) => clone(c.groups[groupId] ?? []),
    get_roles: async (account) => clone(c.roles[account] ?? []),
    get_all_roles: async (from, limit) =>
      page(Object.entries(c.roles), from, limit).map(([account_id, roles]) => ({ account_id, roles: [...roles] })),
    get_credential_kinds: async () => clone(c.credentialKinds),
    get_trainings: async (from, limit) => clone(page(c.trainings, from, limit)),
    has_credential: async (account, kind) =>
      c.cards.some((card) => card.owner_id === account && card.kind.type === 'Credential' && card.kind.kind === kind),
    get_cards_for_owner: async (account) => clone(c.cards.filter((card) => card.owner_id === account)),
    nft_tokens: async (from, limit) =>
      page(c.cards, from, limit).map((card) => ({ token_id: card.token_id, owner_id: card.owner_id })),
    version: async () => '0.1.0-mock',
  };
}

function daoViews(id: AccountId): DaoViews {
  const d = need(daos[id], `dao ${id}`);
  return {
    get_policy: async () => clone(d.policy),
    get_last_proposal_id: async () => d.proposals.length,
    get_proposals: async (from, limit) => clone(page(d.proposals, from, limit)),
    get_proposal: async (pid) => clone(d.proposals.find((p) => p.id === pid) ?? null),
  };
}

export interface MockSourceOptions {
  /** Override pieces of the world (used by tests to break invariants on purpose). */
  deployment?: Deployment;
  accessKeys?: Record<AccountId, AccessKeyInfo[]>;
  nowMs?: number;
}

export function createMockSource(opts: MockSourceOptions = {}): DataSource {
  const dep = opts.deployment ?? deployment;
  const nowMs = opts.nowMs ?? MOCK_NOW_MS;
  const codeHashOf = (id: AccountId): string => {
    const a = dep.assets.find((x) => x.asset_id === id);
    if (a) return a.code_hash;
    const c = dep.communities.find((x) => x.commons_id === id);
    if (c) return c.commons_code_hash;
    return '11111111111111111111111111111111';
  };
  return {
    kind: 'mock',
    now: () => nowMs,
    asset: (id) => assetViews(need(assets[id], `asset ${id}`), nowMs),
    commons: commonsViews,
    dao: daoViews,
    getDaoList: async () => dep.communities.map((c) => c.dao_id),
    viewAccount: async (id): Promise<AccountState> => ({
      amount: daos[id]?.balance ?? assets[id]?.ledger.balance ?? '0',
      locked: '0',
      code_hash: codeHashOf(id),
      storage_usage: 48210,
    }),
    viewAccessKeyList: async (id) => clone(opts.accessKeys?.[id] ?? []),
    getDeployment: async () => clone(dep),
    getProfileCatalog: async () => loadCatalog(),
    getProfileMeta: async (id) => clone(need(profileMeta[id], `profile meta ${id}`)),
    getEvidenceSteps: async () => clone(evidenceSteps),
    getAgentLimits: async () => clone(agentLimits),
    getTxLog: async () => [],
    rowTx: (key) => mockTxFor(key),
  };
}
