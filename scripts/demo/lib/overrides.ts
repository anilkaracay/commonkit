/**
 * evidence/demo-overrides.json — every demo override of a live profile value or operator, and its
 * restore, each passed as a DAO proposal. The web and landing link these entries by `label`:
 *   "demo override <rule_id> <value> (production <value>)".
 * Upserted by (proposal), so a resumed step never duplicates an entry.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVIDENCE_DIR, explorerTx } from '../../lib/config.js';

export interface OverrideEntry {
  label: string;
  kind: 'override' | 'restore';
  step: number;
  asset: string;
  /** Rule id, or a profile/operator field (`period_reward_quota`, `agent_id`). */
  rule_id: string;
  value: string;
  production: string;
  /** `<dao>#<proposal id>` */
  proposal: string;
  tx_hashes: string[];
  explorer_links: string[];
  at: string;
}

export const OVERRIDES_FILE = join(EVIDENCE_DIR, 'demo-overrides.json');

/** Pure: the label the web and landing link. */
export const overrideLabel = (ruleId: string, value: string | number, production: string | number): string =>
  `demo override ${ruleId} ${value} (production ${production})`;
export const restoreLabel = (ruleId: string, production: string | number): string =>
  `restore ${ruleId} ${production} (production ${production})`;

export function readOverrides(path = OVERRIDES_FILE): OverrideEntry[] {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as OverrideEntry[]) : [];
}

export function recordOverride(
  e: Omit<OverrideEntry, 'label' | 'explorer_links' | 'at'> & { at?: string },
  path = OVERRIDES_FILE,
): OverrideEntry {
  const entry: OverrideEntry = {
    ...e,
    label: e.kind === 'override' ? overrideLabel(e.rule_id, e.value, e.production) : restoreLabel(e.rule_id, e.production),
    explorer_links: e.tx_hashes.map(explorerTx),
    at: e.at ?? new Date().toISOString(),
  };
  const all = readOverrides(path).filter((x) => !(x.proposal === entry.proposal && x.rule_id === entry.rule_id));
  all.push(entry);
  all.sort((a, b) => a.at.localeCompare(b.at));
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(path, `${JSON.stringify(all, null, 2)}\n`);
  return entry;
}

/** Overrides whose last entry for (asset, rule) is not a restore: what is live on chain now. */
export function activeOverrides(all: OverrideEntry[]): OverrideEntry[] {
  const last = new Map<string, OverrideEntry>();
  for (const e of all) last.set(`${e.asset}#${e.rule_id}`, e);
  return [...last.values()].filter((e) => e.kind === 'override');
}
