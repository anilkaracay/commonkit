/**
 * Funding math (pure): how much testnet NEAR the full setup needs, per account, and how many
 * faucet drops (research B7: 10 NEAR per faucet-created account) cover the gap.
 */
import { nearToYocto, yoctoToNear } from '@commonkit/sdk';
import { COMMUNITIES, MEMBERS, OPERATORS, type CommunityPlan } from './topology.js';

/** Testnet `storage_amount_per_byte` (research §1, protocol 88): 1 NEAR per 100 kB. */
export const BYTE_COST = 10n ** 19n;
export const N = nearToYocto;

export const DAO_CREATE_DEPOSIT = N('6'); // research C2: 5.40 NEAR locked, rest is treasury
export const PROPOSAL_BOND = N('1'); // research C4
export const FAUCET_DROP = N('10'); // research B7
export const FAUCET_KEEP = N('0.05'); // left on each helper so it stays a valid account
export const GAS_MARGIN = N('0.3'); // per community root / root for tx fees
export const ROOT_RESERVE = N('1');
export const COUNCIL_PROPOSER = N('2'); // bond 1 (returned) + propose/vote gas
/** A 300 Tgas vote reserves ~0.3 NEAR of prepaid gas up front, so voters need more than that. */
export const COUNCIL_VOTER = N('1');
/** State headroom on top of the WASM for an asset account (reservations, tasks, ops, logs). */
export const ASSET_STATE_HEADROOM_BYTES = 64_000n;
/** Asset accounts start with storage_reserve + 0.05 NEAR, as in the sandbox suite (D-215). */
export const ASSET_FUNDING_EXTRA = N('0.05');
export const COMMONS_STATE_HEADROOM = N('0.5');
/** verify.sh fails when storage usage exceeds 80% of `storage_reserve` (CONTRACT_SPEC §8). */
export const RESERVE_MAX_USAGE_PCT = 80n;

export const roundUpTenth = (y: bigint): bigint => {
  const tenth = N('0.1');
  return ((y + tenth - 1n) / tenth) * tenth;
};

/** Smallest storage_reserve (rounded up to 0.1 NEAR) that keeps WASM + headroom ≤ 80%. */
export function recommendedStorageReserve(wasmBytes: number): bigint {
  const need = (BigInt(wasmBytes) + ASSET_STATE_HEADROOM_BYTES) * BYTE_COST;
  return roundUpTenth((need * 100n) / RESERVE_MAX_USAGE_PCT);
}

/** An asset account is created with max(profile reserve, recommended reserve) + 0.05 NEAR. */
export function assetAccountFunding(profileReserve: bigint, wasmBytes: number): bigint {
  const rec = recommendedStorageReserve(wasmBytes);
  return (profileReserve > rec ? profileReserve : rec) + ASSET_FUNDING_EXTRA;
}

export function commonsAccountFunding(wasmBytes: number): bigint {
  return roundUpTenth(BigInt(wasmBytes) * BYTE_COST + COMMONS_STATE_HEADROOM);
}

export interface FundingInputs {
  assetWasmBytes: number;
  commonsWasmBytes: number;
  /** storage_reserve per profile file name. */
  profileReserves: Record<string, bigint>;
}

export interface FundingLine {
  account: string;
  what: string;
  amount: bigint;
  dryRun: boolean;
}

/** Pure: every NEAR the root must send (directly or via community roots), itemised. */
export function fundingPlan(
  inp: FundingInputs,
  communities: CommunityPlan[] = COMMUNITIES,
): FundingLine[] {
  const lines: FundingLine[] = [];
  for (const c of communities) {
    lines.push({
      account: `${c.daoName} DAO`,
      what: 'factory create (5.4 locked + treasury)',
      amount: DAO_CREATE_DEPOSIT,
      dryRun: true,
    });
    lines.push({
      account: `${c.daoName} DAO`,
      what: 'treasury top-up (floats, storage fund, payouts)',
      amount: c.treasuryTopUp,
      dryRun: false,
    });
    lines.push({ account: `${c.slug} root`, what: 'tx fees', amount: GAS_MARGIN, dryRun: true });
    lines.push({
      account: `commons.${c.slug}`,
      what: 'code + state storage',
      amount: commonsAccountFunding(inp.commonsWasmBytes),
      dryRun: true,
    });
    c.council.forEach((m, i) =>
      lines.push({
        account: `${m.name}.${c.slug}`,
        what: i === 0 ? 'council proposer (bond + gas)' : 'council voter gas',
        amount: i === 0 ? COUNCIL_PROPOSER : COUNCIL_VOTER,
        dryRun: true,
      }),
    );
    for (const a of c.assets) {
      const reserve = inp.profileReserves[a.profileFile];
      if (reserve === undefined) throw new Error(`no storage_reserve for ${a.profileFile}`);
      lines.push({
        account: `${a.slug}.${c.slug}`,
        what: 'storage_reserve (code + state)',
        amount: assetAccountFunding(reserve, inp.assetWasmBytes),
        dryRun: false,
      });
    }
  }
  for (const m of MEMBERS)
    lines.push({ account: m.name, what: 'demo fees + deposits', amount: m.balance, dryRun: false });
  for (const o of Object.values(OPERATORS))
    lines.push({ account: o.name, what: o.label, amount: o.balance, dryRun: true });
  lines.push({ account: 'root', what: 'reserve for tx fees', amount: ROOT_RESERVE, dryRun: true });
  return lines;
}

export const sumLines = (lines: FundingLine[], onlyDryRun = false): bigint =>
  lines.filter((l) => !onlyDryRun || l.dryRun).reduce((s, l) => s + l.amount, 0n);

/** Faucet helpers needed to cover `needed` given `available` on the root. */
export function faucetDropsNeeded(needed: bigint, available: bigint): number {
  if (available >= needed) return 0;
  const perDrop = FAUCET_DROP - FAUCET_KEEP - N('0.01');
  return Number((needed - available + perDrop - 1n) / perDrop);
}

export function formatPlan(lines: FundingLine[]): string {
  const w = Math.max(...lines.map((l) => l.account.length));
  return lines
    .map(
      (l) =>
        `${l.dryRun ? '*' : ' '} ${l.account.padEnd(w)}  ${yoctoToNear(l.amount, 2).padStart(6)} NEAR  ${l.what}`,
    )
    .join('\n');
}
