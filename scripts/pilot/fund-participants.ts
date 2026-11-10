/**
 * Pilot funding (docs/PILOT.md §1, D-024): 2 testnet NEAR to each consenting participant listed in
 * the gitignored `pilot/participants.local.json` ([{account_id, consent: "video" | "no-video",
 * consented_at}], account ids only). Testnet only. DRY RUN by default; `--send` transfers.
 * Idempotent: an account already funded in evidence/pilot-funding.json is skipped. Evidence holds
 * account id, amount and tx hash only.
 *
 *   pnpm --filter @commonkit/scripts exec tsx pilot/fund-participants.ts           # dry run
 *   pnpm --filter @commonkit/scripts exec tsx pilot/fund-participants.ts --send    # transfers
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { nearToYocto, yoctoToNear } from '@commonkit/sdk';
import { EVIDENCE_DIR, REPO_ROOT, ROOT_ACCOUNT, assertTestnet } from '../lib/config.js';
import { Chain } from '../lib/near.js';
import { writeEvidenceMd } from '../demo/lib/evidence-md.js';

export const AMOUNT = nearToYocto('2');
export const PARTICIPANTS_FILE = join(REPO_ROOT, 'pilot', 'participants.local.json');
export const FUNDING_FILE = join(EVIDENCE_DIR, 'pilot-funding.json');

const accountId = z.string().regex(/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/).min(2).max(64);
export const participantsSchema = z.array(
  z.object({ account_id: accountId, consent: z.enum(['video', 'no-video']), consented_at: z.string().min(1) }).strict(),
);

export interface FundingEntry {
  account_id: string;
  amount_near: string;
  tx: string;
  ok: boolean;
  at: string;
}

/** Pure: who to fund — consenting, testnet accounts, deduplicated, not already funded. */
export function fundingPlan(participants: unknown, funded: FundingEntry[]): { fund: string[]; skipped: { account_id: string; why: string }[] } {
  const list = participantsSchema.parse(participants);
  const fund: string[] = [];
  const skipped: { account_id: string; why: string }[] = [];
  for (const p of list) {
    const id = p.account_id;
    if (!id.endsWith('.testnet') && !/^[0-9a-f]{64}$/.test(id)) skipped.push({ account_id: id, why: 'not a testnet account' });
    else if (funded.some((f) => f.ok && f.account_id === id)) skipped.push({ account_id: id, why: 'already funded' });
    else if (fund.includes(id)) skipped.push({ account_id: id, why: 'listed twice' });
    else fund.push(id);
  }
  return { fund, skipped };
}

const readFunded = (): FundingEntry[] => (existsSync(FUNDING_FILE) ? (JSON.parse(readFileSync(FUNDING_FILE, 'utf8')) as FundingEntry[]) : []);

async function main(): Promise<void> {
  assertTestnet();
  const send = process.argv.includes('--send');
  if (!existsSync(PARTICIPANTS_FILE)) throw new Error(`${PARTICIPANTS_FILE} not found (gitignored; one entry per consenting participant)`);
  const plan = fundingPlan(JSON.parse(readFileSync(PARTICIPANTS_FILE, 'utf8')), readFunded());
  for (const s of plan.skipped) console.log(`- ${s.account_id}: ${s.why}`);
  const total = AMOUNT * BigInt(plan.fund.length);
  console.log(`${send ? 'SENDING' : 'DRY RUN'}: ${plan.fund.length} × ${yoctoToNear(AMOUNT)} NEAR = ${yoctoToNear(total)} NEAR from ${ROOT_ACCOUNT}`);
  const chain = new Chain();
  for (const id of plan.fund) {
    const exists = /^[0-9a-f]{64}$/.test(id) || (await chain.accountExists(id));
    if (!exists) {
      console.log(`- ${id}: account does not exist on testnet; skipped`);
      continue;
    }
    if (!send) {
      console.log(`  would send ${yoctoToNear(AMOUNT)} NEAR → ${id}`);
      continue;
    }
    const tx = await chain.transfer(ROOT_ACCOUNT, id, AMOUNT);
    const all = readFunded();
    all.push({ account_id: id, amount_near: yoctoToNear(AMOUNT), tx: tx.hash, ok: tx.ok, at: new Date().toISOString() });
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(FUNDING_FILE, `${JSON.stringify(all, null, 2)}\n`);
    console.log(`  tx ${tx.hash}  ${yoctoToNear(AMOUNT)} NEAR → ${id}`);
  }
  if (send) writeEvidenceMd();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
