/** Live testnet reads (lazy chunk). Replaces the build-time snapshot in the hero cards and the proof checks.
 * Read-only: plain view calls through @commonkit/sdk NearRpc, no keys, no wallet. On any failure the
 * labelled snapshot simply stays on screen. */
import { NearRpc } from '@commonkit/sdk';
import { machineCard, taskCard, type CardCtx } from './lib/cards.ts';
import { politeFetch, readAsset, RPC_URLS } from './lib/chain.ts';
import { shortHash } from './lib/format.ts';

interface LiveConfig {
  account: string;
  community: string;
  dao: string;
  titles: Record<string, string>;
  rightValidityDays: number;
  assets: string[];
}

const rpc = new NearRpc(RPC_URLS[0], politeFetch(2));

async function refreshHero(cfg: LiveConfig): Promise<void> {
  const a = await readAsset(rpc, cfg.account, cfg.community, cfg.dao);
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

async function refreshChecks(cfg: LiveConfig): Promise<void> {
  const rows = await Promise.all(
    cfg.assets.map(async (id) => {
      const [acct, keys] = await Promise.all([rpc.viewAccount(id), rpc.viewAccessKeyList(id)]);
      return { code: acct.code_hash, keys: keys.keys.length };
    }),
  );
  const hashes = new Set(rows.map((r) => r.code));
  const keyless = rows.every((r) => r.keys === 0);
  const set = (k: string, ok: boolean, text: string) => {
    const mark = document.querySelector(`[data-check="${k}"]`);
    const label = document.querySelector(`[data-check-text="${k}"]`);
    if (mark) mark.textContent = ok ? '✓' : '·';
    if (label) label.textContent = `${text} · live`;
  };
  set('keyless', keyless, keyless ? `0 access keys on all ${rows.length} asset accounts` : 'an asset account still has a key');
  const [only] = [...hashes];
  set('code', hashes.size === 1, hashes.size === 1 && only ? `code_hash ${shortHash(only)} × ${rows.length}` : `${hashes.size} different code hashes`);
}

export async function startLive(): Promise<void> {
  const el = document.getElementById('ck-live');
  if (!el?.textContent) return;
  const cfg = JSON.parse(el.textContent) as LiveConfig;
  const run = () => Promise.allSettled([refreshHero(cfg), refreshChecks(cfg)]);
  await run();
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void refreshHero(cfg).catch(() => undefined);
  }, 90_000);
}
