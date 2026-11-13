/** Live testnet read of printer-01 (lazy chunk): plain view calls through @commonkit/sdk NearRpc, no keys, no
 * wallet. Updates the hero callouts, the read time and the 3D state. Once on load, then at most once a minute
 * while the tab is visible, one request at a time, backing off on failure; the labelled snapshot stays otherwise.
 * Replaces the build-time snapshot values in the hero callouts ([data-live=float], [data-live=nozzle]) and the 3D state. */
import { NearRpc } from '@commonkit/sdk';
import { politeFetch, readLive, RPC_URLS } from './lib/chain.ts';
import { int, near, utcStamp } from './lib/format.ts';
import { stateOf } from './three/state.ts';
import type { MachineState } from './three/types.ts';

interface LiveConfig { account: string; community: string; dao: string }
const rpc = new NearRpc(RPC_URLS[0]!, politeFetch(1, 2));
const fixed = (y: string) => { const n = near(y); return n.includes('.') ? n.padEnd(n.indexOf('.') + 3, '0') : `${n}.00`; };

async function refresh(cfg: LiveConfig, onState: (s: MachineState) => void): Promise<void> {
  const a = await readLive(rpc, cfg.account, cfg.community, cfg.dao);
  const set = (k: string, v: string) => document.querySelectorAll(`[data-live="${k}"]`).forEach((el) => { el.textContent = v; });
  set('float', `${fixed(a.ledger.float_free)} / ${fixed(a.ledger.float_cap)} NEAR`);
  const nz = a.rules.find((r) => r.rule_id === 'nozzle_clean');
  if (nz && 'Metric' in nz.trigger) set('nozzle', `${int(nz.due_value)} / ${int((nz.trigger as { Metric: { threshold: number } }).Metric.threshold)} s`);
  set('read', `Live from NEAR testnet, read ${utcStamp(new Date().toISOString())}`);
  onState(stateOf(a));
}

export async function startLive(onState: (s: MachineState) => void): Promise<void> {
  const el = document.getElementById('ck-live');
  if (!el?.textContent) return;
  const cfg = JSON.parse(el.textContent) as LiveConfig;
  let inFlight = false;
  let delay = 60_000;
  const tick = async () => {
    if (!inFlight && document.visibilityState === 'visible') {
      inFlight = true;
      try { await refresh(cfg, onState); delay = 60_000; } catch { delay = Math.min(delay * 2, 600_000); } finally { inFlight = false; }
    }
    window.setTimeout(() => void tick(), delay + Math.random() * 10_000);
  };
  await tick();
}
