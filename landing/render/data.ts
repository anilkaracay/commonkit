/**
 * Build-time data for the landing page. Everything shown as a fact comes from a file in this repo
 * (deployments, evidence, profiles, README, contract sources) or from the testnet snapshot; the build
 * fails loudly when a source it relies on is inconsistent, rather than printing something unverified.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Snapshot } from '../src/lib/chain';
import type { Trigger } from '../src/lib/format';

export const REPO = resolve(import.meta.dirname, '../..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const json = <T>(p: string): T => JSON.parse(read(p)) as T;

// ---------- deployments ----------

export interface Deployments {
  root: string;
  factory: string;
  code: { asset: { bytes: number; code_hash: string; build: string }; commons: { code_hash: string } };
  communities: Record<string, { name: string; dao_id: string; commons_id: string; assets: string[]; dao_council: string[] }>;
  function_call_keys: { account: string; receiver_id: string; method_names: string[]; tx: string }[];
}

// ---------- profiles ----------

export interface ProfileRule {
  rule_id: string;
  kind: string;
  trigger: Trigger;
  title: string;
  reward_rights: number;
  reward_cash: string;
  reimbursable_max: string;
}

export interface Profile {
  file: string;
  asset_type: string;
  display_name: string;
  icon: string;
  story: string;
  required_credential: string | null;
  price_per_slot: string;
  deposit: string;
  float_cap: string;
  right_max_slots: number;
  right_validity_days: number;
  rules: ProfileRule[];
  /** Status text exactly as the README scenario table prints it. */
  status: string;
}

/** README scenario table: status per asset_type. Testnet aliases (printer-01 …) map through the snapshot. */
function readmeStatuses(aliasToType: Record<string, string>, types: string[]): Record<string, string> {
  const readme = read('README.md');
  const start = readme.indexOf('## Scenarios');
  const end = readme.indexOf('\n## ', start + 5);
  if (start < 0) throw new Error('README has no "## Scenarios" section');
  const rows = readme
    .slice(start, end < 0 ? undefined : end)
    .split('\n')
    .filter((l) => l.startsWith('|') && !l.startsWith('| :') && !l.startsWith('| Upkeep kind'));
  const found: Record<string, Set<string>> = {};
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim());
    const subject = cells[2] ?? '';
    const status = cells[4] ?? '';
    const add = (t: string) => (found[t] ??= new Set()).add(status);
    for (const [alias, t] of Object.entries(aliasToType)) if (new RegExp(`\\b${alias}\\b`).test(subject)) add(t);
    for (const t of types) if (new RegExp(`(^|[\\s(·])${t}\\b`).test(subject)) add(t);
  }
  const out: Record<string, string> = {};
  for (const t of types) {
    const s = [...(found[t] ?? [])];
    if (s.length !== 1) throw new Error(`README scenario table: ${t} has ${s.length} statuses (${s.join(' / ')})`);
    out[t] = s[0]!;
  }
  return out;
}

// ---------- evidence ----------

export interface TickerItem {
  at: string;
  kind: string;
  text: string;
  account: string;
  hash: string;
  url: string;
}

interface EvidenceTx {
  at: string;
  label: string;
  hash: string;
  receiver?: string;
  ok: boolean;
  explorer?: string;
  events?: string[];
}

const EVENT_TEXT: Record<string, [string, string]> = {
  reservation_confirmed: ['reserved', 'Reservation confirmed'],
  session_started: ['unlocked', 'Unlocked for a valid reservation'],
  task_opened: ['upkeep', 'Upkeep task opened'],
  task_approved: ['approved', 'Upkeep approved by an independent member'],
  rights_minted: ['rights', 'Usage rights minted'],
  nft_mint: ['rights', 'Non-transferable card minted'],
  swept: ['swept', 'Float over the cap swept to the DAO'],
  float_funded: ['funded', 'Float funded by DAO vote'],
  asset_registered: ['registered', 'Asset registered in its commons'],
  credential_kind_set: ['credential', 'Credential kind created by DAO vote'],
  roles_set: ['roles', 'Roles set by DAO vote'],
  operators_updated: ['operators', 'Bridge and agent wired by DAO vote'],
  dao_policy_refreshed: ['dao', 'DAO policy cached by the asset'],
};
const EVENT_PRIORITY = Object.keys(EVENT_TEXT);

function tickerItem(e: EvidenceTx): TickerItem | null {
  if (!e.ok || !e.hash || /faucet helper|top up|top-up/i.test(e.label)) return null;
  const evs = (e.events ?? []).map((x) => x.replace(/^[a-z0-9]+:/, ''));
  const main = EVENT_PRIORITY.find((k) => evs.includes(k));
  const url = e.explorer ?? `https://testnet.nearblocks.io/txns/${e.hash}`;
  const accountIn = (s: string) => /([a-z0-9-]+\.)+testnet/.exec(s)?.[0];
  if (main) {
    const [kind, text] = EVENT_TEXT[main]!;
    const subject = /\b((?:printer|laser|washer|fridge)-\d+)\b/.exec(e.label)?.[1];
    return { at: e.at, kind, text, account: subject ?? accountIn(e.label) ?? e.receiver ?? '', hash: e.hash, url };
  }
  let m: RegExpExecArray | null;
  if ((m = /^create \+ deploy \+ init (\S+)/.exec(e.label)))
    return { at: e.at, kind: 'deployed', text: 'Contract account deployed', account: m[1]!, hash: e.hash, url };
  if ((m = /^delete key \S+ on (\S+)/.exec(e.label)))
    return { at: e.at, kind: 'keyless', text: 'Last full-access key deleted', account: m[1]!, hash: e.hash, url };
  if ((m = /^(bridge|agent) function-call key → (\S+)/.exec(e.label)))
    return { at: e.at, kind: 'key', text: `${m[1] === 'bridge' ? 'Bridge' : 'Agent'} function-call key added`, account: m[2]!, hash: e.hash, url };
  if ((m = /^create DAO (\S+)/.exec(e.label)))
    return { at: e.at, kind: 'dao', text: 'Sputnik DAO created', account: m[1]!, hash: e.hash, url };
  return null;
}

