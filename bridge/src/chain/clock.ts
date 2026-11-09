import type { LocalClock } from "../util/clock.js";
import { NS_PER_MS } from "../util/near.js";
import type { ChainClient } from "./types.js";

/**
 * Chain time for window checks (BRIDGE §6). Fetches the final block timestamp and
 * extrapolates with the local clock for at most `maxAgeMs`, to avoid an RPC call per request.
 * Extrapolation never goes past the cache window, so drift is bounded by maxAgeMs.
 */
export class ChainClock {
  private cached: { chainNs: bigint; localMs: number } | null = null;

  constructor(
    private readonly chain: ChainClient,
    private readonly local: LocalClock,
    private readonly maxAgeMs = 5_000,
  ) {}

  async now(): Promise<bigint> {
    const localNow = this.local.now();
    if (this.cached && localNow - this.cached.localMs < this.maxAgeMs && localNow >= this.cached.localMs) {
      return this.cached.chainNs + BigInt(Math.floor(localNow - this.cached.localMs)) * NS_PER_MS;
    }
    const chainNs = await this.chain.getChainTime();
    this.cached = { chainNs, localMs: localNow };
    return chainNs;
  }

  /** Forces the next now() to hit the chain (used after long waits). */
  invalidate(): void {
    this.cached = null;
  }
}
