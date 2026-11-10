/** Shapes of the testnet views the landing page reads (subset of CONTRACT_SPEC §3.6) and the reader itself. */
import type { Trigger } from './format.ts';

export interface RuleStatus {
  rule_id: string;
  kind: string;
  trigger: Trigger;
  current: string;
  baseline: string;
  due_value: string;
  due: boolean;
  next_due_estimate: string | null;
  open_task: string | null;
  reward_rights: number;
  reward_cash: string;
  reimbursable_max: string;
}

export interface TaskLite {
  id: string;
  rule_id: string;
  kind: string;
  status: string;
  rationale: string;
  opened_by: string;
  claimer: string | null;
  verifier: string | null;
  reward_rights: number;
  created_at: string;
}

export interface LedgerLite {
  float_free: string;
  float_cap: string;
  deposits_held: string;
  rewards_reserved: string;
  total_fees_in: string;
  total_swept: string;
  total_rewards_paid: string;
  invariant_ok: boolean;
}

export interface AssetSnap {
  account: string;
  community: string;
  dao: string;
  asset_type: string;
  display_name: string;
  in_service: boolean;
  ledger: LedgerLite;
  rules: RuleStatus[];
  tasks: TaskLite[];
  code_hash: string;
  full_access_keys: number;
}

export interface Snapshot {
  taken_at: string;
  network: 'testnet';
  assets: AssetSnap[];
}

export interface RpcLike {
  view<T>(accountId: string, method: string, args?: object): Promise<T>;
  viewAccount(accountId: string): Promise<{ code_hash: string }>;
  viewAccessKeyList(accountId: string): Promise<{ keys: { access_key: unknown }[] }>;
}

const pick = <T extends object, K extends keyof T>(o: T, keys: K[]): Pick<T, K> =>
  Object.fromEntries(keys.map((k) => [k, o[k]])) as Pick<T, K>;

/** Reads one asset account with plain view calls (no keys, no wallet). */
export async function readAsset(rpc: RpcLike, account: string, community: string, dao: string): Promise<AssetSnap> {
  const [profile, ledger, service, rules, tasks, acct, keys] = await Promise.all([
    rpc.view<{ asset_type: string; display_name: string }>(account, 'get_profile'),
    rpc.view<LedgerLite>(account, 'get_ledger'),
    rpc.view<{ in_service: boolean }>(account, 'get_service_status'),
    rpc.view<RuleStatus[]>(account, 'get_rule_status'),
    rpc.view<TaskLite[]>(account, 'get_tasks', { from_index: '0', limit: 50 }),
    rpc.viewAccount(account),
    rpc.viewAccessKeyList(account),
  ]);
  return {
    account,
    community,
    dao,
    asset_type: profile.asset_type,
    display_name: profile.display_name,
    in_service: service.in_service,
    ledger: pick(ledger, [
      'float_free',
      'float_cap',
      'deposits_held',
      'rewards_reserved',
      'total_fees_in',
      'total_swept',
      'total_rewards_paid',
      'invariant_ok',
    ]),
    rules,
    tasks: tasks.map((t) =>
      pick(t, ['id', 'rule_id', 'kind', 'status', 'rationale', 'opened_by', 'claimer', 'verifier', 'reward_rights', 'created_at']),
    ),
    code_hash: acct.code_hash,
    full_access_keys: keys.keys.filter((k) => k.access_key && (k.access_key as { permission?: unknown }).permission === 'FullAccess').length,
  };
}

/** The five views the hero card needs (fewer calls than readAsset; the page must stay under public RPC limits). */
export async function readLive(rpc: RpcLike, account: string, community: string, dao: string): Promise<AssetSnap> {
  const ledger = await rpc.view<LedgerLite>(account, 'get_ledger');
  const service = await rpc.view<{ in_service: boolean }>(account, 'get_service_status');
  const rules = await rpc.view<RuleStatus[]>(account, 'get_rule_status');
  const tasks = await rpc.view<TaskLite[]>(account, 'get_tasks', { from_index: '0', limit: 50 });
  const profile = await rpc.view<{ asset_type: string; display_name: string }>(account, 'get_profile');
  const keys = await rpc.viewAccessKeyList(account);
  return {
    account,
    community,
    dao,
    asset_type: profile.asset_type,
    display_name: profile.display_name,
    in_service: service.in_service,
    ledger,
    rules,
    tasks: tasks.map((t) => ({ id: t.id, rule_id: t.rule_id, kind: t.kind, status: t.status, rationale: t.rationale, opened_by: t.opened_by, claimer: t.claimer, verifier: t.verifier, reward_rights: t.reward_rights, created_at: t.created_at })),
    code_hash: '',
    full_access_keys: keys.keys.filter((k) => (k.access_key as { permission?: unknown }).permission === 'FullAccess').length,
  };
}

/** The open (or most recent) upkeep task and the people a rewarded task names. */
export function openTask(a: AssetSnap): TaskLite | null {
  return a.tasks.find((t) => ['Open', 'Claimed', 'Submitted'].includes(t.status)) ?? null;
}

export function keepers(a: AssetSnap): string[] {
  const out: string[] = [];
  for (const t of a.tasks)
    if ((t.status === 'Rewarded' || t.status === 'Approved') && t.claimer && !out.includes(t.claimer)) out.push(t.claimer);
  return out;
}

/** The rule closest to its trigger (Metric rules by fraction of threshold). */
export function mostDue(a: AssetSnap): { rule: RuleStatus; frac: number } | null {
  let best: { rule: RuleStatus; frac: number } | null = null;
  for (const r of a.rules) {
    let frac = 0;
    if ('Metric' in r.trigger) frac = (Number(r.current) - Number(r.baseline)) / r.trigger.Metric.threshold;
    else if ('Schedule' in r.trigger) frac = Number(r.current) / r.trigger.Schedule.every_hours;
    else frac = Number(r.current) / r.trigger.Report.min_reports;
    frac = Math.max(0, Math.min(1, frac || 0));
    if (r.due) frac = 1;
    if (!best || frac > best.frac || (frac === best.frac && 'Metric' in r.trigger && !('Metric' in best.rule.trigger)))
      best = { rule: r, frac };
  }
  return best;
}

/** FastNEAR first, the deprecated public endpoint as fallback (docs/RESEARCH_RESULTS.md B6). */
export const RPC_URLS = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch for NearRpc: at most `concurrency` requests in flight, retry on HTTP 429/5xx with exponential backoff
 * and jitter; then give up (callers keep their snapshot). One endpoint only: hammering a second one helps nobody.
 */
export function politeFetch(concurrency = 2, retries = 3): (input: string, init?: RequestInit) => Promise<Response> {
  let active = 0;
  const waiting: (() => void)[] = [];
  const acquire = async () => {
    if (active >= concurrency) await new Promise<void>((r) => waiting.push(r));
    active++;
  };
  const release = () => {
    active--;
    waiting.shift()?.();
  };
  return async (input, init) => {
    await acquire();
    try {
      let last: Response | Error = new Error('no RPC endpoint');
      for (const url of [input]) {
        for (let i = 0; i <= retries; i++) {
          try {
            const res = await fetch(url, init);
            if (res.status !== 429 && res.status < 500) return res;
            last = res;
          } catch (e) {
            last = e as Error;
          }
          await sleep(500 * 2 ** i + Math.random() * 400);
        }
      }
      if (last instanceof Response) return last;
      throw last;
    } finally {
      release();
    }
  };
}
