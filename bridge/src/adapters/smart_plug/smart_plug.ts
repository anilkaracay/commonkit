import { z } from "zod";
import { canonicalJson, sha256Hex } from "../../util/near.js";
import { secretFromEnv } from "../http.js";
import { AdapterState } from "../state.js";
import type { Adapter, AdapterContext, DeviceStatus, Gauges, Metrics, SessionContext, VerificationOutcome, VerificationTest } from "../types.js";
import { detectorStateSchema, initialDetector, stepDetector, type DetectorConfig } from "./cycles.js";
import { shellyGen1, shellyGen2, tasmota, type PlugDriver, type PlugReading } from "./drivers.js";

export const smartPlugConfigSchema = z.object({
  vendor: z.enum(["shelly_gen2", "shelly_gen1", "tasmota"]),
  base_url: z.url(),
  channel: z.number().int().min(0).max(3).default(0),
  user: z.string().optional(),
  password_env: z.string().optional(),
  /** Above this the device counts as running (W). */
  active_watts_threshold: z.number().nonnegative().default(5),
  min_cycle_seconds: z.number().nonnegative().default(60),
  idle_grace_seconds: z.number().nonnegative().default(30),
  /** cycle: the session ends when a cycle ends (washer). manual: holder or deadline ends it (laser, lamp). */
  session_end: z.enum(["manual", "cycle"]).default("manual"),
  poll_ms: z.number().int().positive().default(2_000),
  /** false = the bridge drives polls (tests); true = a 1-5 s loop runs inside the adapter (BRIDGE §4.3). */
  auto_poll: z.boolean().default(true),
  /** Emulated devices only: device seconds per local second. */
  time_scale: z.number().positive().default(1),
  /** Expose the plug's internal temperature as the gauge `temperature_c` (D-410). */
  report_temperature: z.boolean().default(false),
});
export type SmartPlugConfig = z.infer<typeof smartPlugConfigSchema>;

const stateSchema = z.object({
  detector: detectorStateSchema,
  current: z.object({ session_id: z.string(), cycles_at_unlock: z.number().int().nonnegative() }).nullable(),
});
type State = z.infer<typeof stateSchema>;

/**
 * Any electric device behind a smart plug (BRIDGE §4.3). lock = power off, unlock = power on, both
 * verified by reading the relay back (a stuck relay is an error, never a silent success).
 * Safety: dangerous assets are gated in config (D-408); the demo laser is an emulated lamp-class load.
 */
export class SmartPlugAdapter implements Adapter {
  readonly kind = "smart_plug";
  readonly simulated = false;
  private readonly driver: PlugDriver;
  private readonly state: AdapterState<State>;
  private readonly det: DetectorConfig;
  private last: PlugReading | null = null;
  private timer: NodeJS.Timeout | null = null;
  private polling: Promise<PlugReading> | null = null;

  constructor(
    private readonly config: SmartPlugConfig,
    private readonly ctx: AdapterContext,
  ) {
    const password = secretFromEnv(ctx.env, config.password_env, "smart plug password");
    const opts = {
      baseUrl: config.base_url,
      channel: config.channel,
      credentials: config.user && password ? { user: config.user, password } : null,
    };
    this.driver = config.vendor === "shelly_gen2" ? shellyGen2(opts) : config.vendor === "shelly_gen1" ? shellyGen1(opts) : tasmota(opts);
    this.state = new AdapterState(ctx.stateDir, ctx.assetId, "smart_plug", stateSchema, { detector: initialDetector(), current: null });
    this.det = {
      activeWatts: config.active_watts_threshold,
      minCycleSeconds: config.min_cycle_seconds,
      idleGraceSeconds: config.idle_grace_seconds,
      timeScale: config.time_scale,
      maxGapSec: ((config.poll_ms * 5) / 1000) * config.time_scale,
    };
  }

