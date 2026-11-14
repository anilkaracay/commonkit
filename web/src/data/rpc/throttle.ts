/**
 * Polite fetch for public RPC: at most `concurrency` requests in flight, retry on 429/5xx with
 * backoff (honours Retry-After up to 5 s). Public endpoints rate-limit bursts; the board alone
 * issues ~70 views.
 */
export function throttledFetch(
  concurrency = 3,
  retries = 5,
  perSecond = 10,
  base: typeof fetch = (i, o) => fetch(i, o),
  /** Tried in turn after a rate-limit or network failure (D-106: FastNEAR first, rpc.testnet.near.org fallback). */
  fallbacks: string[] = [],
  attemptTimeoutMs = 8_000,
) {
  let active = 0;
  let nextStart = 0;
  const spacing = 1000 / perSecond;
  const queue: (() => void)[] = [];
  const acquire = () =>
    new Promise<void>((resolve) => {
      if (active < concurrency) {
        active += 1;
        resolve();
      } else queue.push(() => resolve());
    });
  const release = () => {
    const next = queue.shift();
    if (next) next();
    else active -= 1;
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /** Exponential backoff with full jitter: 0.5–1.5 × 600 ms × 2^attempt, capped at 15 s. */
  const backoff = (attempt: number) => Math.min(15_000, 600 * 2 ** attempt * (0.5 + Math.random()));

  return async (input: string, init?: RequestInit): Promise<Response> => {
    await acquire();
    // Spread request starts so a page load never bursts past the endpoint's rate limit.
    const now = Date.now();
    const wait = Math.max(0, nextStart - now);
    nextStart = Math.max(now, nextStart) + spacing;
    if (wait > 0) await sleep(wait);
    try {
      // A fallback is used only after a failure. Sending healthy traffic to every provider
      // made ordinary page loads depend on the least reliable provider's CORS behavior.
      const urls = [input, ...fallbacks.filter((u) => u !== input)];
      for (let attempt = 0; ; attempt += 1) {
        const url = urls[attempt % urls.length] ?? input;
        let res: Response;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new DOMException('RPC request timed out', 'TimeoutError')), attemptTimeoutMs);
        try {
          const signal = init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
          res = await base(url, { ...init, signal });
        } catch (e) {
          // A rate-limited reply without CORS headers surfaces as a network TypeError.
          if (init?.signal?.aborted || attempt >= retries) throw e;
          await sleep(backoff(attempt));
          continue;
        } finally {
          clearTimeout(timer);
        }
        if ((res.status !== 429 && res.status < 500) || attempt >= retries) return res;
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Math.max(backoff(attempt), Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 10_000) : 0));
      }
    } finally {
      release();
    }
  };
}
