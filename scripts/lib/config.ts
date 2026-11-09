/** Network constants and repo paths shared by every chain-ops script. Testnet only. */
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NETWORK = 'testnet' as const;

/** RESEARCH B6: FastNEAR primary, rpc.testnet.near.org fallback. */
export const RPC_URLS = [
  process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com',
  'https://rpc.testnet.near.org',
].filter((u, i, all) => all.indexOf(u) === i);

export const SPUTNIK_FACTORY = 'sputnikv2.testnet';
export const ROOT_ACCOUNT = process.env.ROOT_ACCOUNT_ID || 'commonkit-sxflo.testnet';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEPLOYMENTS_FILE = join(REPO_ROOT, 'deployments', 'testnet.json');
export const EVIDENCE_DIR = join(REPO_ROOT, 'evidence');
export const PROFILES_DIR = join(REPO_ROOT, 'profiles');
export const WASM_PATHS = {
  asset: join(REPO_ROOT, 'contracts/target/near/commonkit_asset/commonkit_asset.wasm'),
  commons: join(REPO_ROOT, 'contracts/target/near/commonkit_commons/commonkit_commons.wasm'),
} as const;

/** Legacy NEAR CLI keychain (near-cli-rs `save-to-legacy-keychain`). */
export const KEYCHAIN_DIR =
  process.env.NEAR_CREDENTIALS_DIR || join(homedir(), '.near-credentials', NETWORK);

export const TGAS = 1_000_000_000_000n;
/** We budget ≤ 300 Tgas per tx (D-106) and keep Σ proposal action gas ≤ 250 Tgas (research C11). */
export const MAX_TX_GAS = 300n * TGAS;
export const MAX_PROPOSAL_ACTION_GAS = 250n * TGAS;

export const explorerTx = (hash: string): string => `https://testnet.nearblocks.io/txns/${hash}`;

/** Refuse to run against anything but testnet, whatever the environment says. */
export function assertTestnet(): void {
  const net = process.env.NEAR_NETWORK ?? NETWORK;
  if (net !== 'testnet') throw new Error(`refusing to run: NEAR_NETWORK=${net} (testnet only)`);
  for (const url of RPC_URLS)
    if (!/test/.test(url))
      throw new Error(`refusing to run: RPC ${url} does not look like testnet`);
  if (!ROOT_ACCOUNT.endsWith('.testnet'))
    throw new Error(`refusing to run: root ${ROOT_ACCOUNT} is not a .testnet account`);
}
