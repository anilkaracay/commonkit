import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { canonicalJson, sha256Hex } from "../../util/near.js";
import { readStateFile, safeName, writeStateFile } from "../../util/state-file.js";
import {
  AdapterOfflineError,
  type Adapter,
  type AdapterContext,
  type DeviceStatus,
  type Metrics,
  type SessionContext,
  type VerificationOutcome,
  type VerificationTest,
} from "../types.js";
import { loadScenario, type Scenario } from "./scenario.js";

export const simulatorConfigSchema = z.object({
  /** Path to the scenario file, relative to the config file directory. */
  scenario: z.string().min(1),
  /** Overrides the scenario speed (simulated seconds per real second). */
  speed: z.number().positive().max(100_000).optional(),
  /** Overrides the scenario seed. */
  seed: z.number().int().nonnegative().optional(),
});
export type SimulatorConfig = z.infer<typeof simulatorConfigSchema>;

/** Label metric added to every simulated report so the chain record itself says "simulated". */
export const SIMULATED_METRIC = "simulated";

const bigintString = z.string().regex(/^\d+$/).transform((s) => BigInt(s));

const activeSessionSchema = z.object({
  session_id: z.string(),
  index: z.number().int().positive(),
  start_sim_sec: z.number().nonnegative(),
  duration_sec: z.number().positive(),
  /** If set, the session errors after this many simulated seconds. */
  error_after_sec: z.number().positive().optional(),
  error_add: z.record(z.string(), z.number().int().nonnegative()).default({}),
});
type ActiveSession = z.infer<typeof activeSessionSchema>;

const simStateSchema = z.object({
  scenario: z.string(),
  /** Local ms when this simulated device was first started; defines simulated time zero. */
  epoch_local_ms: z.number(),
  committed: z.record(z.string(), bigintString),
  sessions_started: z.number().int().nonnegative(),
  verification_runs: z.number().int().nonnegative(),
  active: activeSessionSchema.nullable(),
  locked: z.boolean(),
});
type SimState = z.infer<typeof simStateSchema>;

/** mulberry32: tiny deterministic PRNG, good enough for jitter. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Scenario-driven device. Deterministic for a given seed and clock.
 * Everything it produces is labelled simulated.
 */
export class SimulatorAdapter implements Adapter {
  readonly kind = "simulator";
  readonly simulated = true;

  private scenario!: Scenario;
  private state!: SimState;
  private speed = 1;
  private seed = 0;
  private verifying = false;
  private readonly statePath: string;

  constructor(
    private readonly config: SimulatorConfig,
    private readonly ctx: AdapterContext,
    scenario?: Scenario,
  ) {
    if (scenario) this.scenario = scenario;
    this.statePath = join(ctx.stateDir, `${safeName(ctx.assetId)}.simulator.json`);
  }

  async init(): Promise<void> {
    if (!this.scenario) {
      const p = isAbsolute(this.config.scenario) ? this.config.scenario : resolve(this.ctx.configDir, this.config.scenario);
      this.scenario = await loadScenario(p);
    }
    this.speed = this.config.speed ?? this.scenario.speed;
    this.seed = this.config.seed ?? this.scenario.seed;
    const saved = await readStateFile(this.statePath, simStateSchema);
    if (saved && saved.scenario === this.scenario.scenario) {
      this.state = saved;
    } else {
      this.state = {
        scenario: this.scenario.scenario,
        epoch_local_ms: this.ctx.clock.now(),
        committed: {},
        sessions_started: 0,
        verification_runs: 0,
        active: null,
        locked: true,
      };
    }
    // Fail closed: a (re)started device is locked unless a session is still running.
    if (!this.state.active) this.state.locked = true;
    await this.persist();
    this.ctx.logger.info(
      { simulated: true, scenario: this.scenario.scenario, speed: this.speed, seed: this.seed },
      "simulator adapter ready",
    );
  }

  async status(): Promise<DeviceStatus> {
    const t = this.simNowSec();
    return {
      online: !this.isOffline(t),
      locked: this.state.locked,
      busy: this.state.active !== null || this.verifying,
      details: {
        simulated: true,
        scenario: this.scenario.scenario,
        speed: this.speed,
        sim_time_sec: Math.floor(t),
        sessions_started: this.state.sessions_started,
        verification_runs: this.state.verification_runs,
        active_session: this.state.active?.session_id ?? null,
      },
    };
  }

  async lock(): Promise<void> {
    const active = this.state.active;
    if (active) {
      const add = this.sessionContribution(active, this.simNowSec(), true);
      for (const [m, v] of Object.entries(add)) {
        this.state.committed[m] = (this.state.committed[m] ?? 0n) + v;
      }
      this.state.active = null;
    }
    this.state.locked = true;
    await this.persist();
  }

