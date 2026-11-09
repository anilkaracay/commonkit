import type { LocalClock } from "./clock.js";

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  clock: LocalClock;
  onError?: (err: unknown, attempt: number) => void;
  /** Return false to stop immediately (e.g. a deterministic contract panic). Default: always retry. */
  retryable?: (err: unknown) => boolean;
}

/** Exponential backoff: baseDelay, 2x, 4x ... Throws the last error. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      opts.onError?.(err, attempt);
      if (opts.retryable && !opts.retryable(err)) break;
      if (attempt < opts.attempts) await opts.clock.sleep(opts.baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}
