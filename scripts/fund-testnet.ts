/**
 * fund-testnet — top up the root from the testnet faucet (research B7: 10 NEAR per new account).
 * Creates throwaway helper accounts `ck-fund-<tag>-<n>.testnet` with near-cli-rs
 * (`sponsor-by-faucet-service`, key saved to the legacy keychain), then transfers each helper's
 * balance minus a small keep to the root. Helpers keep their key and stay listed as `funding-helper`.
 *
 *   tsx fund-testnet.ts --target 40     raise the root balance to ≥ 40 NEAR
 *   tsx fund-testnet.ts --sweep         only sweep helpers already in the keychain
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { nearToYocto, yoctoToNear } from '@commonkit/sdk';
import { KEYCHAIN_DIR, ROOT_ACCOUNT } from './lib/config.js';
import { updateDeployments } from './lib/deployments.js';
import { EvidenceLog } from './lib/evidence.js';
import { FAUCET_KEEP } from './lib/funding.js';
import { Chain } from './lib/near.js';

const HELPER_RE = /^(ck-fund-[a-z0-9]+-\d+\.testnet)\.json$/;
const MIN_SWEEP = nearToYocto('0.5');

const chain = new Chain();
const log = new EvidenceLog('funding');

function helpersInKeychain(): string[] {
  return readdirSync(KEYCHAIN_DIR)
    .map((f) => HELPER_RE.exec(f)?.[1])
    .filter((x): x is string => !!x);
}

/** A faucet-created account can take a few blocks to show up at `final`. */
async function waitExists(id: string, tries = 10): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await chain.accountExists(id)) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function sweep(helper: string, tries = 1): Promise<bigint> {
  if (!(await waitExists(helper, tries))) return 0n;
  const bal = await chain.balance(helper);
  const amount = bal - FAUCET_KEEP;
  updateDeployments({
    accounts: {
      [helper]: {
        role: 'funding-helper',
        kind: 'team',
        keyless: false,
        label: 'faucet helper (throwaway)',
      },
    },
  });
  if (amount < MIN_SWEEP) return 0n;
  const tx = await chain.transfer(helper, ROOT_ACCOUNT, amount);
  log.add(`faucet helper ${helper} → root ${yoctoToNear(amount, 2)} NEAR`, tx);
  return amount;
}

function createHelper(id: string): void {
  // near-cli-rs prints the account's key file path but never the secret; we discard its output.
  execFileSync(
    'near',
    [
      'account',
      'create-account',
      'sponsor-by-faucet-service',
      id,
      'autogenerate-new-keypair',
      'save-to-legacy-keychain',
      'network-config',
      'testnet',
      'create',
    ],
    { stdio: 'ignore', timeout: 120_000 },
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const targetIdx = args.indexOf('--target');
  const target = targetIdx >= 0 ? nearToYocto(args[targetIdx + 1] ?? '0') : 0n;
  for (const h of helpersInKeychain()) await sweep(h);
  let have = await chain.balance(ROOT_ACCOUNT);
  console.log(
    `root ${ROOT_ACCOUNT}: ${yoctoToNear(have, 2)} NEAR${target ? `, target ${yoctoToNear(target, 2)}` : ''}`,
  );
  if (args.includes('--sweep')) return;
  const tag = randomBytes(4).toString('hex').slice(0, 6);
  for (let n = 1; have < target; n++) {
    const id = `ck-fund-${tag}-${n}.testnet`;
    try {
      createHelper(id);
    } catch {
      console.error(`faucet refused ${id}; root still needs ${yoctoToNear(target - have, 2)} NEAR`);
      process.exit(2);
    }
    await sweep(id, 10);
    have = await chain.balance(ROOT_ACCOUNT);
    console.log(`  root now ${yoctoToNear(have, 2)} NEAR`);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