  async unlock(session: SessionContext): Promise<void> {
    this.assertOnline();
    const active = this.state.active;
    if (active) {
      if (active.session_id === session.sessionId) return; // idempotent
      throw new Error(`simulator busy with session ${active.session_id}`);
    }
    if (this.verifying) throw new Error("simulator busy with a verification run");
    const index = this.state.sessions_started + 1;
    const rng = mulberry32((this.seed ^ Math.imul(index, 0x9e3779b1)) >>> 0);
    const jitter = (this.scenario.session.jitter_pct / 100) * (rng() * 2 - 1);
    const duration = Math.max(1, Math.round(this.scenario.session.duration_sec * (1 + jitter)));
    const failure = this.scenario.failures.find((f) => f.kind === "session_error" && f.session === index);
    const next: ActiveSession = {
      session_id: session.sessionId,
      index,
      start_sim_sec: this.simNowSec(),
      duration_sec: duration,
      error_add: {},
    };
    if (failure?.kind === "session_error") {
      next.error_after_sec = duration * failure.at_fraction;
      next.error_add = failure.add;
    }
    this.state.sessions_started = index;
    this.state.active = next;
    this.state.locked = false;
    await this.persist();
  }

  async readMetrics(): Promise<Metrics> {
    const t = this.simNowSec();
    if (this.isOffline(t)) throw new AdapterOfflineError("simulated device offline (scenario failure injection)");
    const running = this.state.active ? this.sessionContribution(this.state.active, t, false) : {};
    const out: Metrics = {};
    for (const [name, curve] of Object.entries(this.scenario.metrics)) {
      out[name] =
        BigInt(curve.initial) +
        BigInt(Math.floor((curve.idle_per_hour * t) / 3600)) +
        (this.state.committed[name] ?? 0n) +
        (running[name] ?? 0n);
    }
    out[SIMULATED_METRIC] = 1n;
    return out;
  }

  async sessionDone(session: SessionContext): Promise<boolean> {
    const active = this.state.active;
    if (!active || active.session_id !== session.sessionId) return true;
    const elapsed = this.simNowSec() - active.start_sim_sec;
    return elapsed >= (active.error_after_sec ?? active.duration_sec);
  }

  async runVerification(test: VerificationTest): Promise<VerificationOutcome> {
    this.assertOnline();
    if (this.state.active) throw new Error("simulator busy with a session");
    if (this.verifying) throw new Error("verification already running");
    this.verifying = true;
    try {
      const run = this.state.verification_runs + 1;
      this.state.verification_runs = run;
      await this.persist();
      const simDuration =
        test.type === "simulated" && test.duration_sec ? test.duration_sec : this.scenario.verification.duration_sec;
      await this.ctx.clock.sleep((simDuration * 1000) / this.speed);
      const injected = this.scenario.failures.some((f) => f.kind === "verification_fail" && f.run === run);
      const passed = injected ? false : this.scenario.verification.default === "pass";
      const details: Record<string, unknown> = {
        simulated: true,
        asset_id: this.ctx.assetId,
        scenario: this.scenario.scenario,
        seed: this.seed,
        run,
        test,
        sim_duration_sec: simDuration,
        passed,
        failure_injected: injected,
      };
      return { passed, details, detailsHash: sha256Hex(canonicalJson(details)) };
    } finally {
      this.verifying = false;
    }
  }

  private simNowSec(): number {
    return Math.max(0, ((this.ctx.clock.now() - this.state.epoch_local_ms) / 1000) * this.speed);
  }

  private isOffline(t: number): boolean {
    return this.scenario.failures.some((f) => f.kind === "offline" && t >= f.from_sec && t < f.until_sec);
  }

  private assertOnline(): void {
    if (this.isOffline(this.simNowSec())) throw new AdapterOfflineError("simulated device offline");
  }

  /**
   * Counters a session contributes at simulated time t.
   * Linear curves grow with progress; step curves only count a completed, error-free session.
   * `final` adds the error counters if the session errored.
   */
  private sessionContribution(s: ActiveSession, t: number, final: boolean): Record<string, bigint> {
    const end = s.error_after_sec ?? s.duration_sec;
    const elapsed = Math.min(Math.max(0, t - s.start_sim_sec), end);
    const fraction = elapsed / s.duration_sec;
    const errored = s.error_after_sec !== undefined && elapsed >= s.error_after_sec;
    const completed = !errored && elapsed >= s.duration_sec;
    const out: Record<string, bigint> = {};
    for (const [name, curve] of Object.entries(this.scenario.metrics)) {
      const v =
        curve.curve === "linear" ? Math.floor(curve.per_session * fraction) : completed ? curve.per_session : 0;
      out[name] = BigInt(v);
    }
    if (errored && final) {
      for (const [m, v] of Object.entries(s.error_add)) out[m] = (out[m] ?? 0n) + BigInt(v);
    }
    return out;
  }

  private async persist(): Promise<void> {
    await writeStateFile(this.statePath, {
      ...this.state,
      committed: Object.fromEntries(Object.entries(this.state.committed).map(([k, v]) => [k, v.toString()])),
    });
  }
}
