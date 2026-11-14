/** Build-time Board data. Placeholder-only: never seeds live views, actions or Proof. */
import type { AllAssets, CommunitySnapshot } from '../hooks';
import type { Deployment } from '../offchain';
import { DEFAULT_TESTNET_RPC } from '../rpc/rpcSource';

export interface WebSnapshot {
  schema: 'commonkit-board-snapshot-v1';
  read_at: string;
  rpc: string;
  deployment_updated_at: string;
  board: { assets: AllAssets; communities: CommunitySnapshot[] };
}

const files = import.meta.glob<WebSnapshot>('./web-snapshot.json', { eager: true, import: 'default' });
const raw = Object.values(files)[0] ?? null;

/** Reject snapshots from another deployment or RPC. Missing files are a supported live-only build. */
export function webSnapshot(dep: Deployment | undefined): WebSnapshot | null {
  const rpc = (import.meta.env.VITE_NEAR_RPC as string | undefined) || DEFAULT_TESTNET_RPC;
  if (!raw || !dep || raw.schema !== 'commonkit-board-snapshot-v1' || raw.rpc !== rpc || raw.deployment_updated_at !== dep.updated_at || !Number.isFinite(Date.parse(raw.read_at))) return null;
  const ids = (xs: { asset_id: string }[]) => xs.map((a) => a.asset_id).join(',');
  if (ids(raw.board.assets.map((a) => a.deployed)) !== ids(dep.assets)) return null;
  if (raw.board.communities.map((c) => c.community.commons_id).join(',') !== dep.communities.map((c) => c.commons_id).join(',')) return null;
  return raw;
}

export function snapshotTime(s: WebSnapshot): string {
  return `${s.read_at.slice(0, 10)} ${s.read_at.slice(11, 19)} UTC`;
}
