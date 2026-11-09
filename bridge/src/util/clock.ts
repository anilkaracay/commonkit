/**
 * Local clock used only for scheduling (poll intervals, simulator speed, retries).
 * Never used for reservation or challenge windows: those use chain time (see ChainClock).
 */
export interface LocalClock {
  /** Monotonic-ish milliseconds. */
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: LocalClock = {
  now: () => performance.timeOrigin + performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Deterministic clock for tests and simulations: time moves only when advanced. */
export class ManualClock implements LocalClock {
  private t: number;
  constructor(startMs = 1_800_000_000_000) {
    this.t = startMs;
  }
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    if (ms < 0) throw new Error("ManualClock cannot go backwards");
    this.t += ms;
  }
  /** Sleeping on a manual clock advances it instantly. */
  async sleep(ms: number): Promise<void> {
    this.advance(ms);
    await Promise.resolve();
  }
}
