/** Live testnet reads (lazy chunk). Replaces the build-time snapshot in the hero cards and the proof checks.
 * Read-only: plain view calls through @commonkit/sdk NearRpc, no keys, no wallet. On any failure the
 * labelled snapshot simply stays on screen. */
import { NearRpc } from '@commonkit/sdk';
import { machineCard, taskCard, type CardCtx } from './lib/cards.ts';
import { politeFetch, readLive, RPC_URLS } from './lib/chain.ts';

interface LiveConfig {
  account: string;
  community: string;
  dao: string;
  titles: Record<string, string>;
  rightValidityDays: number;
}

const rpc = new NearRpc(RPC_URLS[0], politeFetch(1, 2));

async function refreshHero(cfg: LiveConfig): Promise<void> {
  const a = await readLive(rpc, cfg.account, cfg.community, cfg.dao);
  const now = Date.now();
  for (const slot of document.querySelectorAll<HTMLElement>('[data-live-slot="hero"]')) {
    const icon = slot.querySelector('.mcard-icon')?.innerHTML ?? '';
    const ctx: CardCtx = { titles: cfg.titles, rightValidityDays: cfg.rightValidityDays, icon, live: true, at: new Date(now).toISOString(), now };
    const m = slot.querySelector<HTMLElement>('[data-slot="machine"]');
    const t = slot.querySelector<HTMLElement>('[data-slot="task"]');
    if (m) m.innerHTML = machineCard(a, ctx, m.querySelector('.mcard-paper') ? 'paper' : 'ink');
    if (t) t.innerHTML = taskCard(a, ctx);
  }
}

/** Live reads are skipped under automation (screenshots, video capture, tests) and with `?live=0`. */
export function liveAllowed(): boolean {
  if (navigator.webdriver) return false;
  return new URLSearchParams(location.search).get('live') !== '0';
}

export async function startLive(): Promise<void> {
  const el = document.getElementById('ck-live');
  if (!el?.textContent || !liveAllowed()) return;
  const cfg = JSON.parse(el.textContent) as LiveConfig;
  // One read in flight at a time; after a failure (e.g. HTTP 429) wait longer, with jitter, up to 10 min.
  let inFlight = false;
  let delay = 60_000;
  const tick = async () => {
    if (!inFlight && document.visibilityState === 'visible') {
      inFlight = true;
      try {
        await refreshHero(cfg);
        delay = 60_000;
      } catch {
        delay = Math.min(delay * 2, 600_000);
      } finally {
        inFlight = false;
      }
    }
    window.setTimeout(() => void tick(), delay + Math.random() * 10_000);
  };
  await tick();
}
