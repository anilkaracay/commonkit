/**
 * Reads the deployed assets' views from testnet and writes src/data/testnet-snapshot.json, the labelled
 * fallback the page shows until (or if) its live RPC read fails. Read-only: no keys, no transactions.
 * Run: pnpm --filter @commonkit/landing snapshot
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NearRpc } from '@commonkit/sdk';
import { politeFetch, readAsset, RPC_URLS, type Snapshot } from '../src/lib/chain.ts';

const here = new URL('.', import.meta.url).pathname;
const repo = resolve(here, '../..');
const dep = JSON.parse(readFileSync(resolve(repo, 'deployments/testnet.json'), 'utf8')) as {
  communities: Record<string, { dao_id: string; assets: string[] }>;
};
const rpc = new NearRpc(process.env.NEAR_RPC_URL ?? RPC_URLS[0], politeFetch(2));
const assets = [];
for (const [community, c] of Object.entries(dep.communities))
  for (const account of c.assets) {
    assets.push(await readAsset(rpc, account, community, c.dao_id));
    console.log('read', account);
  }
const snap: Snapshot = { taken_at: new Date().toISOString(), network: 'testnet', assets };
writeFileSync(resolve(here, '../src/data/testnet-snapshot.json'), JSON.stringify(snap, null, 2) + '\n');
console.log('wrote src/data/testnet-snapshot.json', snap.taken_at);
