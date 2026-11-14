/**
 * React Query hooks. Composite "snapshot" queries keep pages simple; each still only calls
 * DataSource methods. No hook polls on its own: one page-level cycle refreshes the active
 * queries (data/poll.ts), and the RPC source's view cache absorbs repeats.
 */
import { useQuery } from '@tanstack/react-query';
import { useDataSource, type DataSource } from './source';
import type { AccountId, RuleStatus } from './types';
import { describeTrigger } from '../lib/metrics';
import type { DeployedAsset, DeployedCommunity, Deployment } from './offchain';

const PAGE = 100;

export function useDeployment() {
  const ds = useDataSource();
  return useQuery({ queryKey: ['deployment', ds.kind], queryFn: () => ds.getDeployment(), staleTime: Infinity });
}

export async function loadAssetSnapshot(ds: DataSource, assetId: AccountId) {
  const a = ds.asset(assetId);
  const [profile, wiring, ledger, rules, telemetry, tasks, reservations, escalations, ops, reputationLog, period, meta, account, service, faults, serviceLog] =
    await Promise.all([
      a.get_profile(),
      a.get_wiring(),
      a.get_ledger(),
      a.get_rule_status(),
      a.get_telemetry(),
      a.get_tasks(0, PAGE),
      a.get_reservations(0, PAGE),
      a.get_escalations(0, PAGE),
      a.get_ops(0, PAGE),
      a.get_reputation_log(0, PAGE),
      a.get_period(),
      ds.getProfileMeta(assetId),
      ds.viewAccount(assetId),
      a.get_service_status(),
      a.get_faults(),
      a.get_service_log(0, PAGE),
    ]);
  return { assetId, profile, wiring, ledger, rules, telemetry, tasks, reservations, escalations, ops, reputationLog, period, meta, account, service, faults, serviceLog };
}
export type AssetSnapshot = Awaited<ReturnType<typeof loadAssetSnapshot>>;

export function useAssetSnapshot(assetId: AccountId | undefined) {
  const ds = useDataSource();
  return useQuery({
    queryKey: ['asset', ds.kind, assetId],
    queryFn: () => loadAssetSnapshot(ds, assetId as AccountId),
    enabled: !!assetId,
  });
}

/** The lighter snapshot the board, approvals and agent feed need (8 views instead of 16). */
export async function loadBoardSnapshot(ds: DataSource, assetId: AccountId) {
  const a = ds.asset(assetId);
  const [profile, wiring, ledger, rules, tasks, reservations, escalations, service, meta, account] = await Promise.all([
    a.get_profile(),
    a.get_wiring(),
    a.get_ledger(),
    a.get_rule_status(),
    a.get_tasks(0, PAGE),
    a.get_reservations(0, PAGE),
    a.get_escalations(0, PAGE),
    a.get_service_status(),
    ds.getProfileMeta(assetId),
    ds.viewAccount(assetId),
  ]);
  return { assetId, profile, wiring, ledger, rules, tasks, reservations, escalations, service, meta, account };
}
export type BoardSnapshot = Awaited<ReturnType<typeof loadBoardSnapshot>>;

/** Every deployed asset with its board snapshot, in deployment order. */
export async function loadAllAssets(ds: DataSource, dep: Deployment) {
  const snaps = await Promise.all(dep.assets.map((d) => loadBoardSnapshot(ds, d.asset_id)));
  return snaps.map((snap, i) => ({ deployed: dep.assets[i] as DeployedAsset, snap }));
}
export type AllAssets = Awaited<ReturnType<typeof loadAllAssets>>;

/**
 * Every deployed asset with its board snapshot (board, approvals, agent feed). `placeholder` is
 * shown (with `isPlaceholderData`) until the live read lands; it never enters the cache.
 */
export function useAllAssets(placeholder?: AllAssets) {
  const ds = useDataSource();
  const dep = useDeployment();
  return useQuery({
    queryKey: ['assets', ds.kind, dep.data?.assets.map((a) => a.asset_id).join(',')],
    enabled: !!dep.data,
    queryFn: () => loadAllAssets(ds, dep.data as Deployment),
    placeholderData: placeholder,
  });
}

