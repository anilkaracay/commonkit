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
) {
  let active = 0;
  let nextStart = 0;
  let counter = 0;
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

  return async (input: string, init?: RequestInit): Promise<Response> => {
    await acquire();
    // Spread request starts so a page load never bursts past the endpoint's rate limit.
    const now = Date.now();
    const wait = Math.max(0, nextStart - now);
    nextStart = Math.max(now, nextStart) + spacing;
    if (wait > 0) await sleep(wait);
    try {
      // Round-robin over the endpoints spreads a page load across their separate rate limits.
      const urls = [input, ...fallbacks.filter((u) => u !== input)];
      const first = counter++;
      for (let attempt = 0; ; attempt += 1) {
        const url = urls[(first + attempt) % urls.length] ?? input;
        let res: Response;
        try {
          res = await base(url, init);
        } catch (e) {
          // A rate-limited reply without CORS headers surfaces as a network TypeError.
          if (attempt >= retries) throw e;
          await sleep(500 * 2 ** attempt);
          continue;
        }
        if ((res.status !== 429 && res.status < 500) || attempt >= retries) return res;
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 500 * 2 ** attempt);
      }
    } finally {
      release();
    }
  };
}
