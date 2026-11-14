// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { LIST_TTL_MS, VIEW_TTL_MS, ViewCache, ttlFor } from '../data/rpc/cache';
import { throttledFetch } from '../data/rpc/throttle';

describe('view cache', () => {
  it('does not restore stale in-flight data after a confirmed transaction clears the cache', async () => {
    const cache = new ViewCache(() => 0);
    let finish!: (value: number) => void;
    const old = cache.get('task', 'get_tasks', () => new Promise<number>((resolve) => { finish = resolve; }));
    cache.clear();
    expect(await cache.get('task', 'get_tasks', async () => 2)).toBe(2);
    finish(1);
    expect(await old).toBe(1);
    expect(await cache.get('task', 'get_tasks', async () => 3)).toBe(2);
  });
  it('coalesces identical calls in flight and reuses results within the TTL', async () => {
    let now = 0;
    const cache = new ViewCache(() => now);
    const load = vi.fn(async () => 42);
    const [a, b] = await Promise.all([cache.get('k', 'get_ledger', load), cache.get('k', 'get_ledger', load)]);
    expect([a, b]).toEqual([42, 42]);
    expect(load).toHaveBeenCalledTimes(1);
    now = VIEW_TTL_MS - 1;
    await cache.get('k', 'get_ledger', load);
    expect(load).toHaveBeenCalledTimes(1);
    now = VIEW_TTL_MS + 1;
    await cache.get('k', 'get_ledger', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('gives lists at least 30 s and single views at least 10 s; never caches errors', async () => {
    expect(ttlFor('get_tasks')).toBeGreaterThanOrEqual(30_000);
    expect(LIST_TTL_MS).toBeGreaterThanOrEqual(30_000);
    expect(ttlFor('get_wiring')).toBeGreaterThanOrEqual(10_000);
    const cache = new ViewCache(() => 0);
    const load = vi.fn().mockRejectedValueOnce(new Error('429')).mockResolvedValueOnce(1);
    await expect(cache.get('x', 'get_wiring', load)).rejects.toThrow('429');
    await expect(cache.get('x', 'get_wiring', load)).resolves.toBe(1);
  });
});

describe('throttled fetch', () => {
  it('retries a 429 with backoff and then returns the success', async () => {
    vi.useFakeTimers();
    const base = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const f = throttledFetch(1, 3, 1000, base as unknown as typeof fetch);
    const p = f('http://rpc.invalid', {});
    await vi.runAllTimersAsync();
    expect((await p).status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

it('keeps healthy traffic on the primary instead of probing fallbacks on every view', async () => {
  const base = vi.fn<typeof fetch>(async () => new Response('ok'));
  const f = throttledFetch(2, 2, 100_000, base as typeof fetch, ['https://backup.invalid']);
  await Promise.all([f('https://primary.invalid'), f('https://primary.invalid')]);
  expect(base.mock.calls.map((call) => call[0])).toEqual(['https://primary.invalid', 'https://primary.invalid']);
});

it('times out a stalled provider and releases the queue for later reads', async () => {
  vi.useFakeTimers();
  try {
    let first = true;
    const base: typeof fetch = vi.fn(async (_input, init) => {
      if (!first) return new Response('recovered');
      first = false;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    });
    const f = throttledFetch(1, 0, 1000, base, [], 20);
    const timedOut = f('https://primary.invalid').catch((e: unknown) => e);
    const next = f('https://primary.invalid');
    await vi.runAllTimersAsync();
    expect(await timedOut).toMatchObject({ name: 'TimeoutError' });
    expect(await (await next).text()).toBe('recovered');
  } finally { vi.useRealTimers(); }
});