function readTicker(): { items: TickerItem[]; total: number } {
  const dir = resolve(REPO, 'evidence');
  const all: EvidenceTx[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const d = json<unknown>(`evidence/${f}`);
    const arr = Array.isArray(d) ? d : Array.isArray((d as { txs?: unknown }).txs) ? (d as { txs: unknown[] }).txs : [];
    for (const x of arr) if (x && typeof x === 'object' && 'hash' in x && 'at' in x) all.push(x as EvidenceTx);
  }
  const seen = new Set<string>();
  const unique = all.filter((e) => e.ok && !seen.has(e.hash) && seen.add(e.hash));
  const items = unique
    .map(tickerItem)
    .filter((x): x is TickerItem => x !== null)
    .sort((a, b) => b.at.localeCompare(a.at));
  return { items: items.slice(0, 28), total: unique.length };
}

// ---------- contract excerpts ----------

export interface Excerpt {
  path: string;
  lines: { n: number; text: string }[];
}

/** Lines [from anchor, from anchor + count) of a source file; fails the build if the anchor moved away. */
function excerpt(path: string, anchor: string, count: number, skipBlank = false): Excerpt {
  const src = read(path).split('\n');
  const i = src.findIndex((l) => l.includes(anchor));
  if (i < 0) throw new Error(`excerpt anchor not found in ${path}: ${anchor}`);
  const lines = src.slice(i, i + count).map((text, k) => ({ n: i + k + 1, text }));
  return { path, lines: skipBlank ? lines.filter((l) => l.text.trim()) : lines };
}

// ---------- agent limits / pilot ----------

export interface LimitsReport {
  generated_at: string;
  chain: string;
  simulated: boolean;
  agent_account: string;
  all_passed: boolean;
  attempts: { id: string; spec: string; asset_id: string; method: string; status: string; code: string | null; tx_hash: string | null; pass: boolean }[];
}

// ---------- everything ----------

export interface LandingData {
  built_at: string;
  dep: Deployments;
  snapshot: Snapshot;
  profiles: Profile[];
  ticker: TickerItem[];
  evidence_txs: number;
  excerpts: { transfer: Excerpt; revoke: Excerpt; constant: Excerpt };
  limits: LimitsReport | null;
  pilot: unknown | null;
}

export function loadData(): LandingData {
  const dep = json<Deployments>('deployments/testnet.json');
  const snapshot = JSON.parse(readFileSync(resolve(import.meta.dirname, '../src/data/testnet-snapshot.json'), 'utf8')) as Snapshot;

  const aliasToType = Object.fromEntries(snapshot.assets.map((a) => [a.account.split('.')[0]!, a.asset_type]));
  const files = readdirSync(resolve(REPO, 'profiles')).filter((f) => f.endsWith('.json') && f !== 'profile.schema.json');
  const raw = files.map((f) => ({ f, d: json<{ profile: Omit<Profile, 'file' | 'status' | 'icon' | 'story'>; meta: { icon: string; scenario_story_en: string } }>(`profiles/${f}`) }));
  const statuses = readmeStatuses(aliasToType, raw.map((r) => r.d.profile.asset_type));
  const profiles: Profile[] = raw.map(({ f, d }) => ({
    file: `profiles/${f}`,
    asset_type: d.profile.asset_type,
    display_name: d.profile.display_name,
    icon: d.meta.icon,
    story: d.meta.scenario_story_en,
    required_credential: d.profile.required_credential,
    price_per_slot: d.profile.price_per_slot,
    deposit: d.profile.deposit,
    float_cap: d.profile.float_cap,
    right_max_slots: d.profile.right_max_slots,
    right_validity_days: d.profile.right_validity_days,
    rules: d.profile.rules,
    status: statuses[d.profile.asset_type]!,
  }));

  const ticker = readTicker();
  const limitsPath = resolve(REPO, 'evidence/agent-limits.json');
  const pilotPath = resolve(REPO, 'evidence/pilot.json');

  return {
    built_at: new Date().toISOString(),
    dep,
    snapshot,
    profiles,
    ticker: ticker.items,
    evidence_txs: ticker.total,
    excerpts: {
      constant: excerpt('contracts/commons/src/nft.rs', 'const NON_TRANSFERABLE', 1),
      transfer: excerpt('contracts/commons/src/nft.rs', '#[payable]', 4),
      revoke: excerpt('contracts/commons/src/credentials.rs', 'E_NO_REVOCATION', 1),
    },
    limits: existsSync(limitsPath) ? json<LimitsReport>('evidence/agent-limits.json') : null,
    pilot: existsSync(pilotPath) ? json<unknown>('evidence/pilot.json') : null,
  };
}
