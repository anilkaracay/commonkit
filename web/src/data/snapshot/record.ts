import { loadAllAssets, loadCommunities } from '../hooks';
import { createRpcSource, DEFAULT_TESTNET_RPC } from '../rpc/rpcSource';
import type { WebSnapshot } from './snapshot';

export async function recordSnapshot(rpc = DEFAULT_TESTNET_RPC): Promise<WebSnapshot> {
  const ds = createRpcSource({ rpcUrl: rpc });
  const dep = await ds.getDeployment();
  const [assets, communities] = await Promise.all([loadAllAssets(ds, dep), loadCommunities(ds, dep)]);
  return { schema: 'commonkit-board-snapshot-v1', read_at: new Date().toISOString(), rpc, deployment_updated_at: dep.updated_at, board: { assets, communities } };
}
