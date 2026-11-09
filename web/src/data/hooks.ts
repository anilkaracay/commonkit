/**
 * React Query hooks. Composite "snapshot" queries keep pages simple; each still only calls
 * DataSource methods, so the RPC source drops in unchanged. Asset pages poll (FRONTEND_SPEC §3).
 */
import { useQuery } from '@tanstack/react-query';
import { useDataSource, type DataSource } from './source';
import type { AccountId } from './types';
import type { DeployedAsset, DeployedCommunity } from './offchain';

const POLL_MS = 8_000;
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
    refetchInterval: ds.kind === 'rpc' ? POLL_MS : false,
  });
}

/** Every deployed asset with its snapshot (board, agent feed, proof). */
export function useAllAssets() {
  const ds = useDataSource();
  const dep = useDeployment();
  return useQuery({
    queryKey: ['assets', ds.kind, dep.data?.assets.map((a) => a.asset_id).join(',')],
    enabled: !!dep.data,
    queryFn: async () => {
      const list = (dep.data as NonNullable<typeof dep.data>).assets;
      const snaps = await Promise.all(list.map((d) => loadAssetSnapshot(ds, d.asset_id)));
      return snaps.map((snap, i) => ({ deployed: list[i] as DeployedAsset, snap }));
    },
    refetchInterval: ds.kind === 'rpc' ? POLL_MS : false,
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

export function useCommunities() {
  const ds = useDataSource();
  const dep = useDeployment();
  return useQuery({
    queryKey: ['communities', ds.kind],
    enabled: !!dep.data,
    queryFn: () => Promise.all((dep.data as NonNullable<typeof dep.data>).communities.map((c) => loadCommunity(ds, c))),
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
