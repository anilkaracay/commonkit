/**
 * Validates every profiles/*.json against profiles/profile.schema.json plus the cross-field
 * rules of the contract's validate_profile (CONTRACT_SPEC §2.1). Exit 1 on any failure.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';

export const PROTOCOL_FEE_MAX_BPS = 200;
export const EXPECTED_PROFILES = 12;

interface Rule {
  rule_id: string;
  kind?: string;
  reward_cash: string;
  reimbursable_max?: string;
}

/** Only these upkeep kinds may carry a reimbursable expense (CONTRACT_SPEC §2.1, D-017). */
export const REIMBURSABLE_KINDS = ['Restock', 'Repair'];
interface ProfileFile {
  profile: {
    deposit: string;
    deposit_trusted: string;
    auto_reward_cash_cap: string;
    council_threshold_cash: string;
    protocol_fee_bps: number;
    rules: Rule[];
  };
  meta: { purchase_hints: { rule_id: string }[] };
}

/** Cross-field checks the JSON schema cannot express. Returns a list of errors. */
export function crossFieldErrors(file: ProfileFile): string[] {
  const p = file.profile;
  const errors: string[] = [];
  if (BigInt(p.deposit_trusted) > BigInt(p.deposit)) errors.push('deposit_trusted > deposit');
  if (BigInt(p.council_threshold_cash) > BigInt(p.auto_reward_cash_cap))
    errors.push('council_threshold_cash > auto_reward_cash_cap');
  if (p.protocol_fee_bps > PROTOCOL_FEE_MAX_BPS) errors.push('protocol_fee_bps > max');
  const ids = new Set<string>();
  for (const r of p.rules) {
    if (ids.has(r.rule_id)) errors.push(`duplicate rule_id ${r.rule_id}`);
    ids.add(r.rule_id);
    if (BigInt(r.reward_cash) > BigInt(p.auto_reward_cash_cap))
      errors.push(`rule ${r.rule_id}: reward_cash > auto_reward_cash_cap`);
    if (BigInt(r.reimbursable_max ?? '0') > 0n && !REIMBURSABLE_KINDS.includes(r.kind ?? ''))
      errors.push(`rule ${r.rule_id}: reimbursable_max only allowed for Restock/Repair`);
  }
  for (const h of file.meta.purchase_hints)
    if (!ids.has(h.rule_id)) errors.push(`purchase_hint references unknown rule ${h.rule_id}`);
  return errors;
}

function main(): void {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles');
  const schema = JSON.parse(readFileSync(join(dir, 'profile.schema.json'), 'utf8'));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'profile.schema.json');
  let failed = 0;
  for (const f of files) {
    const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const errs = validate(data)
      ? crossFieldErrors(data as ProfileFile)
      : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
    if (errs.length) failed++;
    console.log(`${errs.length ? '❌' : '✅'} ${f}${errs.length ? `\n   ${errs.join('\n   ')}` : ''}`);
  }
  console.log(`${files.length - failed}/${files.length} profiles valid`);
  if (failed || files.length !== EXPECTED_PROFILES) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