export async function loadCommunity(ds: DataSource, c: DeployedCommunity) {
  const cv = ds.commons(c.commons_id);
  const dv = ds.dao(c.dao_id);
  const [assets, roles, credentialKinds, trainings, policy, proposals, treasury] = await Promise.all([
    cv.get_assets(),
    cv.get_all_roles(0, PAGE),
    cv.get_credential_kinds(),
    cv.get_trainings(0, PAGE),
    dv.get_policy(),
    dv.get_last_proposal_id().then((last) => dv.get_proposals(Math.max(0, last - 20), 20)),
    ds.viewAccount(c.dao_id),
  ]);
  return { community: c, assets, roles, credentialKinds, trainings, policy, proposals, treasury };
}
export type CommunitySnapshot = Awaited<ReturnType<typeof loadCommunity>>;

export function loadCommunities(ds: DataSource, dep: Deployment) {
  return Promise.all(dep.communities.map((c) => loadCommunity(ds, c)));
}

/** `placeholder`: see useAllAssets. */
export function useCommunities(placeholder?: CommunitySnapshot[]) {
  const ds = useDataSource();
  const dep = useDeployment();
  return useQuery({
    queryKey: ['communities', ds.kind],
    enabled: !!dep.data,
    queryFn: () => loadCommunities(ds, dep.data as Deployment),
    placeholderData: placeholder,
  });
}

/** All cards for one account across every community's commons. */
export function useCardsFor(account: AccountId | null) {
  const ds = useDataSource();
  const dep = useDeployment();
  return useQuery({
    queryKey: ['cards', ds.kind, account],
    enabled: !!dep.data && !!account,
    queryFn: async () => {
      const comms = (dep.data as NonNullable<typeof dep.data>).communities;
      const lists = await Promise.all(comms.map((c) => ds.commons(c.commons_id).get_cards_for_owner(account as string)));
      return lists.flatMap((cards, i) => cards.map((card) => ({ card, community: comms[i] as DeployedCommunity })));
    },
  });
}

export function useCatalog() {
  const ds = useDataSource();
  return useQuery({ queryKey: ['catalog', ds.kind], queryFn: () => ds.getProfileCatalog(), staleTime: Infinity });
}

export function useEvidence() {
  const ds = useDataSource();
  return useQuery({ queryKey: ['evidence', ds.kind], queryFn: () => ds.getEvidenceSteps() });
}

export function useAgentLimits() {
  const ds = useDataSource();
  return useQuery({ queryKey: ['agent-limits', ds.kind], queryFn: () => ds.getAgentLimits() });
}

export interface DemoThreshold {
  /** The production trigger from profiles/<file>.json, in words. */
  production: string;
  /** DAO proposal tx that set the lowered value, when evidence has it. */
  tx: string | null;
}

/**
 * Rules whose live trigger differs from the production profile file: those were lowered for the
 * demo by a DAO `set_profile` proposal (profile `meta.pilot_overrides`) and must be labelled.
 */
export function useDemoThresholds(assetId: AccountId, rules: RuleStatus[]): Map<string, DemoThreshold> {
  const ds = useDataSource();
  const dep = useDeployment();
  const catalog = useCatalog();
  const deployed = dep.data?.assets.find((a) => a.asset_id === assetId);
  const entry = catalog.data?.find((c) => c.file === deployed?.profile_file);
  const out = new Map<string, DemoThreshold>();
  if (!deployed || !entry) return out;
  for (const r of rules) {
    const prod = entry.profile.rules.find((x) => x.rule_id === r.rule_id);
    if (!prod || JSON.stringify(prod.trigger) === JSON.stringify(r.trigger)) continue;
    out.set(r.rule_id, { production: describeTrigger(prod.trigger), tx: ds.rowTx(`override-${deployed.alias}-${r.rule_id}`) });
  }
  return out;
}
