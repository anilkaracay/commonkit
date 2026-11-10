/**
 * Rate-limit guard for NEAR RPC calls (FastNEAR answers HTTP 429 when this IP is busy).
 * Wraps global fetch for NEAR RPC hosts only: requests are spaced out, and an HTTP 429 — refused
 * by the rate limiter before the node saw it, so a resend can never double-submit — is retried with
 * backoff. Loaded in the demo runner and preloaded into the bridge/agent child processes
 * (NODE_OPTIONS=--import). Every other request passes through untouched.
 */
const RPC_HOST = /(^|\.)((fastnear\.com)|(near\.org))$/;
const MIN_GAP_MS = Number(process.env.DEMO_RPC_MIN_GAP_MS ?? 120);
const MAX_WAIT_MS = Number(process.env.DEMO_RPC_MAX_WAIT_MS ?? 180_000);

const g = globalThis;
if (!g.__commonkitRpcThrottle) {
  g.__commonkitRpcThrottle = true;
  const original = g.fetch.bind(g);
  let next = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const slot = async () => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + MIN_GAP_MS;
    if (at > now) await sleep(at - now);
  };
  g.fetch = async (input, init) => {
    let host = '';
    try {
      host = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).hostname;
    } catch {
      return original(input, init);
    }
    if (!RPC_HOST.test(host)) return original(input, init);
    const started = Date.now();
    for (let attempt = 0; ; attempt++) {
      await slot();
      const res = await original(input, init);
      if (res.status !== 429 || Date.now() - started > MAX_WAIT_MS) return res;
      await res.arrayBuffer().catch(() => undefined);
      await sleep(Math.min(15_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250));
    }
  };
}
