/** Live read of printer-01 through @commonkit/sdk NearRpc (view calls only, no wallet). On failure the
 * labelled snapshot stays on screen. */
import { NearRpc } from '@commonkit/sdk';
import { politeFetch, readLive, RPC_URLS } from '../../../src/lib/chain.ts';
import { asset, machineState } from './data.ts';
import { headlineRule, int, near, readTime, threshold, type Asset } from './format.ts';

export async function refresh(): Promise<void> {
  const base = asset('printer');
  const s = await readLive(new NearRpc(RPC_URLS[0]!, politeFetch(1, 2)), base.account, base.community, base.dao);
  const a: Asset = {
    ...base, inService: s.in_service, floatFree: s.ledger.float_free, floatCap: s.ledger.float_cap,
    rules: s.rules.map((r) => ({ id: r.rule_id, kind: r.kind, trigger: r.trigger as Asset['rules'][number]['trigger'], dueValue: r.due_value, due: r.due, openTask: r.open_task, rewardRights: r.reward_rights })),
  };
  const set = (k: string, v: string) => document.querySelectorAll(`[data-live="${k}"]`).forEach((el) => { el.textContent = v; });
  const r = headlineRule(a);
  set('float', `${near(a.floatFree)} / ${near(a.floatCap)} NEAR`);
  set('nozzle', `${int(r.dueValue)} / ${int(threshold(r))} s`);
  set('read', `Live from NEAR testnet, read ${readTime(new Date().toISOString())}`);
  (window as { __hero?: { setState(x: unknown): void } }).__hero?.setState(machineState('printer', a));
}