  async init(): Promise<void> {
    await this.state.load();
    if (!this.state.value.current) await this.switchTo(false); // fail closed
    await this.pollOnce();
    if (this.config.auto_poll) {
      this.timer = setInterval(() => void this.pollOnce().catch(() => undefined), this.config.poll_ms);
      this.timer.unref();
    }
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One sample: read the plug and feed the cycle detector (persisted). Concurrent callers share it. */
  pollOnce(): Promise<PlugReading> {
    this.polling ??= (async () => {
      try {
        const r = await this.driver.read();
        const { state } = stepDetector(this.state.value.detector, this.det, { atMs: this.ctx.clock.now(), watts: r.watts });
        this.state.value.detector = state;
        await this.state.save();
        this.last = r;
        return r;
      } finally {
        this.polling = null;
      }
    })();
    return this.polling;
  }

  async status(): Promise<DeviceStatus> {
    try {
      const r = await this.driver.read();
      return {
        online: true,
        locked: !r.on,
        busy: r.on || this.state.value.current !== null,
        details: { vendor: this.config.vendor, relay_on: r.on, watts: r.watts },
      };
    } catch (err) {
      return { online: false, locked: !(this.last?.on ?? false), busy: false, details: { error: (err as Error).message } };
    }
  }

  async unlock(session: SessionContext): Promise<void> {
    const cur = this.state.value.current;
    if (cur?.session_id === session.sessionId) {
      await this.switchTo(true);
      return;
    }
    if (cur) throw new Error(`plug busy with session ${cur.session_id}`);
    await this.pollOnce();
    this.state.value.current = { session_id: session.sessionId, cycles_at_unlock: this.state.value.detector.cycles };
    await this.state.save();
    try {
      await this.switchTo(true);
    } catch (err) {
      this.state.value.current = null;
      await this.state.save();
      throw err;
    }
  }

  async lock(): Promise<void> {
    await this.switchTo(false);
    await this.pollOnce();
    this.state.value.current = null;
    await this.state.save();
  }

  async readMetrics(): Promise<Metrics> {
    const r = await this.pollOnce();
    const d = this.state.value.detector;
    return {
      energy_wh: BigInt(Math.floor(r.energyWh)),
      run_seconds: BigInt(Math.floor(d.runSeconds)),
      cycles: BigInt(d.cycles),
    };
  }

  async readGauges(): Promise<Gauges> {
    if (!this.config.report_temperature) return {};
    const r = await this.pollOnce();
    return r.temperatureC === null ? {} : { temperature_c: r.temperatureC };
  }

  async sessionDone(session: SessionContext): Promise<boolean> {
    const cur = this.state.value.current;
    if (!cur || cur.session_id !== session.sessionId) return true;
    if (this.config.session_end === "manual") return false;
    await this.pollOnce();
    return this.state.value.detector.cycles > cur.cycles_at_unlock;
  }

  async runVerification(test: VerificationTest): Promise<VerificationOutcome> {
    if (test.type !== "power_profile") throw new Error(`smart_plug cannot run a ${test.type} test`);
    if (this.state.value.current) throw new Error("plug busy with a session");
    const before = await this.pollOnce();
    await this.switchTo(true);
    const samples: number[] = [];
    const start = this.ctx.clock.now();
    try {
      while (((this.ctx.clock.now() - start) / 1000) * this.config.time_scale < test.expect.seconds) {
        await this.ctx.clock.sleep(this.config.poll_ms);
        samples.push((await this.pollOnce()).watts);
      }
    } finally {
      await this.switchTo(false);
    }
    const after = await this.pollOnce();
    const measured = samples.slice(1); // ignore the inrush sample
    const inRange = measured.every((w) => w >= test.expect.min_watts && w <= test.expect.max_watts);
    const details = {
      adapter: "smart_plug",
      vendor: this.config.vendor,
      asset_id: this.ctx.assetId,
      test,
      samples: samples.length,
      min_w: measured.length ? Math.min(...measured) : null,
      max_w: measured.length ? Math.max(...measured) : null,
      avg_w: measured.length ? Math.round((measured.reduce((a, b) => a + b, 0) / measured.length) * 10) / 10 : null,
      energy_wh_delta: Math.round((after.energyWh - before.energyWh) * 1000) / 1000,
    };
    return { passed: measured.length >= 2 && inRange, details, detailsHash: sha256Hex(canonicalJson(details)) };
  }

  /** Switch and read back; a relay that does not follow is an error ("stuck"). */
  private async switchTo(on: boolean): Promise<void> {
    await this.driver.set(on);
    const r = await this.driver.read();
    this.last = r;
    if (r.on !== on) throw new Error(`relay stuck: commanded ${on ? "on" : "off"}, device reports ${r.on ? "on" : "off"}`);
  }
}
