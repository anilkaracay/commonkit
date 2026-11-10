import type { Logger } from "pino";
import { AccessVerifier } from "./access/verifier.js";
import { createAdapter, type AdapterFactory } from "./adapters/registry.js";
import type { Adapter } from "./adapters/types.js";
import { ChainClock } from "./chain/clock.js";
import type { ChainClient } from "./chain/types.js";
import type { BridgeConfig } from "./config.js";
import { EventBus, EvidenceLog } from "./events/bus.js";
import { ChallengeStore, recipientFor } from "./nep413/challenge.js";
import type { AssetRuntime } from "./runtime.js";
import { SessionManager } from "./sessions/manager.js";
import { CounterStore } from "./telemetry/counters.js";
import { GaugeTracker } from "./telemetry/gauges.js";
import { TelemetryLoop } from "./telemetry/loop.js";
import { systemClock, type LocalClock } from "./util/clock.js";
import { labelled } from "./util/log.js";
import { KeyedMutex } from "./util/mutex.js";
import { VerificationRunner } from "./verification/runner.js";

export interface BridgeOptions {
  config: BridgeConfig;
  chain: ChainClient;
  logger: Logger;
  clock?: LocalClock;
  /** Wall clock for event timestamps and evidence file names. */
  wallNow?: () => number;
  /** Override adapter construction (tests). */
  adapterFactory?: AdapterFactory;
  /** Deterministic nonces (tests). */
  random?: (n: number) => Uint8Array;
  retry?: { attempts: number; baseDelayMs: number };
  /** Chain-time cache window in ms (0 = always ask the chain). */
  chainClockMaxAgeMs?: number;
  /** Environment for adapter secrets (`*_env` in adapter_config). Default process.env. */
  env?: NodeJS.ProcessEnv;
}

/** The whole bridge minus HTTP: build with createBridge, then init(), start(), stop(). */
export class Bridge {
  readonly config: BridgeConfig;
  readonly chain: ChainClient;
  readonly chainClock: ChainClock;
  readonly clock: LocalClock;
  readonly logger: Logger;
  readonly bus: EventBus;
  readonly recipient: string;
  readonly challenges: ChallengeStore;
  readonly assets = new Map<string, AssetRuntime>();
  readonly verifier: AccessVerifier;
  readonly sessions: SessionManager;
  readonly telemetry: TelemetryLoop;
  readonly verification: VerificationRunner;
  private timers: NodeJS.Timeout[] = [];
  private readonly busy = new Set<string>();

  constructor(o: BridgeOptions) {
    this.config = o.config;
    this.chain = o.chain;
    this.clock = o.clock ?? systemClock;
    this.logger = o.logger;
    this.chainClock = new ChainClock(o.chain, this.clock, o.chainClockMaxAgeMs ?? 5_000);
    this.bus = new EventBus(o.logger, new EvidenceLog(o.config.evidence_dir, o.wallNow), o.wallNow);
    this.recipient = recipientFor(o.config.bridge_account);
    const challengeOpts = { recipient: this.recipient, ttlSec: o.config.challenge_ttl_sec };
    this.challenges = new ChallengeStore(o.random ? { ...challengeOpts, random: o.random } : challengeOpts);
    const fakeChain = o.chain.kind === "fake";
    const factory = o.adapterFactory ?? createAdapter;

    for (const a of o.config.assets) {
      // Known before construction: simulator adapter, emulated device, or fake chain.
      const simulated = a.adapter === "simulator" || a.emulated_device || fakeChain;
      const logger = labelled(o.logger, simulated, { asset_id: a.asset_id });
      const adapter: Adapter = factory(a, {
        assetId: a.asset_id,
        stateDir: o.config.state_dir,
        clock: this.clock,
        logger,
        configDir: o.config.configDir,
        env: o.env ?? process.env,
      });
      if (adapter.simulated && !simulated) throw new Error(`adapter ${adapter.kind} is simulated but was not labelled`);
      this.assets.set(a.asset_id, {
        config: a,
        adapter,
        counters: new CounterStore(a.asset_id, o.config.state_dir),
        gauges: new GaugeTracker(a.asset_id, o.config.state_dir, a.gauges),
        simulated,
        logger,
        occupancy: null,
      });
    }

    const mutex = new KeyedMutex();
    this.verifier = new AccessVerifier(this.challenges, o.chain, this.chainClock, this.bus, (id) => this.isSimulated(id));
    this.sessions = new SessionManager({
      assets: this.assets,
      chain: o.chain,
      chainClock: this.chainClock,
      localClock: this.clock,
      bus: this.bus,
      chainMutex: mutex,
      stateDir: o.config.state_dir,
      ...(o.retry ? { retry: o.retry } : {}),
    });
    this.telemetry = new TelemetryLoop(this.assets, o.chain, this.bus, mutex);
    this.verification = new VerificationRunner(this.assets, o.chain, this.bus, mutex, this.clock, o.retry);
  }

  isSimulated(assetId: string): boolean {
    return this.assets.get(assetId)?.simulated ?? this.chain.kind === "fake";
  }

  /** Initialises adapters (locked), restores counters and sessions, aligns counters with the chain. */
  async init(): Promise<void> {
    for (const rt of this.assets.values()) {
      await rt.adapter.init();
      await rt.counters.load();
      await rt.gauges.load();
      try {
        const onChain = await this.chain.getTelemetry(rt.config.asset_id);
        await rt.counters.seedFromChain(onChain.metrics);
      } catch (err) {
        rt.logger.warn({ err: (err as Error).message }, "could not read on-chain telemetry at startup");
      }
    }
    await this.sessions.load();
    this.bus.emit({
      type: "bridge_started",
      assetId: null,
      simulated: this.chain.kind === "fake" || [...this.assets.values()].some((a) => a.simulated),
      data: {
        bridge_account: this.config.bridge_account,
        chain: this.chain.kind,
        recipient: this.recipient,
        assets: [...this.assets.values()].map((a) => ({
          asset_id: a.config.asset_id,
          adapter: a.adapter.kind,
          device: a.config.adapter === "simulator" ? "simulator" : a.config.emulated_device ? "emulated" : "real",
          simulated: a.simulated,
          stand_in: a.config.safety.stand_in ?? null,
        })),
      },
    });
  }

  /** Starts the per-asset telemetry and session-watch loops (real timers). */
  start(): void {
    for (const rt of this.assets.values()) {
      const id = rt.config.asset_id;
      this.every(rt.config.telemetry_interval_sec * 1000, `telemetry:${id}`, () => this.telemetry.tickOnce(id));
    }
    // One watcher for all sessions (non-overlapping), at the fastest configured poll rate.
    const pollMs = Math.min(...[...this.assets.values()].map((a) => a.config.session_poll_sec)) * 1000;
    this.every(pollMs, "sessions", () => this.sessions.pollOnce());
  }

  async stop(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    for (const rt of this.assets.values()) await rt.adapter.close?.();
    await this.bus.flush();
  }

  private every(ms: number, key: string, fn: () => Promise<unknown>): void {
    const t = setInterval(() => {
      if (this.busy.has(key)) return; // never overlap a slow tick
      this.busy.add(key);
      fn()
        .catch((err: unknown) =>
          labelled(this.logger, this.chain.kind === "fake").error({ err: (err as Error).message, loop: key }, "loop tick failed"),
        )
        .finally(() => this.busy.delete(key));
    }, ms);
    t.unref();
    this.timers.push(t);
  }
}
