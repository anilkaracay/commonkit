/**
 * View cache with request coalescing: identical calls in flight share one request, and results
 * are reused for a short TTL (≥ 10 s for single views, ≥ 30 s for lists). Errors are not cached.
 * Keeps public testnet RPC load low no matter how many components read the same view.
 */
export const VIEW_TTL_MS = 10_000;
export const LIST_TTL_MS = 30_000;

/** Methods that return lists (or huge payloads) get the longer TTL. */
const LIST_METHODS = new Set([
  'get_reservations',
  'get_reservations_by_holder',
  'get_tasks',
  'get_ops',
  'get_escalations',
  'get_reputation_log',
  'get_service_log',
  'get_faults',
  'get_availability',
  'get_rule_status',
  'get_assets',
  'get_all_roles',
  'get_trainings',
  'get_credential_kinds',
  'get_cards_for_owner',
  'nft_tokens',
  'get_proposals',
  'view_access_key_list',
]);
/** Effectively static during a visit. */
const LONG_TTL: Record<string, number> = { get_dao_list: 10 * 60_000, get_policy: 5 * 60_000, get_profile: 60_000, version: 10 * 60_000 };

export function ttlFor(method: string): number {
  return LONG_TTL[method] ?? (LIST_METHODS.has(method) ? LIST_TTL_MS : VIEW_TTL_MS);
}

export class ViewCache {
  private generation = 0;
  private readonly done = new Map<string, { at: number; value: unknown }>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  clear(): void {
    this.generation += 1;
    this.done.clear();
    this.inflight.clear();
  }

  get<T>(key: string, method: string, load: () => Promise<T>): Promise<T> {
    const hit = this.done.get(key);
    if (hit && this.now() - hit.at < ttlFor(method)) return Promise.resolve(hit.value as T);
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;
    const generation = this.generation;
    const p = load().then(
      (value) => {
        if (generation === this.generation) {
          this.done.set(key, { at: this.now(), value });
          this.inflight.delete(key);
        }
        return value;
      },
      (err: unknown) => {
        if (generation === this.generation) this.inflight.delete(key);
        throw err;
      },
    );
    this.inflight.set(key, p);
    return p;
  }
}
